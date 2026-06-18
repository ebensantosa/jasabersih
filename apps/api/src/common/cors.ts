export function getAllowedOrigins(): string[] {
  const defaultOrigins = [
    'https://dashboard.jasabersih.com',
    'https://api.jasabersih.com',
    'https://jasabersih.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:19006',
  ];
  const rawOrigins = process.env.CORS_ORIGINS?.trim();
  return (rawOrigins ? rawOrigins : defaultOrigins.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '').toLowerCase();
}

function isTrustedJasaBersihHost(hostname: string): boolean {
  return hostname === 'jasabersih.com' || hostname.endsWith('.jasabersih.com');
}

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins().map(normalizeOrigin);
  if (allowed.includes(normalized)) return true;

  try {
    const url = new URL(normalized);
    const isLocalDevHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (isLocalDevHost) return true;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && isTrustedJasaBersihHost(url.hostname)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
