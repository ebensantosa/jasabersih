import { create } from 'zustand';

import { storage } from '../lib/storage';

const KEY = 'user.location';

export type SavedLocation = {
  lat: number;
  lng: number;
  address: string;
  shortLabel: string; // contoh: "Sleman, Yogyakarta"
};

type State = {
  current: SavedLocation | null;
  hydrated: boolean;
  set: (loc: SavedLocation | null) => void;
  hydrate: () => void;
};

export const useLocationStore = create<State>((set, get) => ({
  current: null,
  hydrated: false,
  set: (loc) => {
    if (loc) storage.set(KEY, JSON.stringify(loc));
    else storage.delete(KEY);
    set({ current: loc });
  },
  hydrate: () => {
    const raw = storage.getString(KEY);
    if (raw) {
      try {
        set({ current: JSON.parse(raw) as SavedLocation, hydrated: true });
        return;
      } catch {
        storage.delete(KEY);
      }
    }
    set({ hydrated: true });
  },
}));

/** Bikin label singkat dari display_name Nominatim ("Jl X, Kelurahan Y, Kecamatan Z, Kota A, ...")
 *  → ambil 2 segmen terakhir yang relevan (kota + provinsi) atau 2 segmen terakhir non-postal/country
 */
export function shortenAddress(address: string): string {
  const parts = address.split(',').map((s) => s.trim());
  const filtered = parts.filter(
    (p) =>
      !/^\d{5}$/.test(p) && // postal code
      p.toLowerCase() !== 'indonesia' &&
      !/^daerah istimewa/i.test(p) &&
      p.length > 0,
  );
  // Ambil 2 segmen terakhir
  const last = filtered.slice(-2);
  if (last.length === 0) return parts[0] ?? address;
  return last.join(', ').replace(/^Kota\s+/i, '').replace(/^Kabupaten\s+/i, 'Kab. ');
}
