import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeListener } from './realtime.listener';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [
    // Same secret and algorithm as the HTTP guard: one kind of access token everywhere.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimeListener, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
