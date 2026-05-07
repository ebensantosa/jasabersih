import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
};

type State = {
  toast: Toast | null;
  show: (message: string, kind?: ToastKind) => void;
  hide: () => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<State>((set) => ({
  toast: null,
  show: (message, kind = 'info') => {
    if (timer) clearTimeout(timer);
    set({ toast: { id: Math.random().toString(36).slice(2), message, kind } });
    timer = setTimeout(() => set({ toast: null }), 2800);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ toast: null });
  },
}));

export const toast = {
  info: (m: string) => useUIStore.getState().show(m, 'info'),
  success: (m: string) => useUIStore.getState().show(m, 'success'),
  error: (m: string) => useUIStore.getState().show(m, 'error'),
  warning: (m: string) => useUIStore.getState().show(m, 'warning'),
  comingSoon: () => useUIStore.getState().show('Fitur ini akan segera hadir', 'info'),
};
