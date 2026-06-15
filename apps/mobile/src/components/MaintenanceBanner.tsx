import { AlertTriangle } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useConfig } from '../stores/appContent';

/**
 * Banner peringatan gangguan bank/payment.
 * Admin set 'payment.maintenance_notice' di app_config -> banner tampil di
 * wallet, withdraw, dan checkout. Kosongkan -> banner hide.
 */
export function MaintenanceBanner() {
  const notice = useConfig('payment.maintenance_notice', '');
  if (!notice || !notice.trim()) return null;
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
        <Text className="font-medium mt-0.5 text-[11px] leading-4 text-amber-800">{notice}</Text>
      </View>
    </View>
  );
}
