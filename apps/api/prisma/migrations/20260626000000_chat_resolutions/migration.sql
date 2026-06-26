-- Admin bisa tandai thread chat sebagai "selesai" supaya inbox bersih
CREATE TABLE IF NOT EXISTS chat_resolutions (
  booking_id UUID PRIMARY KEY,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ DEFAULT NOW()
);
