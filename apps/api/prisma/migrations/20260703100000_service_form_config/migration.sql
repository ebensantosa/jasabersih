-- Add pricing_template and form_config to services
-- pricing_template: 'per_parameter' (existing complex flow) or 'fixed_cost' (flat price)
-- form_config: JSONB controlling which form fields appear for this service
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS pricing_template VARCHAR(20) NOT NULL DEFAULT 'per_parameter',
  ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{}';
