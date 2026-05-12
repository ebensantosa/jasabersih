import { Calendar, Check, MapPin, Wallet, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { useJobsRealtime } from '../hooks/useJobsRealtime';
import { formatScheduleWithTz } from '../lib/datetime';
import { toast } from '../stores/ui';

const COUNTDOWN_SEC = 30;

export function RealtimeJobModal() {
  const { incoming, dismiss, accept } = useJobsRealtime();
  const [accepting, setAccepting] = useState(false);
  const [secLeft, setSecLeft] = useState(COUNTDOWN_SEC);

  useEffect(() => {
    if (!incoming) { setSecLeft(COUNTDOWN_SEC); return; }
    setSecLeft(COUNTDOWN_SEC);
    const id = setInterval(() => setSecLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [incoming?.id]);

  useEffect(() => {
    if (incoming && secLeft <= 0) dismiss();
  }, [secLeft, incoming, dismiss]);

  if (!incoming) return null;

  async function onAccept() {
    if (!incoming) return;
    setAccepting(true);
    const res = await accept(incoming.id);
    setAccepting(false);
    if (res.ok) toast.success('Job di-accept! Lihat detail di tab Pesanan.');
    else toast.warning(res.error ?? 'Gagal accept');
  }

  const total = Number(incoming.totalAmount ?? 0);
  const payout = Number(incoming.cleanerPayout ?? 0);
  const pct = (secLeft / COUNTDOWN_SEC) * 100;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={dismiss}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-white p-5">
          <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <View style={{ width: `${pct}%` }} className="h-full bg-brand-600" />
          </View>

          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-bold text-base text-brand-700">JOB MASUK</Text>
              <Text className="font-bold text-2xl text-ink-900">{incoming.serviceName ?? 'Layanan'}</Text>
            </View>
            <Text className="font-bold text-2xl text-ink-900">{secLeft}s</Text>
          </View>

          <View className="mt-4 space-y-2">
            <Row icon={<MapPin color="#475569" size={16} />} text={incoming.addressLine} />
            <Row icon={<Calendar color="#475569" size={16} />} text={formatScheduleWithTz(incoming.scheduledAt, (incoming as any).addressLine)} />
            <Row icon={<Wallet color="#047857" size={16} />} text={`Total Rp ${total.toLocaleString('id-ID')} · Bagian kamu Rp ${payout.toLocaleString('id-ID')}`} bold />
          </View>

          <View className="mt-4 flex-row gap-2">
            <Pressable onPress={dismiss} className="flex-1 items-center justify-center rounded-xl bg-ink-100 py-3.5">
              <View className="flex-row items-center gap-1">
                <X color="#475569" size={16} />
                <Text className="font-semibold text-sm text-ink-700">Tolak</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={onAccept}
              disabled={accepting}
              className={`flex-1 items-center justify-center rounded-xl py-3.5 ${accepting ? 'bg-success/60' : 'bg-success'}`}
            >
              {accepting ? <ActivityIndicator color="white" /> : (
                <View className="flex-row items-center gap-1">
                  <Check color="white" size={16} strokeWidth={2.4} />
                  <Text className="font-bold text-sm text-white">Accept</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, text, bold }: { icon: React.ReactNode; text: string; bold?: boolean }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-0.5">{icon}</View>
      <Text className={`flex-1 ${bold ? 'font-bold' : 'font-sans'} text-sm text-ink-800`}>{text}</Text>
    </View>
  );
}
