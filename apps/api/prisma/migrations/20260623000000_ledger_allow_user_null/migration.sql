-- Allow setting user_id = NULL on wallet_ledger_entries for hard-delete user flow.
-- The immutable trigger previously blocked ANY update to user_id, including NULL-ing it.
-- This modifies the trigger to allow user_id → NULL (GDPR/admin account deletion) only.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable. Use reversal entry instead.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.account_type IS DISTINCT FROM NEW.account_type
       OR (OLD.user_id IS DISTINCT FROM NEW.user_id AND NEW.user_id IS NOT NULL)
       OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
       OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Ledger entry core fields are immutable. Only status/cleared_at may transition.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
