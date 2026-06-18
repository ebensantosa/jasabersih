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
import { json, raw, urlencoded, type Request, type Response, type NextFunction } from 'express';

import { AppModule } from './app.module';
import { getAllowedOrigins, isAllowedOrigin } from './common/cors';
import { ResponseInterceptor } from './common/response.interceptor';
import { AllExceptionsFilter } from './common/exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const http = app.getHttpAdapter().getInstance();

  // Tripay webhook butuh raw body untuk verifikasi HMAC signature
  app.use('/v1/payments/callback', raw({ type: '*/*' }));
  // Flip webhooks POST application/x-www-form-urlencoded - perlu urlencoded
  // parser di SEMUA endpoint Flip callback, kalau gak req.body kosong dan
  // handler return ping:true terus -> webhook 'sukses' tapi gak ada side effect.
  app.use('/v1/payments/flip/callback', urlencoded({ extended: true, limit: '1mb' }));
  app.use('/v1/payments/flip/disbursement-callback', urlencoded({ extended: true, limit: '1mb' }));
  app.use('/v1/payments/flip/bank-status', urlencoded({ extended: true, limit: '1mb' }));
  app.use('/v1/payments/flip/inquiry-callback', urlencoded({ extended: true, limit: '1mb' }));
  // Default JSON parser untuk semua route lain
  app.use(json({ limit: '5mb' }));
  http.set('trust proxy', process.env.TRUST_PROXY ?? 1);
  http.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  });

  // CORS allow: production domain + localhost (aman karena localhost gak bisa di-spoof).
  // Bisa di-override via env CORS_ORIGINS (comma-separated).
  const corsOrigins = getAllowedOrigins();
  app.enableCors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)),
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
  // Swagger /docs HANYA di non-production - biar shape endpoint gak ke-leak ke publik
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc);
  }

  // Security fail-safe: gak boleh production + AUTH_DEV_MODE=true bareng (bocorin OTP plaintext).
  if (process.env.NODE_ENV === 'production' && process.env.AUTH_DEV_MODE === 'true') {
    // eslint-disable-next-line no-console
    console.error('[api][FATAL] AUTH_DEV_MODE=true tidak boleh aktif di production. Refusing to start.');
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.warn(`[api] listening on http://${host}:${port} (docs: /docs)`);
}

void bootstrap();
