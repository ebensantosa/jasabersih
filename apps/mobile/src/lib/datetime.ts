// Indonesia timezone-aware datetime formatting.
// WIB (Asia/Jakarta) default, WITA (Asia/Makassar) untuk Bali / NTB / NTT / Sulawesi,
// WIT (Asia/Jayapura) untuk Maluku / Papua.
const WITA_KEYWORDS = ['bali', 'denpasar', 'lombok', 'mataram', 'kupang', 'makassar', 'manado', 'palu', 'kendari', 'gorontalo', 'samarinda', 'balikpapan', 'banjarmasin', 'palangkaraya', 'pontianak'];
const WIT_KEYWORDS = ['jayapura', 'manokwari', 'sorong', 'merauke', 'ambon', 'ternate'];

export function tzForAddress(address: string | null | undefined): string {
  const lower = String(address ?? '').toLowerCase();
  if (WIT_KEYWORDS.some((k) => lower.includes(k))) return 'Asia/Jayapura';
  if (WITA_KEYWORDS.some((k) => lower.includes(k))) return 'Asia/Makassar';
  return 'Asia/Jakarta';
}

export function tzAbbr(tz: string): string {
  if (tz === 'Asia/Jayapura') return 'WIT';
  if (tz === 'Asia/Makassar') return 'WITA';
  return 'WIB';
}

function parseDateSafe(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatScheduleWithTz(iso: string, address?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  const parsed = parseDateSafe(iso);
  if (!parsed) return iso || '-';
  const tz = tzForAddress(address);
  const fmt = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    ...opts,
    timeZone: tz,
  });
  return `${fmt.format(parsed)} ${tzAbbr(tz)}`;
}

export function formatDateWithTz(iso: string, address?: string | null): string {
  const parsed = parseDateSafe(iso);
  if (!parsed) return iso || '-';
  const tz = tzForAddress(address);
  const fmt = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', timeZone: tz,
  });
  return `${fmt.format(parsed)}`;
}

export function formatTimeWithTz(iso: string, address?: string | null): string {
  const parsed = parseDateSafe(iso);
  if (!parsed) return iso || '-';
  const tz = tzForAddress(address);
  const fmt = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false,
  });
  return `${fmt.format(parsed)} ${tzAbbr(tz)}`;
}
