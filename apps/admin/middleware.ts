import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Strong no-cache for admin HTML routes  prevents Cloudflare and the browser
// from holding onto an old shell that references chunk hashes that get deleted
// on the next deploy. Static assets under /_next/static keep their default
// long-lived caching (the filename hash is the cache key).
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
