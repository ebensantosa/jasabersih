-- One-time cleanup: fix withdrawal rows yg stuck di review_status='pending'
-- padahal status='failed' (Flip disbursement error tapi review_status gak
-- ke-update krn bug di catch block). Akibatnya cleaner ga bisa submit
-- withdrawal baru karena blocker check 'pending withdrawal exists' trigger
-- terus.
--
-- Update semua: status=failed + review_status='pending' -> review_status='rejected'.
UPDATE withdrawals
   SET review_status = 'rejected',
       review_note = COALESCE(review_note, 'Cleanup: auto-disburse Flip gagal'),
       reviewed_at = COALESCE(reviewed_at, NOW())
 WHERE status = 'failed'
   AND review_status = 'pending';
