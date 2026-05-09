import { create } from 'zustand';

import { api } from '../lib/api';

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
  fetch: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

export const useNotifications = create<State>((set, get) => ({
  list: [],
  unreadCount: 0,
  loading: false,
  async fetch() {
    const { useAuthStore } = await import('./auth');
    if (!useAuthStore.getState().tokens) return;
    set({ loading: true });
    try {
      const res = await api.get('/notifications');
      const list: NotificationItem[] = res.data?.data ?? [];
      set({ list, unreadCount: list.filter((n) => !n.isRead).length, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  async markAllRead() {
    try { await api.post('/notifications/mark-all-read'); } catch { /* fall through */ }
    set({ list: get().list.map((n) => ({ ...n, isRead: true })), unreadCount: 0 });
  },
}));
