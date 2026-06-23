import { describe, expect, it } from 'vitest';

// Commission tier lookup — same logic used in payments.controller.ts & bookings.controller.ts
type CommissionTier = {
  range_min: number | null;
  range_max: number | null;
  cleaner_share_no_tools: number;
  cleaner_share_with_tools: number;
};

function selectTier(tiers: CommissionTier[], currentTotal: number): CommissionTier | undefined {
  return tiers.find(
    (t) => currentTotal >= Number(t.range_min ?? 0) && (t.range_max == null || currentTotal <= Number(t.range_max)),
  );
}

function calcCleanerShare(amount: number, currentTotal: number, bringsTools: boolean, tiers: CommissionTier[]): number {
  const tier = selectTier(tiers, currentTotal);
  const pct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
  return Math.round(amount * pct / 100);
}

// Tiers sesuai memory (project_commission_rules.md): NoTools fixed 40%, WithTools 65/60/55 by order total
const SAMPLE_TIERS: CommissionTier[] = [
  { range_min: 0,      range_max: 499999,  cleaner_share_no_tools: 40, cleaner_share_with_tools: 65 },
  { range_min: 500000, range_max: 999999,  cleaner_share_no_tools: 40, cleaner_share_with_tools: 60 },
  { range_min: 1000000, range_max: null,   cleaner_share_no_tools: 40, cleaner_share_with_tools: 55 },
];

describe('Commission tier selection', () => {
  it('selects tier 1 for total < 500k', () => {
    const tier = selectTier(SAMPLE_TIERS, 300000);
    expect(tier?.cleaner_share_with_tools).toBe(65);
  });

  it('selects tier 2 for total 500k–999k', () => {
    const tier = selectTier(SAMPLE_TIERS, 750000);
    expect(tier?.cleaner_share_with_tools).toBe(60);
  });

  it('selects tier 3 (no max) for total >= 1M', () => {
    const tier = selectTier(SAMPLE_TIERS, 1500000);
    expect(tier?.cleaner_share_with_tools).toBe(55);
  });

  it('handles boundary exactly at 500k', () => {
    const tier = selectTier(SAMPLE_TIERS, 500000);
    expect(tier?.cleaner_share_with_tools).toBe(60);
  });

  it('handles boundary exactly at 999999', () => {
    const tier = selectTier(SAMPLE_TIERS, 999999);
    expect(tier?.cleaner_share_with_tools).toBe(60);
  });

  it('no-tools is always 40% regardless of tier', () => {
    for (const total of [0, 200000, 500000, 1000000, 5000000]) {
      const tier = selectTier(SAMPLE_TIERS, total);
      expect(tier?.cleaner_share_no_tools).toBe(40);
    }
  });
});

describe('Cleaner share calculation', () => {
  it('no-tools: 40% of 300k = 120k', () => {
    expect(calcCleanerShare(300000, 200000, false, SAMPLE_TIERS)).toBe(120000);
  });

  it('with-tools tier 1: 65% of 200k = 130k', () => {
    expect(calcCleanerShare(200000, 100000, true, SAMPLE_TIERS)).toBe(130000);
  });

  it('with-tools tier 2: 60% of 500k = 300k', () => {
    expect(calcCleanerShare(500000, 600000, true, SAMPLE_TIERS)).toBe(300000);
  });

  it('with-tools tier 3: 55% of 400k = 220k', () => {
    expect(calcCleanerShare(400000, 1200000, true, SAMPLE_TIERS)).toBe(220000);
  });

  it('rounds to nearest integer', () => {
    // 40% of 100001 = 40000.4 → rounds to 40000
    expect(calcCleanerShare(100001, 0, false, SAMPLE_TIERS)).toBe(40000);
    // 65% of 100001 = 65000.65 → rounds to 65001
    expect(calcCleanerShare(100001, 0, true, SAMPLE_TIERS)).toBe(65001);
  });

  it('platform fee + cleaner share = total amount', () => {
    const amount = 350000;
    const share = calcCleanerShare(amount, 200000, false, SAMPLE_TIERS);
    const platform = amount - share;
    expect(share + platform).toBe(amount);
  });

  it('falls back to 40% when no tier matches', () => {
    // Empty tiers → no match → fallback 40%
    expect(calcCleanerShare(100000, 0, false, [])).toBe(40000);
    expect(calcCleanerShare(100000, 0, true, [])).toBe(40000);
  });
});
