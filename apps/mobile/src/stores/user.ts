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
  fetch: () => Promise<UserProfile | null>;
  hydrate: () => void;
  clear: () => void;
};

const STORAGE_KEY = 'user.profile';

export const useUserStore = create<State>((set) => ({
  profile: null,
  loading: false,
  setProfile: (p) => {
    if (p) storage.set(STORAGE_KEY, JSON.stringify(p));
    else storage.delete(STORAGE_KEY);
    set({ profile: p });
  },
  async fetch() {
    set({ loading: true });
    try {
      const res = await api.get('/auth/me');
      const profile: UserProfile = res.data?.data ?? res.data;
      storage.set(STORAGE_KEY, JSON.stringify(profile));
      set({ profile, loading: false });
      return profile;
    } catch (e: any) {
      set({ loading: false });
      // 404 = endpoint not deployed yet (or removed) → don't trash session
      // 401/403 = token invalid → interceptor already handles logout
      // Other errors → just bail, keep cached profile
      return null;
    }
  },
  hydrate() {
    const raw = storage.getString(STORAGE_KEY);
    if (raw) {
      try { set({ profile: JSON.parse(raw) as UserProfile }); } catch { storage.delete(STORAGE_KEY); }
    }
  },
  clear() {
    storage.delete(STORAGE_KEY);
    set({ profile: null });
  },
}));

// keep persistKeys list informational; STORAGE_KEY mirrors the key used here
void persistKeys;
