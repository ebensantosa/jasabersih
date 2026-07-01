import { create } from 'zustand';

type ActiveCall = {
  bookingId: string;
  token: string;
  serverUrl: string;
  callerLabel: string;
  maxDurationSec: number;
  sessionId: string | null;
  startMuted?: boolean;
};

type CallStore = {
  active: ActiveCall | null;
  minimized: boolean;
  start: (call: ActiveCall) => void;
  minimize: () => void;
  maximize: () => void;
  end: () => void;
};

export const useCallStore = create<CallStore>((set) => ({
  active: null,
  minimized: false,
  start: (call) => set({ active: call, minimized: false }),
  minimize: () => set({ minimized: true }),
  maximize: () => set({ minimized: false }),
  end: () => set({ active: null, minimized: false }),
}));
