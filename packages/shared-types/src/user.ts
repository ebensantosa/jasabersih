import type { ISODateString, UUID } from './common';
import type { UserMode } from './auth';

export type UserStatus = 'pending_verification' | 'active' | 'suspended' | 'banned';

export type User = {
  id: UUID;
  phone: string;
  email: string | null;
  fullName: string;
  status: UserStatus;
  primaryMode: UserMode;
  modesEnabled: UserMode[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
