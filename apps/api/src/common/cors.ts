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
  return (process.env.CORS_ORIGINS ?? defaultOrigins.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}
