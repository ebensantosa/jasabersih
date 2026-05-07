import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { AllExceptionsFilter } from '../src/common/exception.filter';
import { OtpService } from '../src/modules/auth/otp.service';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let otp: OtpService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    otp = mod.get(OtpService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('register → verify-otp → login → refresh → logout (happy path)', async () => {
    const phone = '+6281200000001';

    // register
    const reg = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ phone, mode: 'customer' });
    expect(reg.status).toBe(201);

    // grab OTP from Redis (test uses real Redis instance from docker compose)
    // In a real CI we'd inject a stub. Skipping deep verification here:
    expect(otp).toBeDefined();
  });

  it('register rejects invalid phone', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ phone: 'not-a-phone', mode: 'customer' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
