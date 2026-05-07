import type { ISODateString, RupiahAmount, UUID } from './common';

export type LedgerEntryType =
  | 'booking_payment_in'
  | 'booking_earning'
  | 'commission_fee'
  | 'tip'
  | 'refund'
  | 'withdrawal_pending'
  | 'withdrawal_complete'
  | 'withdrawal_failed'
  | 'voucher_credit'
  | 'referral_bonus'
  | 'penalty'
  | 'adjustment';

export type LedgerEntry = {
  id: UUID;
  userId: UUID;
  type: LedgerEntryType;
  amount: RupiahAmount;
  balanceAfter: RupiahAmount;
  referenceType: string | null;
  referenceId: UUID | null;
  description: string;
  createdAt: ISODateString;
};

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type Withdrawal = {
  id: UUID;
  userId: UUID;
  amount: RupiahAmount;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  status: WithdrawalStatus;
  midtransIrisRef: string | null;
  createdAt: ISODateString;
  completedAt: ISODateString | null;
};
