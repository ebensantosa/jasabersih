export const dynamic = 'force-dynamic';

export default function NotFound(): React.ReactElement {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', margin: 0 }}>
        <div style={{ background: 'white', padding: 32, borderRadius: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#0f172a' }}>404</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: '#64748b' }}>Halaman tidak ditemukan</p>
          <a href="/admin" style={{ marginTop: 16, display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#2563eb' }}>â† Dashboard</a>
        </div>
      </body>
    </html>
  );
}
