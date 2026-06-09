import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * Bottom-sheet modal untuk pilih tanggal & jam booking.
 * Dipakai oleh booking biasa (new.tsx) & Full House Custom (custom.tsx)
 * supaya UX seragam.
 */

const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
];

const OPS_START_HOUR = 7;
const OPS_END_HOUR = 20; // last bookable hour inclusive

function clampToOps(d: Date): Date {
  const out = new Date(d);
  if (out.getHours() < OPS_START_HOUR) {
    out.setHours(OPS_START_HOUR, 0, 0, 0);
  } else if (out.getHours() > OPS_END_HOUR) {
    out.setDate(out.getDate() + 1);
    out.setHours(OPS_START_HOUR, 0, 0, 0);
  }
  return out;
}

export type ScheduleModalProps = {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
};

export function ScheduleModal({ visible, value, onChange, onClose }: ScheduleModalProps) {
  const [dateIdx, setDateIdx] = useState(0);
  const [timeSlot, setTimeSlot] = useState<string>('09:00');
  const [useNowTime, setUseNowTime] = useState(false);

  const dateOptions = useMemo(() => {
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const out: { date: Date; label: string; sub: string }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const label = i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : days[d.getDay()] ?? '';
      const sub = `${d.getDate()} ${months[d.getMonth()]}`;
      out.push({ date: d, label, sub });
    }
    return out;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const v = new Date(value); v.setHours(0, 0, 0, 0);
    setDateIdx(Math.max(0, Math.min(13, Math.round((v.getTime() - today.getTime()) / 86400000))));
    const hh = String(value.getHours()).padStart(2, '0');
    setTimeSlot(`${hh}:00`);
    setUseNowTime(false);
  }, [visible, value]);

  const isToday = dateIdx === 0;
  const earliest = new Date(Date.now() + 60 * 60 * 1000);
  // "Sekarang" cuma valid kalau now+1h di dalam jam operasional 07:00–20:00
  const nowInOps = isToday && earliest.getHours() >= OPS_START_HOUR && earliest.getHours() <= OPS_END_HOUR;

  const validSlots = TIME_SLOTS.filter((t) => {
    if (!isToday) return true;
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(); d.setHours(hh!, mm!, 0, 0);
    return d.getTime() >= earliest.getTime();
  });
  const allTodayPast = isToday && validSlots.length === 0;
  const firstValidIdx = isToday && nowInOps
    ? TIME_SLOTS.findIndex((t) => validSlots.includes(t))
    : -1;

  function isSlotValid(t: string): boolean {
    if (!isToday) return true;
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(); d.setHours(hh!, mm!, 0, 0);
    return d.getTime() >= earliest.getTime();
  }

  function confirm() {
    let sel: Date;
    if (useNowTime && isToday && nowInOps) {
      sel = clampToOps(new Date(Date.now() + 60 * 60 * 1000));
    } else {
      sel = new Date(dateOptions[dateIdx]!.date);
      const [hh, mm] = timeSlot.split(':').map(Number);
      sel.setHours(hh!, mm!, 0, 0);
    }
    onChange(sel);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-extrabold text-lg text-ink-900">Pilih Jadwal</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-ink-100">
              <Text className="text-ink-700">×</Text>
            </Pressable>
          </View>

          <Text className="font-semibold mb-2 text-xs text-ink-600">Tanggal</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {dateOptions.map((d, i) => {
                const active = dateIdx === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => { setDateIdx(i); setUseNowTime(false); }}
                    className={`min-w-[72px] items-center rounded-xl border px-3 py-2.5 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                  >
                    <Text className={`font-bold text-xs ${active ? 'text-brand-700' : 'text-ink-900'}`}>{d.label}</Text>
                    <Text className={`mt-0.5 text-[10px] ${active ? 'text-brand-600' : 'text-ink-500'}`}>{d.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {allTodayPast ? (
            <View className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <Text className="font-bold text-sm text-amber-900">Operasional hari ini sudah tutup</Text>
              <Text className="font-medium mt-1 text-[11px] text-amber-800">
                Operasional 07:00–20:00. Pilih tanggal lain untuk lihat slot tersedia.
              </Text>
              <Pressable
                onPress={() => { setDateIdx(1); setUseNowTime(false); }}
                className="mt-3 self-start rounded-full bg-amber-600 px-4 py-2"
              >
                <Text className="font-bold text-xs text-white">Pilih Besok</Text>
              </Pressable>
            </View>
          ) : isToday && !nowInOps ? (
            <View className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <Text className="font-bold text-sm text-amber-900">Di luar jam operasional</Text>
              <Text className="font-medium mt-1 text-[11px] leading-4 text-amber-800">
                Jam operasional 07:00–20:00. Pesanan untuk hari ini sudah tidak bisa dijadwalkan. Pilih Besok untuk lihat slot tersedia.
              </Text>
              <Pressable
                onPress={() => { setDateIdx(1); setUseNowTime(false); }}
                className="mt-3 self-start rounded-full bg-amber-600 px-4 py-2"
              >
                <Text className="font-bold text-xs text-white">Pilih Besok</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text className="font-semibold mt-4 mb-2 text-xs text-ink-600">Jam</Text>
              <View className="flex-row flex-wrap gap-2">
                {(() => {
                  const out: React.ReactNode[] = [];
                  TIME_SLOTS.forEach((t, idx) => {
                    if (idx === firstValidIdx) {
                      const clamped = clampToOps(new Date(Date.now() + 60 * 60 * 1000));
                      const label = `${String(clamped.getHours()).padStart(2, '0')}:${String(clamped.getMinutes()).padStart(2, '0')}`;
                      out.push(
                        <Pressable
                          key="now"
                          onPress={() => { setDateIdx(0); setUseNowTime(true); }}
                          className={`rounded-lg border-2 px-3 py-2 ${useNowTime && isToday ? 'border-emerald-600 bg-emerald-600' : 'border-emerald-400 bg-emerald-50'}`}
                        >
                          <Text className={`font-extrabold text-xs ${useNowTime && isToday ? 'text-white' : 'text-emerald-700'}`}>
                            Sekarang ({label})
                          </Text>
                        </Pressable>,
                      );
                    }
                    const disabled = !isSlotValid(t);
                    const active = timeSlot === t && !useNowTime && !disabled;
                    out.push(
                      <Pressable
                        key={t}
                        disabled={disabled}
                        onPress={() => { setUseNowTime(false); setTimeSlot(t); }}
                        style={disabled ? { opacity: 0.4 } : undefined}
                        className={`rounded-lg border-2 px-3 py-2 ${
                          disabled
                            ? 'border-ink-200 bg-ink-100'
                            : active
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-ink-200 bg-white'
                        }`}
                      >
                        <Text
                          className={`font-bold text-xs ${
                            disabled ? 'text-ink-400 line-through' : active ? 'text-brand-700' : 'text-ink-800'
                          }`}
                        >
                          {t}
                        </Text>
                      </Pressable>,
                    );
                  });
                  return out;
                })()}
              </View>
              <Text className="mt-3 text-[10px] text-ink-500">Operasional 07:00–20:00 · Min 1 jam dari sekarang</Text>
            </>
          )}

          <Pressable
            onPress={confirm}
            disabled={isToday && (allTodayPast || !nowInOps)}
            className={`mt-5 h-12 items-center justify-center rounded-2xl ${isToday && (allTodayPast || !nowInOps) ? 'bg-ink-300' : 'bg-brand-600'}`}
          >
            <Text className="font-bold text-sm text-white">Pilih Jadwal Ini</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
