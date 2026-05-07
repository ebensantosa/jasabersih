'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', margin: 0 }}>
        <div style={{ background: 'white', padding: 32, borderRadius: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#dc2626', margin: 0 }}>Error</h1>
          <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>{error?.message ?? 'Terjadi kesalahan'}</p>
          <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: 'white', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  );
}
