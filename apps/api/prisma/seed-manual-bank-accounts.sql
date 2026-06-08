-- Config rekening merchant untuk Transfer Bank Manual (selain VA otomatis).
-- Format: array of { bankCode, bankName, accountNumber, accountName }
INSERT INTO app_config (key, value, category, description)
VALUES (
  'payment.manual_bank_accounts',
  '[
    {"bankCode":"bca","bankName":"BCA","accountNumber":"6160451516","accountName":"PT JasaBersih Bumi Indonesia"},
    {"bankCode":"mandiri","bankName":"Mandiri","accountNumber":"1370001234567","accountName":"PT JasaBersih Bumi Indonesia"}
  ]'::jsonb,
  'payment',
  'List rekening merchant untuk Transfer Bank Manual (customer transfer + upload bukti / konfirmasi via WA).'
)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

SELECT key, value FROM app_config WHERE key = 'payment.manual_bank_accounts';
