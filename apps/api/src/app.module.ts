import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { genRequestId } from './common/logging/request-id';
import { Env, validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Single .env at the repo root, shared with docker compose.
      envFilePath: resolve(__dirname, '../../../.env'),
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === 'production' ? 'info' : 'debug',
            // JSON lines in production (for log tools), readable single lines locally.
            transport:
              nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            genReqId: genRequestId,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            autoLogging: { ignore: (req) => req.url === '/api/health' },
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
