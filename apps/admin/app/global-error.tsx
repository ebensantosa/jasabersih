'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  // Auto-reload on stale chunk errors. After a deploy the old HTML in the
  // browser references chunk hashes that no longer exist on the server →
  // "Loading chunk N failed". reset() re-renders the same broken tree, so
  // we hard-reload (cache-busting) to fetch the fresh HTML + chunks.
  const isChunkError = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(error?.message ?? '');

  useEffect(() => {
    if (isChunkError && typeof window !== 'undefined') {
      // Bypass HTTP cache on the reload
      window.location.reload();
    }
  }, [isChunkError]);

  function hardReload() {
    if (typeof window !== 'undefined') window.location.reload();
    else reset();
  }

  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', margin: 0 }}>
        <div style={{ background: 'white', padding: 32, borderRadius: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#dc2626', margin: 0 }}>
            {isChunkError ? 'Versi Baru Tersedia' : 'Error'}
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
            {isChunkError
              ? 'Aplikasi baru saja di-update. Memuat ulang…'
              : (error?.message ?? 'Terjadi kesalahan')}
          </p>
          <button onClick={hardReload} style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: 'white', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
