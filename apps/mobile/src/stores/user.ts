import { create } from 'zustand';

import { api } from '../lib/api';
import { persistKeys, storage } from '../lib/storage';

export type UserProfile = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  mode: 'customer' | 'freelancer';
  memberSince: string;
  verified: boolean;
};

type State = {
  profile: UserProfile | null;
  loading: boolean;
  setProfile: (p: UserProfile | null) => void;
  fetch: (force?: boolean) => Promise<UserProfile | null>;
  hydrate: () => void;
  clear: () => void;
};

const STORAGE_KEY = 'user.profile';
const USER_FETCH_STALE_MS = 10_000;

let userFetchPromise: Promise<UserProfile | null> | null = null;
let userLastFetchedAt = 0;

export const useUserStore = create<State>((set, get) => ({
  profile: null,
  loading: false,
  setProfile: (p) => {
    if (p) storage.set(STORAGE_KEY, JSON.stringify(p));
    else storage.delete(STORAGE_KEY);
    set({ profile: p });
  },
  async fetch(force = false): Promise<UserProfile | null> {
    if (!force && userFetchPromise) return userFetchPromise;
    if (!force && userLastFetchedAt && Date.now() - userLastFetchedAt < USER_FETCH_STALE_MS) {
      return get().profile;
    }

    set({ loading: true });
    userFetchPromise = (async () => {
      try {
        const res = await api.get('/auth/me');
        const profile: UserProfile = res.data?.data ?? res.data;
        storage.set(STORAGE_KEY, JSON.stringify(profile));
        userLastFetchedAt = Date.now();
        set({ profile, loading: false });
        return profile;
      } catch {
        set({ loading: false });
        return null;
      } finally {
        userFetchPromise = null;
      }
    })();

    return userFetchPromise;
  },
  hydrate() {
    const raw = storage.getString(STORAGE_KEY);
    if (raw) {
      try {
        set({ profile: JSON.parse(raw) as UserProfile });
      } catch {
        storage.delete(STORAGE_KEY);
      }
    }
  },
  clear() {
    storage.delete(STORAGE_KEY);
    set({ profile: null });
  },
}));

void persistKeys;
