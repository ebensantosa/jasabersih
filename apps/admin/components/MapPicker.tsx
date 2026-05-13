'use client';

import { useEffect, useRef, useState } from 'react';

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

export function MapPicker({ lat, lng, onChange, height = 280 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || !ref.current) return;
      if (mapRef.current) return;
      const map = L.map(ref.current).setView([lat, lng], 13);
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
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search + ', Indonesia')}&limit=1`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (data && data[0]) {
        const nlat = Number(data[0].lat);
        const nlng = Number(data[0].lon);
        onChange(nlat, nlng);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }

  return (
    <div className="space-y-2">
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
      <div ref={ref} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }} />
      <p className="text-[11px] text-slate-500">Klik di peta atau drag marker untuk pin titik centroid.</p>
    </div>
  );
}
