import { AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { api } from '../lib/api';
import { useVisiblePoll } from '../lib/useVisiblePoll';
import { useConfig } from '../stores/appContent';

type BankHealth = {
  code: string;
  name: string;
  status: 'normal' | 'delayed' | 'down';
  message: string;
};

/**
 * Banner peringatan gangguan bank/payment.
 *
 * Dua sumber data:
 * 1. Admin manual: `payment.maintenance_notice` di app_config.
 * 2. Live dari Flip: GET /payments/bank-health (data dari Flip webhook +
 *    admin override). Auto-show kalau ada bank dgn status delayed/down.
 *
 * Banner tampil kalau salah satu sumber ada gangguan. Notice manual
 * di-prioritize (admin tau lebih detail), live data jadi fallback.
 */
export function MaintenanceBanner() {
  const manualNotice = useConfig('payment.maintenance_notice', '');
  const [issues, setIssues] = useState<BankHealth[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/payments/bank-health');
      const list: BankHealth[] = r.data?.data ?? r.data ?? [];
      setIssues(list.filter((b) => b.status !== 'normal'));
    } catch { /* silent */ }
  }, []);

  // Pakai useVisiblePoll biar berhenti saat app di background.
  // 5 menit cukup — bank health jarang berubah tiap menit.
  useVisiblePoll(load, 5 * 60_000);

  const hasManual = !!manualNotice && manualNotice.trim().length > 0;
  const hasLive = issues.length > 0;

  // Semua aman -> banner hijau positif. Kasih kepercayaan diri ke user
  // bahwa sistem dimonitor & semua bank operasional.
  if (!hasManual && !hasLive) {
    return (
      <View
        className="flex-row items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
        style={{ borderLeftWidth: 4, borderLeftColor: '#059669' }}
      >
        <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-emerald-200">
          <CheckCircle2 color="#047857" size={14} strokeWidth={2.4} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-[12px] text-emerald-900">Semua bank operasional</Text>
          <Text className="font-medium mt-0.5 text-[11px] leading-4 text-emerald-800">
            Tidak ada gangguan terdeteksi. Transfer ke semua bank & e-wallet berjalan normal.
          </Text>
        </View>
      </View>
    );
  }

  // Compose message: manual notice di atas, lalu daftar bank issue auto.
  return (
    <View
      className="flex-row items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
      style={{ borderLeftWidth: 4, borderLeftColor: '#D97706' }}
    >
      <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-amber-200">
        <AlertTriangle color="#B45309" size={14} strokeWidth={2.4} />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-[12px] text-amber-900">Gangguan Bank / Pembayaran</Text>
        {hasManual && (
          <Text className="font-medium mt-0.5 text-[11px] leading-4 text-amber-800">{manualNotice}</Text>
        )}
        {hasLive && (
          <View className="mt-1.5 gap-1">
            {issues.map((b) => (
              <Text key={b.code} className="font-medium text-[11px] leading-4 text-amber-800">
                <Text className="font-bold">{b.name}</Text>
                {b.status === 'down' ? ' - sedang gangguan' : ' - sedang tertunda'}
                {b.message ? `: ${b.message}` : ''}
              </Text>
            ))}
          </View>
        )}
        {hasLive && !hasManual && (
          <Text className="font-medium mt-1.5 text-[10px] italic text-amber-700">
            Status di-update otomatis dari sistem pembayaran.
          </Text>
        )}
      </View>
    </View>
  );
}
