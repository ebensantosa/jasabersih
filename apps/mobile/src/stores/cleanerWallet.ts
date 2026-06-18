import { create } from 'zustand';

import { api } from '../lib/api';
import { storage } from '../lib/storage';

const KEY = 'cleaner.wallet';
export const MIN_WITHDRAW = 50_000;
const CLEANER_WALLET_SYNC_STALE_MS = 10_000;

let cleanerWalletSyncPromise: Promise<void> | null = null;
let cleanerWalletLastSyncedAt = 0;

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
  /** Total saldo yang bisa ditarik (sum amount where type != withdrawal_pending) - LOCAL only */
  balance: () => number;
  /** Server-authoritative balance dengan fallback ke local. PAKAI INI di UI. */
  effectiveBalance: () => number;
  /** Total saldo termasuk pending */
  pendingTotal: () => number;
  addEarning: (bookingId: string, totalPrice: number, bringsTools: boolean, description: string) => void;
  addWithdrawal: (
    amount: number,
    destination: { method: string; account: string; name: string },
  ) => WalletEntry;
  // Server sync
  serverBalance: number;
  serverPendingAmount: number;
  syncing: boolean;
  syncError: string | null;
  syncFromApi: (force?: boolean) => Promise<void>;
  /** Request withdrawal via API. Returns server response or throws.
   *  Kalau bankAccountId di-provide & rekening verified & amount ≤ threshold → auto-Flip transfer.
   *  Otherwise (legacy inline fields atau amount > threshold) → admin manual approve. */
  requestWithdrawalApi: (
    amount: number,
    destination: { bankCode?: string; accountNumber?: string; accountName?: string; bankAccountId?: string },
  ) => Promise<{ id: string; status: string; autoDisburse: boolean; transferAmount?: number; fee?: number; message?: string }>;
  clearLocal: () => void;
};

function persist(entries: WalletEntry[]): void {
  storage.set(KEY, JSON.stringify(entries));
}

export const useCleanerWalletStore = create<State>((set, get) => ({
  entries: [],
  hydrated: false,
  serverBalance: 0,
  serverPendingAmount: 0,
  syncing: false,
  syncError: null,
  clearLocal() {
    storage.delete(KEY);
    set({ entries: [], hydrated: true, serverBalance: 0, serverPendingAmount: 0, syncError: null });
  },
  async syncFromApi(force = false) {
    if (!force && cleanerWalletSyncPromise) return cleanerWalletSyncPromise;
    if (!force && cleanerWalletLastSyncedAt && Date.now() - cleanerWalletLastSyncedAt < CLEANER_WALLET_SYNC_STALE_MS) return;
    set({ syncing: true, syncError: null });
    cleanerWalletSyncPromise = (async () => {
      try {
      const res = await api.get('/cleaner/wallet');
      const data = res.data?.data ?? res.data;
      // Convert server ledger ke WalletEntry shape (untuk compat dengan UI existing)
      const entries: WalletEntry[] = (data.ledger ?? []).map((l: any) => {
        const isEarning = l.accountType === 'earnings';
        const isWithdrawal = l.accountType === 'withdrawal';
        const status = l.status as string;
        const rawAmount = Number(l.amount);
        // PRESERVE SIGN dari server. Backend insert:
        //   - Hold withdrawal: +amount (debit user balance)
        //   - Reverse (kalau Flip gagal): -amount (credit balance kembali)
        // UI convention: amount positif = '+' hijau (credit), negatif = '-' merah.
        // Jadi untuk withdrawal: FLIP sign supaya hold tampil minus (debit user),
        // reverse tampil plus (refund balance).
        const amount = isEarning ? rawAmount : -rawAmount;
        // Reverse entry kalau description ada 'Reverse' keyword -> klasifikasi
        // sebagai 'earning' supaya tampil credit hijau di UI history.
        const isReverse = isWithdrawal && /reverse/i.test(String(l.description ?? ''));
        return {
          id: l.id,
          type: isEarning || isReverse ? 'earning'
            : isWithdrawal && status === 'PENDING' ? 'withdrawal_pending'
            : isWithdrawal && status === 'CLEARED' ? 'withdrawal_complete'
            : isWithdrawal && status === 'CANCELLED' ? 'withdrawal_failed'
            : 'earning',
          amount,
          description: l.description ?? (isEarning ? 'Pendapatan' : 'Penarikan'),
          bookingId: l.referenceType === 'booking' ? l.referenceId : undefined,
          createdAt: l.createdAt ? new Date(l.createdAt).getTime() : Date.now(),
        } as WalletEntry;
      });
      persist(entries);
      cleanerWalletLastSyncedAt = Date.now();
      set({
        entries,
        serverBalance: Number(data.balance ?? 0),
        serverPendingAmount: Number(data.pendingWithdrawalAmount ?? 0),
        syncing: false,
      });
      } catch (e: any) {
        set({ syncing: false, syncError: e?.message ?? 'gagal sync' });
      } finally {
        cleanerWalletSyncPromise = null;
      }
    })();
    await cleanerWalletSyncPromise;
  },
  async requestWithdrawalApi(amount, destination) {
    const body: Record<string, any> = { amount };
    if (destination.bankAccountId) body.bankAccountId = destination.bankAccountId;
    if (destination.bankCode) body.bankCode = destination.bankCode;
    if (destination.accountNumber) body.accountNumber = destination.accountNumber;
    if (destination.accountName) body.accountName = destination.accountName;
    const res = await api.post('/cleaner/withdrawal', body);
    const data = res.data?.data ?? res.data;
    // Re-sync biar ledger entry baru muncul
    void get().syncFromApi();
    return {
      id: data.id,
      status: data.status ?? 'pending',
      autoDisburse: !!data.autoDisburse,
      transferAmount: data.transferAmount,
      fee: data.fee,
      message: data.message,
    };
  },
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
  /**
   * Authoritative balance: pakai serverBalance kalau sudah sync, fallback ke
   * local sum. Dipakai semua screen yg display saldo (earnings, wallet,
   * withdraw) supaya angka konsisten lintas halaman.
   * NB: server balance bisa 0 legitimately (cleaner baru), jadi cek pakai
   * flag `synced` (entries.length > 0 atau serverBalance > 0) bukan cuma
   * serverBalance > 0.
   */
  effectiveBalance: () => {
    const s = get();
    // Synced berarti pernah sukses fetch /cleaner/wallet (ada ledger entries
    // atau server balance pernah > 0). Server selalu authoritative kalau
    // sudah sync, walaupun balance=0.
    const synced = s.entries.length > 0 || s.serverBalance > 0;
    if (synced) return s.serverBalance;
    // Belum sync (offline / cold start): fallback local sum.
    return s.entries.reduce((acc, e) => {
      if (e.type === 'withdrawal_pending') return acc;
      return acc + e.amount;
    }, 0);
  },
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
    // Status real berasal dari server; syncFromApi() akan pull status final
    // (pending → cleared / cancelled).
    return entry;
  },
}));
