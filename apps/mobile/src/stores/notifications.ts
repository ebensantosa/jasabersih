import { create } from 'zustand';

import { api } from '../lib/api';

const NOTIFICATIONS_STALE_MS = 15_000;

let notificationsFetchPromise: Promise<void> | null = null;
let notificationsLastFetchedAt = 0;

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

type State = {
  list: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  fetch: (force?: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
};

export const useNotifications = create<State>((set, get) => ({
  list: [],
  unreadCount: 0,
  loading: false,
  async fetch(force = false) {
    const { useAuthStore } = await import('./auth');
    if (!useAuthStore.getState().tokens) return;
    if (!force && notificationsFetchPromise) return notificationsFetchPromise;
    if (!force && notificationsLastFetchedAt && Date.now() - notificationsLastFetchedAt < NOTIFICATIONS_STALE_MS) return;
    set({ loading: true });
    notificationsFetchPromise = (async () => {
      try {
        const res = await api.get('/notifications');
        const list: NotificationItem[] = res.data?.data ?? [];
        notificationsLastFetchedAt = Date.now();
        set({ list, unreadCount: list.filter((n) => !n.isRead).length, loading: false });
      } catch {
        set({ loading: false });
      } finally {
        notificationsFetchPromise = null;
      }
    })();
    await notificationsFetchPromise;
  },
  async markAllRead() {
    try { await api.post('/notifications/mark-all-read'); } catch { /* fall through */ }
    set({ list: get().list.map((n) => ({ ...n, isRead: true })), unreadCount: 0 });
  },
}));
