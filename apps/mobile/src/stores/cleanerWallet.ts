import { create } from 'zustand';

import { storage } from '../lib/storage';

const KEY = 'cleaner.wallet';
export const MIN_WITHDRAW = 50_000;

/**
 * Bagi hasil cleaner (rate JasaBersih.com):
 *  Order < 300K   → Tanpa Alat 40% · Bawa Alat 60%
 *  Order 300-600K → Tanpa Alat 40% · Bawa Alat 55%
 *  Order > 600K   → Tanpa Alat 40% · Bawa Alat 50%
 */
export function calculateCleanerShare(totalPrice: number, bringsTools: boolean): number {
  if (!bringsTools) return 0.4;
  if (totalPrice < 300_000) return 0.6;
  if (totalPrice <= 600_000) return 0.55;
  return 0.5;
}

export function calculateCleanerEarning(totalPrice: number, bringsTools: boolean): number {
  return Math.round(totalPrice * calculateCleanerShare(totalPrice, bringsTools));
}

export type WalletEntry = {
  id: string;
  type: 'earning' | 'withdrawal_pending' | 'withdrawal_complete' | 'withdrawal_failed';
  amount: number; // signed: positif = credit, negatif = debit
  description: string;
  bookingId?: string;
  destination?: { method: string; account: string; name: string };
  createdAt: number;
};

type State = {
  entries: WalletEntry[];
  hydrated: boolean;
  hydrate: () => void;
  /** Total saldo yang bisa ditarik (sum amount where type != withdrawal_pending) */
  balance: () => number;
  /** Total saldo termasuk pending */
  pendingTotal: () => number;
  addEarning: (bookingId: string, totalPrice: number, bringsTools: boolean, description: string) => void;
  addWithdrawal: (
    amount: number,
    destination: { method: string; account: string; name: string },
  ) => WalletEntry;
};

function persist(entries: WalletEntry[]): void {
  storage.set(KEY, JSON.stringify(entries));
}

export const useCleanerWalletStore = create<State>((set, get) => ({
  entries: [],
  hydrated: false,
  hydrate: () => {
    const raw = storage.getString(KEY);
    if (raw) {
      try {
        const entries = JSON.parse(raw) as WalletEntry[];
        set({ entries, hydrated: true });
        return;
      } catch {
        storage.delete(KEY);
      }
    }
    set({ hydrated: true });
  },
  balance: () =>
    get().entries.reduce((s, e) => {
      if (e.type === 'withdrawal_pending') return s; // belum di-debit
      return s + e.amount;
    }, 0),
  pendingTotal: () =>
    get()
      .entries.filter((e) => e.type === 'withdrawal_pending')
      .reduce((s, e) => s + Math.abs(e.amount), 0),
  addEarning: (bookingId, totalPrice, bringsTools, description) => {
    // Cek dulu jangan double credit
    if (get().entries.some((e) => e.bookingId === bookingId && e.type === 'earning')) return;
    const earning = calculateCleanerEarning(totalPrice, bringsTools);
    const entry: WalletEntry = {
      id: 'we_' + Math.random().toString(36).slice(2, 10),
      type: 'earning',
      amount: earning,
      description,
      bookingId,
      createdAt: Date.now(),
    };
    const next = [entry, ...get().entries];
    persist(next);
    set({ entries: next });
  },
  addWithdrawal: (amount, destination) => {
    const entry: WalletEntry = {
      id: 'wd_' + Math.random().toString(36).slice(2, 10),
      type: 'withdrawal_pending',
      amount: -Math.abs(amount),
      description: `Tarik ke ${destination.method} ${destination.account}`,
      destination,
      createdAt: Date.now(),
    };
    const next = [entry, ...get().entries];
    persist(next);
    set({ entries: next });
    // Simulate completion 4 detik kemudian
    setTimeout(() => {
      const completed: WalletEntry = { ...entry, type: 'withdrawal_complete' };
      const updated = get().entries.map((e) => (e.id === entry.id ? completed : e));
      persist(updated);
      set({ entries: updated });
    }, 4000);
    return entry;
  },
}));
