-- Admin P0 — kolom yg dibutuhkan untuk suspend/ban + KYC review + dispute SLA
-- Idempotent: aman dijalankan ulang.

-- USERS: status & suspend metadata ----------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- KYC DOCUMENTS: review metadata -----------------------------------------
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID;
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_documents(status);
CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_documents(user_id);

-- CLEANER PROFILES: track who approved/suspended -------------------------
ALTER TABLE cleaner_profiles ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE cleaner_profiles ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE cleaner_profiles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- DISPUTES: SLA + assignment ---------------------------------------------
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS subject_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_disputes_status_sla ON disputes(status, sla_due_at);

-- BOOKINGS: cancellation reason (untuk admin force-cancel + ban) ---------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID;

-- WITHDRAWALS: review workflow -------------------------------------------
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS bank_transfer_ref VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_withdrawals_review ON withdrawals(review_status, requested_at);

-- BLACKLIST: phone/device/ip/bank_account/nik ----------------------------
CREATE TABLE IF NOT EXISTS blacklist_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) NOT NULL,           -- phone | device | ip | bank | nik | email
  value VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  added_by UUID,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(type, value)
);
CREATE INDEX IF NOT EXISTS idx_blacklist_lookup ON blacklist_entries(type, value);
