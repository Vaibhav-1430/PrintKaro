import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseInterceptor } from './common/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const logger = new Logger('Bootstrap');

  const port = Number(process.env.PORT ?? 4000);
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Trust a single proxy hop (Render/Vercel) for correct client IPs + secure cookies.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Security headers. CSP is configured conservatively; the API serves JSON only.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    // Better Auth handler bodies are arbitrary; class-validator only guards
    // class-DTO routes. Zod validates our explicit DTOs via ZodValidationPipe.
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Wrap responses in the success envelope, except the Better Auth handler,
  // which manages its own response shape.
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Print Karo API listening on http://localhost:${port}`);
  logger.log(`Health: http://localhost:${port}/health  ·  Ready: http://localhost:${port}/ready`);
}

void bootstrap();
