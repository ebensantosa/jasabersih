import { describe, expect, it } from 'vitest';

import { normalizePhone } from '@jasabersih/shared-types';

describe('phone normalization', () => {
  it('converts 08xx → +628xx', () => {
    expect(normalizePhone('081234567890')).toBe('+6281234567890');
  });
  it('converts 8xx → +628xx', () => {
    expect(normalizePhone('81234567890')).toBe('+6281234567890');
  });
  it('keeps +62 prefix', () => {
    expect(normalizePhone('+6281234567890')).toBe('+6281234567890');
  });
  it('strips spaces and dashes', () => {
    expect(normalizePhone('+62 812-3456-7890')).toBe('+6281234567890');
  });
});
