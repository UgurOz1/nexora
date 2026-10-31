import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { Env } from '../../config/env';

export interface GoogleAuthorization {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

// Authorization Code flow with PKCE: our server sends the user to Google, Google sends them back
// with a one-time `code`, and only our server (which knows the client secret) can exchange it.
@Injectable()
export class GoogleAuthService {
  private readonly client?: OAuth2Client;
  private readonly clientId?: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    if (this.clientId && clientSecret) {
      this.client = new OAuth2Client({
        clientId: this.clientId,
        clientSecret,
        redirectUri: config.get('GOOGLE_REDIRECT_URI', { infer: true }),
      });
    }
  }

  async createAuthorization(): Promise<GoogleAuthorization> {
    const client = this.requireClient();
    // state ties the callback to the browser that started the flow (blocks login CSRF);
    // the PKCE verifier proves the party exchanging the code is the one that asked for it.
    const state = randomBytes(24).toString('base64url');
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      // Always show the account chooser instead of silently reusing the last Google account.
      prompt: 'select_account',
    });
    return { url, state, codeVerifier };
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const client = this.requireClient();
    try {
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (!tokens.id_token) {
        throw new Error('Google did not return an id_token');
      }
      // Verifies signature (Google's public keys), expiry, issuer and that the token was issued for us.
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new Error('Google profile is missing sub or email');
      }
      return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name?.trim() || payload.email.split('@')[0],
      };
    } catch {
      throw new UnauthorizedException('Google sign-in failed');
    }
  }

  private requireClient(): OAuth2Client {
    if (!this.client) {
      throw new NotFoundException('Google sign-in is not configured');
    }
    return this.client;
  }
}
