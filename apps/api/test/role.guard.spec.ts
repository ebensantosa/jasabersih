import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CustomerGuard, CleanerGuard } from '../src/modules/auth/role.guard';

function makeCtx(user: Record<string, unknown> | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('CustomerGuard', () => {
  const guard = new CustomerGuard();

  it('allows user with isCustomer=true', () => {
    expect(guard.canActivate(makeCtx({ id: '1', phone: '+62812', isCustomer: true, isFreelancer: false }))).toBe(true);
  });

  it('blocks cleaner-only account (isCustomer=false)', () => {
    expect(() => guard.canActivate(makeCtx({ id: '1', phone: '+62812', isCustomer: false, isFreelancer: true })))
      .toThrow(ForbiddenException);
  });

  it('blocks unauthenticated (no user)', () => {
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });

  it('throws with code CUSTOMER_ONLY', () => {
    try {
      guard.canActivate(makeCtx({ isCustomer: false, isFreelancer: true }));
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.response?.code).toBe('CUSTOMER_ONLY');
    }
  });
});

describe('CleanerGuard', () => {
  const guard = new CleanerGuard();

  it('allows user with isFreelancer=true', () => {
    expect(guard.canActivate(makeCtx({ id: '1', phone: '+62812', isCustomer: false, isFreelancer: true }))).toBe(true);
  });

  it('blocks customer-only account (isFreelancer=false)', () => {
    expect(() => guard.canActivate(makeCtx({ id: '1', phone: '+62812', isCustomer: true, isFreelancer: false })))
      .toThrow(ForbiddenException);
  });

  it('blocks unauthenticated (no user)', () => {
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });

  it('throws with code CLEANER_ONLY', () => {
    try {
      guard.canActivate(makeCtx({ isCustomer: true, isFreelancer: false }));
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.response?.code).toBe('CLEANER_ONLY');
    }
  });
});
