const OVERTIME_START_HOUR = 21;
const OVERTIME_RATE_PER_HOUR = 50_000;

export type OvertimeQuote = {
  surcharge: number;
  overtimeHours: number;
  overtimeMinutes: number;
  estimatedEnd: Date;
};

export function quoteNightOvertime(startAt: Date, estimatedDurationMin: number): OvertimeQuote {
  const safeDurationMin = Math.max(0, Math.round(estimatedDurationMin || 0));
  const estimatedEnd = new Date(startAt.getTime() + safeDurationMin * 60_000);
  const overtimeStart = new Date(startAt);
  overtimeStart.setHours(OVERTIME_START_HOUR, 0, 0, 0);

  if (estimatedEnd.getTime() <= overtimeStart.getTime()) {
    return {
      surcharge: 0,
      overtimeHours: 0,
      overtimeMinutes: 0,
      estimatedEnd,
    };
  }

  const overtimeMinutes = Math.ceil((estimatedEnd.getTime() - overtimeStart.getTime()) / 60_000);
  const overtimeHours = Math.ceil(overtimeMinutes / 60);

  return {
    surcharge: overtimeHours * OVERTIME_RATE_PER_HOUR,
    overtimeHours,
    overtimeMinutes,
    estimatedEnd,
  };
}

export function formatEndTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
