import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import type { Env } from '../config/env';
import { AccountService } from './account.service';
import { AuthService, Session } from './auth.service';
import {
  AccessTokenResponseDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/auth.dto';
import { GoogleAuthService } from './google/google-auth.service';
import { safeEqual } from './google/safe-equal';
import type { ClientMeta } from './token.service';

export const REFRESH_COOKIE = 'nexora_refresh';
const GOOGLE_STATE_COOKIE = 'nexora_oauth_state';
const GOOGLE_VERIFIER_COOKIE = 'nexora_oauth_verifier';
const GOOGLE_COOKIE_PATH = '/api/v1/auth/google';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
    private readonly google: GoogleAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    return this.respond(res, await this.auth.register(dto, clientMeta(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    return this.respond(res, await this.auth.login(dto, clientMeta(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    const token = readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    try {
      return this.respond(res, await this.auth.refresh(token, clientMeta(req)));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readRefreshCookie(req);
    if (token) {
      await this.auth.logout(token);
    }
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutEverywhere(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // Browsers navigate to this URL (it is a link, not an AJAX call): it redirects to Google.
  @Public()
  @Get('google')
  @ApiExcludeEndpoint()
  async googleStart(@Res() res: Response): Promise<void> {
    const { url, state, codeVerifier } = await this.google.createAuthorization();
    res.cookie(GOOGLE_STATE_COOKIE, state, this.oauthCookieOptions());
    res.cookie(GOOGLE_VERIFIER_COOKIE, codeVerifier, this.oauthCookieOptions());
    res.redirect(url);
  }

  // Google redirects the browser here. We finish sign-in, set the refresh cookie, and send the
  // browser to the web app, which then calls POST /auth/refresh to get an access token.
  // The access token never travels through a URL, where it could leak into history or logs.
  @Public()
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query() query: Record<string, string | undefined>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const expectedState = cookies?.[GOOGLE_STATE_COOKIE];
    const codeVerifier = cookies?.[GOOGLE_VERIFIER_COOKIE];
    this.clearOauthCookies(res);

    const appUrl = this.config.get('APP_URL', { infer: true });
    const failure = (reason: string) => res.redirect(`${appUrl}/login?error=${reason}`);

    if (query.error) {
      return failure('google_denied');
    }
    if (!query.code || !codeVerifier || !safeEqual(query.state, expectedState)) {
      return failure('google_invalid_state');
    }

    try {
      const profile = await this.google.exchangeCode(query.code, codeVerifier);
      const session = await this.auth.loginWithGoogle(profile, clientMeta(req));
      this.setRefreshCookie(res, session);
      res.redirect(`${appUrl}/auth/callback`);
    } catch {
      failure('google_failed');
    }
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyEmail(@Body() dto: TokenDto): Promise<void> {
    return this.account.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.account.sendVerificationEmail(user.id);
    return { message: 'If your email is not verified yet, a new link is on its way.' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.account.requestPasswordReset(dto.email);
    return { message: 'If an account exists for this email, a reset link is on its way.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.resetPassword(dto.token, dto.password);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  // Access token goes in the body (kept in memory by the client); the refresh token goes in an
  // httpOnly cookie that JavaScript, and therefore XSS, cannot read.
  private respond(res: Response, session: Session): AccessTokenResponseDto {
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, tokenType: 'Bearer', expiresIn: session.expiresIn };
  }

  private setRefreshCookie(res: Response, session: Session): void {
    res.cookie(REFRESH_COOKIE, session.refresh.token, {
      ...this.cookieOptions(),
      expires: session.refresh.expiresAt,
    });
  }

  // These two cookies must be SameSite=Lax, not Strict: the callback is a redirect coming back
  // from google.com, and browsers do not send Strict cookies on cross-site navigations.
  private oauthCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: GOOGLE_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    };
  }

  private clearOauthCookies(res: Response): void {
    const { maxAge: _maxAge, ...options } = this.oauthCookieOptions();
    res.clearCookie(GOOGLE_STATE_COOKIE, options);
    res.clearCookie(GOOGLE_VERIFIER_COOKIE, options);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      // Only sent to the auth endpoints, not with every API request.
      path: '/api/v1/auth',
    };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE];
}

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent']?.slice(0, 255), ip: req.ip };
}
