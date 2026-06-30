import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * Global typed configuration. Loads the root .env and validates it.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Load the monorepo root .env (api runs from apps/api).
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
