import { Check, Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { api } from '../lib/api';

type ServerBooking = {
  paid_at: string | null;
  matched_at: string | null;
  cleaner_otw_at: string | null;
  cleaner_arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  status: string;
};

const STEPS: { key: keyof ServerBooking; label: string }[] = [
  { key: 'paid_at', label: 'Dibayar' },
  { key: 'matched_at', label: 'Cleaner ditemukan' },
  { key: 'cleaner_otw_at', label: 'Cleaner menuju lokasi' },
  { key: 'cleaner_arrived_at', label: 'Cleaner sampai / mulai kerja' },
  { key: 'completed_at', label: 'Selesai' },
];

function fmt(t: string | null): string {
  if (!t) return '';
  return new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function BookingTimeline({ bookingId, status }: { bookingId: string; status?: string }) {
  const [data, setData] = useState<ServerBooking | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-fetch tiap status berubah supaya timeline sinkron dgn UI stepper di atasnya.
  // Sebelumnya cuma fetch sekali per mount -> kalau cleaner advance status,
  // timeline masih nampilin state lama sampai user back+masuk lagi.
  useEffect(() => {
    if (bookingId.startsWith('bk_')) { setLoading(false); return; }
    setLoading(true);
    api.get(`/bookings/${bookingId}`)
      .then((r) => setData((r.data?.data ?? r.data) as ServerBooking))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingId, status]);

  if (loading) {
    return <View className="items-center py-4"><ActivityIndicator size="small" color="#94A3B8" /></View>;
  }
  if (!data) return null;

  // Find current step (last with timestamp)
  let currentIdx = -1;
  STEPS.forEach((s, i) => { if (data[s.key]) currentIdx = i; });

  return (
    <View className="rounded-2xl bg-white p-4">
      <Text className="font-bold mb-3 text-sm text-ink-900">Timeline Order</Text>
      {STEPS.map((s, i) => {
        const ts = data[s.key] as string | null;
        const done = !!ts;
        const current = i === currentIdx && data.status !== 'completed';
        return (
          <View key={s.key} className="flex-row gap-3">
            {/* Dot + line */}
            <View className="items-center" style={{ width: 24 }}>
              <View className={`h-6 w-6 items-center justify-center rounded-full ${
                done ? 'bg-success' : current ? 'bg-amber-400' : 'bg-ink-200'
              }`}>
                {done ? <Check color="white" size={12} strokeWidth={3} /> : current ? <Clock color="white" size={12} /> : null}
              </View>
              {i < STEPS.length - 1 && (
                <View className={`my-1 w-0.5 flex-1 ${done ? 'bg-success' : 'bg-ink-200'}`} style={{ minHeight: 16 }} />
              )}
            </View>
            <View className="flex-1 pb-3">
              <Text className={`font-semibold text-xs ${done ? 'text-ink-900' : current ? 'text-amber-700' : 'text-ink-400'}`}>{s.label}</Text>
              <Text className="font-sans text-[10px] text-ink-500">{ts ? fmt(ts) : current ? 'Sedang berjalan…' : '-'}</Text>
            </View>
          </View>
        );
      })}
      {data.canceled_at && (
        <View className="mt-2 rounded-md border border-red-200 bg-red-50 p-2">
          <Text className="font-bold text-xs text-red-700">Dibatalkan {fmt(data.canceled_at)}</Text>
        </View>
      )}
    </View>
  );
}
