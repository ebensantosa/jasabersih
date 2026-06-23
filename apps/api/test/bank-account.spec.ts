import { describe, expect, it } from 'vitest';

// Name matching logic from cleaner-bank-accounts.controller.ts
const HOLDER_NAME_NOISE = new Set([
  'dana', 'gopay', 'gopaylater', 'ovo', 'ovopremier', 'shopeepay',
  'shopee', 'linkaja', 'ewallet', 'wallet', 'topup', 'top', 'up',
  'transfer', 'disbursement',
]);

function isMaskedToken(token: string): boolean {
  return token.length >= 4 && /x{2,}/i.test(token);
}

function normalizeName(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !HOLDER_NAME_NOISE.has(part))
    .filter((part) => !isMaskedToken(part));
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

function namesLikelyMatch(userName: string | null | undefined, holderName: string | null | undefined): boolean {
  const userTokens = normalizeName(userName);
  const holderTokens = normalizeName(holderName);
  if (userTokens.length === 0 || holderTokens.length === 0) return true;

  const matched = userTokens.filter((u) => holderTokens.some((h) => tokenMatches(u, h)));
  if (matched.length === userTokens.length) return true;

  const firstToken = userTokens[0];
  const secondToken = userTokens[1];
  const firstMatched = firstToken ? holderTokens.some((h) => tokenMatches(firstToken, h)) : false;
  const secondMatched = secondToken ? holderTokens.some((h) => tokenMatches(secondToken, h)) : false;

  if (firstMatched && (secondMatched || userTokens.length === 1)) return true;
  if (matched.length >= 1 && holderTokens.length === 1) return true;
  return matched.length / userTokens.length >= 0.6;
}

describe('normalizeName', () => {
  it('lowercases and strips special chars', () => {
    expect(normalizeName('Budi Santoso')).toEqual(['budi', 'santoso']);
  });

  it('filters noise tokens', () => {
    expect(normalizeName('Dana Transfer')).toEqual([]);
  });

  it('filters masked tokens (xxxx)', () => {
    expect(normalizeName('Budi XXXX Santoso')).toEqual(['budi', 'santoso']);
  });

  it('handles null/undefined', () => {
    expect(normalizeName(null)).toEqual([]);
    expect(normalizeName(undefined)).toEqual([]);
  });
});

describe('namesLikelyMatch', () => {
  it('matches identical names', () => {
    expect(namesLikelyMatch('Budi Santoso', 'Budi Santoso')).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(namesLikelyMatch('budi santoso', 'BUDI SANTOSO')).toBe(true);
  });

  it('matches when user has two tokens and both match', () => {
    expect(namesLikelyMatch('Budi Santoso', 'Santoso Budi')).toBe(true);
  });

  it('matches prefix (Budiman vs Budi)', () => {
    expect(namesLikelyMatch('Budiman', 'Budiman Santoso')).toBe(true);
  });

  it('rejects completely different names', () => {
    expect(namesLikelyMatch('Ahmad Rizki', 'Dewi Lestari')).toBe(false);
  });

  it('returns true when user name is empty (no way to compare)', () => {
    expect(namesLikelyMatch('', 'Budi')).toBe(true);
  });

  it('returns true when holder name is empty', () => {
    expect(namesLikelyMatch('Budi', '')).toBe(true);
  });

  it('handles e-wallet noise holders (Dana / OVO)', () => {
    // holder is e-wallet noise → tokens empty → returns true
    expect(namesLikelyMatch('Budi Santoso', 'Dana')).toBe(true);
  });
});

describe('isMaskedToken', () => {
  it('detects masked tokens', () => {
    expect(isMaskedToken('xxxx')).toBe(true);
    expect(isMaskedToken('XXXX')).toBe(true);
    expect(isMaskedToken('budixxxx')).toBe(true);
  });

  it('allows short tokens', () => {
    expect(isMaskedToken('xx')).toBe(false);
    expect(isMaskedToken('xxx')).toBe(false);
  });

  it('allows normal tokens', () => {
    expect(isMaskedToken('budi')).toBe(false);
    expect(isMaskedToken('santoso')).toBe(false);
  });
});
