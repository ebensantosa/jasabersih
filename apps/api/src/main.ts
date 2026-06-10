import 'reflect-metadata';

// Suppress AWS SDK Node version warning (not actionable until 2027) + any other noise.
// We still let real errors and unhandledRejection bubble up.
const originalEmit = process.emit.bind(process) as (event: string, ...args: any[]) => boolean;
process.emit = function (event: any, ...args: any[]) {
  if (event === 'warning' && args[0] && typeof args[0] === 'object') {
    const name = (args[0] as { name?: string }).name;
    if (name === 'NodeVersionSupportWarning' || name === 'DeprecationWarning') {
      return false;
    }
  }
  return originalEmit(event, ...args);
} as typeof process.emit;

// BigInt → string saat JSON.stringify (Postgres BIGINT via $queryRaw return BigInt).
// Frontend coerce ke Number/string sesuai konteks.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw, urlencoded } from 'body-parser';

import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
import { AllExceptionsFilter } from './common/exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  // Tripay webhook butuh raw body untuk verifikasi HMAC signature
  app.use('/v1/payments/callback', raw({ type: '*/*' }));
  // Flip webhook POSTs application/x-www-form-urlencoded
  app.use('/v1/payments/flip/callback', urlencoded({ extended: true, limit: '1mb' }));
  // Default JSON parser untuk semua route lain
  app.use(json({ limit: '5mb' }));

  // CORS allow: production domain + localhost (aman karena localhost gak bisa di-spoof).
  // Bisa di-override via env CORS_ORIGINS (comma-separated).
  const defaultOrigins =
    'https://dashboard.jasabersih.com,http://localhost:3001,http://localhost:8081,http://localhost:8082,http://localhost:19006';
  const corsOrigins = (process.env.CORS_ORIGINS ?? defaultOrigins)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // /v1 prefix for API; /r/* (referral landing) excluded so URL stays short & shareable
  app.setGlobalPrefix('v1', { exclude: ['r/:code'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('JasaBersih API')
    .setDescription('JasaBersih.com REST API — versioned /v1')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  // Security fail-safe: gak boleh production + AUTH_DEV_MODE=true bareng (bocorin OTP plaintext).
  if (process.env.NODE_ENV === 'production' && process.env.AUTH_DEV_MODE === 'true') {
    // eslint-disable-next-line no-console
    console.error('[api][FATAL] AUTH_DEV_MODE=true tidak boleh aktif di production. Refusing to start.');
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.warn(`[api] listening on http://localhost:${port} (docs: /docs)`);
}

void bootstrap();
