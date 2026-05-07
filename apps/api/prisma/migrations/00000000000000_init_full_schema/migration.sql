-- Initial schema baseline for JasaBersih
-- Mirrors docs/data-model/schema.md (sprint-01 Task 3)
-- Prisma manages a subset as models; the rest is plain SQL until modules consume them.

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============ USER & AUTH ============
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  gender VARCHAR(20),
  date_of_birth DATE,
  photo_url VARCHAR(500),
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  is_customer BOOLEAN DEFAULT TRUE,
  is_freelancer BOOLEAN DEFAULT FALSE,
  notification_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  fcm_token VARCHAR(500),
  platform VARCHAR(20),
  device_fingerprint TEXT,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON user_devices(device_fingerprint);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_revoked ON user_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tag VARCHAR(50),
  address_line TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  notes TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_location ON addresses USING GIST(location);

-- ============ CLEANER ============
CREATE TABLE IF NOT EXISTS cleaner_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  service_areas JSONB DEFAULT '[]',
  schedule JSONB DEFAULT '{}',
  brings_tools BOOLEAN DEFAULT FALSE,
  bio TEXT,
  languages TEXT[],
  base_location GEOGRAPHY(POINT, 4326),
  current_location GEOGRAPHY(POINT, 4326),
  is_available BOOLEAN DEFAULT FALSE,
  kyc_status VARCHAR(30) DEFAULT 'pending',
  tier VARCHAR(20) DEFAULT 'pending',
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INT DEFAULT 0,
  acceptance_rate NUMERIC(3,2) DEFAULT 1,
  completion_rate NUMERIC(3,2) DEFAULT 1,
  total_jobs_done INT DEFAULT 0,
  approved_at TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  withdrawal_pin_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cleaner_profiles_location ON cleaner_profiles USING GIST(current_location);
CREATE INDEX IF NOT EXISTS idx_cleaner_profiles_status ON cleaner_profiles(kyc_status, is_available);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  doc_type VARCHAR(50),
  storage_path VARCHAR(500) NOT NULL,
  ocr_result JSONB,
  ktp_nik_encrypted BYTEA,
  face_match_score NUMERIC(3,2),
  liveness_score NUMERIC(3,2),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT
);

CREATE TABLE IF NOT EXISTS kyc_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  score INT,
  passed BOOLEAN,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_progress (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id VARCHAR(50),
  watch_percent NUMERIC(5,2),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, video_id)
);

-- ============ SERVICES & PRICING ============
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT
);

CREATE TABLE IF NOT EXISTS pricing_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  price BIGINT NOT NULL,
  duration_min INT NOT NULL,
  scope JSONB,
  dirt_multipliers JSONB DEFAULT '{"4": 1.25, "5": 1.5}',
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pricing_hourly_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE,
  name VARCHAR(100),
  price_per_hour BIGINT NOT NULL,
  min_hours NUMERIC(3,1) NOT NULL,
  cleaner_share_pct NUMERIC(5,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS add_ons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE,
  name VARCHAR(100) NOT NULL,
  price BIGINT NOT NULL,
  duration_min INT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS commission_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  range_min BIGINT,
  range_max BIGINT,
  cleaner_share_no_tools NUMERIC(5,2),
  cleaner_share_with_tools NUMERIC(5,2),
  top_tier_bonus_pct NUMERIC(5,2) DEFAULT 5.00
);

-- ============ BOOKING (partitioned by created_at) ============
CREATE TABLE IF NOT EXISTS bookings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES users(id),
  cleaner_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  pricing_mode VARCHAR(20) NOT NULL,
  package_id UUID REFERENCES pricing_packages(id),
  hourly_tier_id UUID REFERENCES pricing_hourly_tiers(id),
  hours_booked NUMERIC(3,1),
  status VARCHAR(30) NOT NULL,
  form_snapshot JSONB NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  address_line TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  customer_notes TEXT,
  preferred_gender VARCHAR(10),
  base_amount BIGINT NOT NULL,
  addons_amount BIGINT DEFAULT 0,
  surge_multiplier NUMERIC(3,2) DEFAULT 1.0,
  voucher_id UUID,
  voucher_discount BIGINT DEFAULT 0,
  total_amount BIGINT NOT NULL,
  cleaner_payout BIGINT,
  platform_fee BIGINT,
  paid_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  cleaner_otw_at TIMESTAMPTZ,
  cleaner_arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Initial partitions: current quarter + next quarter
CREATE TABLE IF NOT EXISTS bookings_2026_q4 PARTITION OF bookings
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS bookings_2027_q1 PARTITION OF bookings
  FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS bookings_default PARTITION OF bookings DEFAULT;

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_cleaner ON bookings(cleaner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_location ON bookings USING GIST(location);

CREATE TABLE IF NOT EXISTS booking_add_ons (
  booking_id UUID NOT NULL,
  add_on_id UUID REFERENCES add_ons(id),
  quantity INT DEFAULT 1,
  price_at_booking BIGINT NOT NULL,
  PRIMARY KEY (booking_id, add_on_id)
);

CREATE TABLE IF NOT EXISTS booking_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  photo_type VARCHAR(20) NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  storage_path VARCHAR(500) NOT NULL,
  exif_timestamp TIMESTAMPTZ,
  exif_location GEOGRAPHY(POINT, 4326),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_checklist_progress (
  booking_id UUID NOT NULL,
  item_key VARCHAR(100),
  is_done BOOLEAN DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  PRIMARY KEY (booking_id, item_key)
);

CREATE TABLE IF NOT EXISTS additional_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  reason TEXT NOT NULL,
  amount BIGINT NOT NULL,
  evidence_photos TEXT[],
  status VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ============ CHAT (partitioned) ============
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  sender_id UUID REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  message_type VARCHAR(20) NOT NULL,
  content TEXT,
  attachment_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'sent',
  block_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS chat_messages_2026_q4 PARTITION OF chat_messages
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS chat_messages_default PARTITION OF chat_messages DEFAULT;
CREATE INDEX IF NOT EXISTS idx_chat_booking ON chat_messages(booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_status_blocked ON chat_messages(status) WHERE status = 'blocked';

CREATE TABLE IF NOT EXISTS admin_chat_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL,
  booking_id UUID NOT NULL,
  access_reason VARCHAR(50) NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ WALLET / LEDGER (partitioned + immutable) ============
CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  account_type VARCHAR(30) NOT NULL,
  amount BIGINT NOT NULL,
  reference_type VARCHAR(30) NOT NULL,
  reference_id UUID,
  status VARCHAR(20) DEFAULT 'PENDING',
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS wallet_ledger_2026_q4 PARTITION OF wallet_ledger_entries
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS wallet_ledger_default PARTITION OF wallet_ledger_entries DEFAULT;
CREATE INDEX IF NOT EXISTS idx_ledger_user_account ON wallet_ledger_entries(user_id, account_type, status);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON wallet_ledger_entries(reference_type, reference_id);

CREATE OR REPLACE FUNCTION forbid_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable. Use reversal entry instead.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.account_type IS DISTINCT FROM NEW.account_type
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
       OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Ledger entry core fields are immutable. Only status/cleared_at may transition.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutable ON wallet_ledger_entries;
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON wallet_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  amount BIGINT NOT NULL,
  fee BIGINT DEFAULT 0,
  destination_type VARCHAR(20),
  destination_bank_code VARCHAR(20),
  destination_account_number VARCHAR(50),
  destination_account_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  midtrans_iris_id VARCHAR(100),
  failure_reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID,
  user_id UUID REFERENCES users(id),
  amount BIGINT NOT NULL,
  payment_method VARCHAR(50),
  midtrans_order_id VARCHAR(100),
  midtrans_transaction_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ VOUCHER & REFERRAL ============
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(30) NOT NULL,
  value BIGINT NOT NULL,
  min_order_amount BIGINT DEFAULT 0,
  max_discount BIGINT,
  total_quota INT,
  used_count INT DEFAULT 0,
  per_user_limit INT DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  targeting JSONB,
  is_stackable BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_admin UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voucher_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id UUID REFERENCES vouchers(id),
  user_id UUID REFERENCES users(id),
  booking_id UUID,
  discount_amount BIGINT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  code VARCHAR(20) UNIQUE NOT NULL,
  total_referrals INT DEFAULT 0,
  total_paid BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID REFERENCES users(id),
  referred_id UUID REFERENCES users(id),
  referrer_role VARCHAR(20),
  referred_role VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  qualified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  bonus_amount BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RATINGS / DISPUTES / FRAUD ============
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID UNIQUE,
  rater_id UUID REFERENCES users(id),
  ratee_id UUID REFERENCES users(id),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  photos TEXT[],
  tip_amount BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID,
  raised_by UUID REFERENCES users(id),
  type VARCHAR(50),
  description TEXT NOT NULL,
  evidence JSONB,
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(10) DEFAULT 'normal',
  resolution TEXT,
  payout_amount BIGINT,
  resolved_by_admin UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fraud_strikes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  strike_type VARCHAR(50),
  reference_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_strikes_user_recent ON fraud_strikes(user_id, created_at DESC);

-- ============ ADMIN & AUDIT ============
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(30) NOT NULL,
  scoped_cities TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id),
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id UUID,
  changes JSONB,
  ip_address INET,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accessor_id UUID NOT NULL,
  accessor_type VARCHAR(20) DEFAULT 'admin',
  resource_type VARCHAR(50),
  resource_id UUID,
  access_reason VARCHAR(50),
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50),
  title VARCHAR(255),
  body TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20),
  template_key VARCHAR(100),
  status VARCHAR(20),
  external_id VARCHAR(255),
  failure_reason TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
