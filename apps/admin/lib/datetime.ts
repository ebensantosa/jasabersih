// WIB default, WITA untuk Bali / NTB / NTT / Sulawesi / Kalimantan,
// WIT untuk Maluku / Papua. Picked from address substring.
const WITA = ['bali', 'denpasar', 'lombok', 'mataram', 'kupang', 'makassar', 'manado', 'palu', 'kendari', 'gorontalo', 'samarinda', 'balikpapan', 'banjarmasin', 'palangkaraya', 'pontianak'];
const WIT = ['jayapura', 'manokwari', 'sorong', 'merauke', 'ambon', 'ternate'];

export function tzForAddress(address: string | null | undefined): string {
  const lower = String(address ?? '').toLowerCase();
  if (WIT.some((k) => lower.includes(k))) return 'Asia/Jayapura';
  if (WITA.some((k) => lower.includes(k))) return 'Asia/Makassar';
  return 'Asia/Jakarta';
}

export function tzAbbr(tz: string): string {
  if (tz === 'Asia/Jayapura') return 'WIT';
  if (tz === 'Asia/Makassar') return 'WITA';
  return 'WIB';
}

export function formatDateTimeWithTz(iso: string | Date | null | undefined, address?: string | null): string {
  if (!iso) return '';
  const tz = tzForAddress(address);
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: tz,
  }).format(new Date(iso))} ${tzAbbr(tz)}`;
}
