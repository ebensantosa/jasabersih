// Server layout â€” exports route segment config that disables prerender so
// HTML is always generated fresh and references the current chunk hashes.
// Without this, Next prerenders /admin once per build and Cloudflare caches
// the resulting HTML for s-maxage=31536000 â†’ after a deploy users hit a
// stale HTML pointing at deleted chunks ("Loading chunk N failed").
import AdminShell from './_AdminShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function AdminLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  return <AdminShell>{children}</AdminShell>;
}
