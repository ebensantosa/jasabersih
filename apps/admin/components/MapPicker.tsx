'use client';

import React, { useEffect, useRef, useState } from 'react';

type Props = {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

declare global {
  interface Window { L: any }
}

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('SSR');
    if (window.L) return resolve(window.L);
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const t = setInterval(() => { if (window.L) { clearInterval(t); resolve(window.L); } }, 50);
      return;
    }
    const s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function MapPicker({ lat, lng, onChange, height = 280 }: Props): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ lat: number; lng: number; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || !ref.current) return;
      if (mapRef.current) return;
      const map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        dragging: true,
      }).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChange(p.lat, p.lng);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      // Invalidate size setelah modal beneran kelihatan (kadang Leaflet ngitung size 0 saat first paint)
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 600);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when external lat/lng changes
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    const p = markerRef.current.getLatLng();
    if (Math.abs(p.lat - lat) > 1e-6 || Math.abs(p.lng - lng) > 1e-6) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    }
  }, [lat, lng]);

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search + ', Indonesia')}&countrycodes=id&limit=5&addressdetails=1`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (Array.isArray(data)) {
        setResults(data.map((d: any) => ({
          lat: Number(d.lat),
          lng: Number(d.lon),
          name: d.display_name as string,
        })));
      }
    } catch { /* ignore */ }
    setSearching(false);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), doSearch())}
            placeholder="Cari alamat / landmark (mis. Tugu Yogyakarta)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={doSearch}
            disabled={searching || !search.trim()}
            className="rounded-md bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {searching ? 'Cari...' : 'Cari'}
          </button>
        </div>
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-[1001] mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange(r.lat, r.lng);
                  setResults([]);
                  setSearch('');
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 last:border-b-0"
              >
                <div className="line-clamp-2 text-slate-900">{r.name}</div>
                <div className="text-[10px] text-slate-400">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={ref} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }} />
      <p className="text-[11px] text-slate-500">Scroll mouse untuk zoom · klik peta atau drag marker untuk pin centroid.</p>
    </div>
  );
}
