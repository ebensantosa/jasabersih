// Mock data sudah dihapus. Semua page pakai real API only.
// File ini cuma export types & helpers.

export type OrderStatus =
  | 'pending_payment'
  | 'searching'
  | 'matched'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'disputed';

export type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  cleanerName: string | null;
  service: string;
  pricingMode: 'package' | 'hourly' | 'wa_survey';
  city: string;
  address: string;
  scheduledAt: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
};

export type Cleaner = {
  id: string;
  name: string;
  phone: string;
  city: string[];
  bringsTools: boolean;
  rating: number;
  jobsDone: number;
  status: 'active' | 'pending_kyc' | 'suspended';
  joinedAt: string;
  thisMonthEarning: number;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpend: number;
  joinedAt: string;
};

export type ChatLog = {
  id: string;
  bookingId: string;
  customerName: string;
  cleanerName: string;
  blocked: boolean;
  blockReason: string | null;
  preview: string;
  at: string;
};

export function formatRupiah(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  return 'Rp ' + (Number.isFinite(num) ? num.toLocaleString('id-ID') : '0');
}

export const STATUS_BADGE: Record<OrderStatus, { label: string; bg: string; fg: string }> = {
  pending_payment: { label: 'Menunggu Bayar', bg: '#FEF3C7', fg: '#B45309' },
  searching: { label: 'Cari Cleaner', bg: '#DBEAFE', fg: '#1D4ED8' },
  matched: { label: 'Cleaner OK', bg: '#D1FAE5', fg: '#047857' },
  on_the_way: { label: 'Otw Lokasi', bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress: { label: 'Dikerjakan', bg: '#FEF3C7', fg: '#B45309' },
  completed: { label: 'Selesai', bg: '#D1FAE5', fg: '#047857' },
  canceled: { label: 'Batal', bg: '#FEE2E2', fg: '#B91C1C' },
  disputed: { label: 'Sengketa', bg: '#FEE2E2', fg: '#B91C1C' },
};
