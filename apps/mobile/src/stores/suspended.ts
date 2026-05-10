import { create } from 'zustand';

export type SuspendedKind = 'suspended' | 'banned' | 'deleted';

type State = {
  kind: SuspendedKind | null;
  reason: string | null;
  until: string | null;
  set: (data: { kind: SuspendedKind; reason?: string | null; until?: string | null }) => void;
  clear: () => void;
};

export const useSuspendedStore = create<State>((set) => ({
  kind: null,
  reason: null,
  until: null,
  set: (data) => set({ kind: data.kind, reason: data.reason ?? null, until: data.until ?? null }),
  clear: () => set({ kind: null, reason: null, until: null }),
}));
