import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * Bottom-sheet modal untuk pilih tanggal & jam booking.
 * Quick chips untuk H+0..H+13, plus tombol "Tanggal Lain" untuk pilih tanggal bebas (max 90 hari ke depan).
 * Time slots per jam + "Sekarang" + "Jam Lain" untuk waktu bebas.
 */

const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
];

const OPS_START_HOUR = 7;
const OPS_END_HOUR = 20;
const MAX_DAYS_AHEAD = 90;
const QUICK_DAYS = 14;

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

function fmtDateLabel(d: Date): string {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export type ScheduleModalProps = {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
};

export function ScheduleModal({ visible, value, onChange, onClose }: ScheduleModalProps) {
  // selectedDate = tanggal 00:00 yg user pilih (independent dari time)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [timeSlot, setTimeSlot] = useState<string>('09:00');
  const [useNowTime, setUseNowTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customTime, setCustomTime] = useState<{ h: number; m: number } | null>(null);

  const quickDates = useMemo(() => {
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const out: { date: Date; label: string; sub: string }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 0; i < QUICK_DAYS; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const label = i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : days[d.getDay()] ?? '';
      const sub = `${d.getDate()} ${months[d.getMonth()]}`;
      out.push({ date: d, label, sub });
    }
    return out;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const v = new Date(value); v.setHours(0, 0, 0, 0);
    setSelectedDate(v);
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    // Cek apakah jam value match dengan slot
    const slotMatch = TIME_SLOTS.includes(`${hh}:00`) && value.getMinutes() === 0;
    if (slotMatch) {
      setTimeSlot(`${hh}:00`);
      setCustomTime(null);
    } else {
      setCustomTime({ h: value.getHours(), m: value.getMinutes() });
      setTimeSlot(`${hh}:${mm}`);
    }
    setUseNowTime(false);
  }, [visible, value]);

  const todayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const isToday = selectedDate.getTime() === todayStart.getTime();
  const earliest = new Date(Date.now() + 60 * 60 * 1000);
  const nowInOps = isToday && earliest.getHours() >= OPS_START_HOUR && earliest.getHours() <= OPS_END_HOUR;

  function isSlotValid(t: string): boolean {
    if (!isToday) return true;
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(); d.setHours(hh!, mm!, 0, 0);
    return d.getTime() >= earliest.getTime();
  }

  const validSlots = TIME_SLOTS.filter((t) => isSlotValid(t));
  const allTodayPast = isToday && validSlots.length === 0;
  const firstValidIdx = isToday && nowInOps
    ? TIME_SLOTS.findIndex((t) => validSlots.includes(t))
    : -1;

  // Check if quick chip matches selectedDate
  const quickIdx = quickDates.findIndex((q) => q.date.getTime() === selectedDate.getTime());
  const isCustomDate = quickIdx === -1;

  function pickDate(d: Date) {
    const n = new Date(d); n.setHours(0, 0, 0, 0);
    setSelectedDate(n);
    setUseNowTime(false);
  }

  function confirm() {
    let sel: Date;
    if (useNowTime && isToday && nowInOps) {
      sel = clampToOps(new Date(Date.now() + 60 * 60 * 1000));
    } else {
      sel = new Date(selectedDate);
      if (customTime) {
        sel.setHours(customTime.h, customTime.m, 0, 0);
      } else {
        const [hh, mm] = timeSlot.split(':').map(Number);
        sel.setHours(hh!, mm!, 0, 0);
      }
    }
    onChange(sel);
  }

  const maxDate = (() => { const d = new Date(); d.setDate(d.getDate() + MAX_DAYS_AHEAD); return d; })();

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

          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-semibold text-xs text-ink-600">Tanggal</Text>
            {/* Tombol custom date - prominent di kanan biar gampang ditemuin */}
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${isCustomDate ? 'bg-brand-600' : 'bg-brand-50'}`}
            >
              <Calendar color={isCustomDate ? 'white' : '#1D4ED8'} size={12} />
              <Text className={`font-bold text-[11px] ${isCustomDate ? 'text-white' : 'text-brand-700'}`}>
                {isCustomDate ? fmtDateLabel(selectedDate).slice(0, 12) : 'Bulan Depan / Lainnya'}
              </Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {quickDates.map((d, i) => {
                const active = quickIdx === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => pickDate(d.date)}
                    className={`min-w-[72px] items-center rounded-xl border px-3 py-2.5 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                  >
                    <Text className={`font-bold text-xs ${active ? 'text-brand-700' : 'text-ink-900'}`}>{d.label}</Text>
                    <Text className={`mt-0.5 text-[10px] ${active ? 'text-brand-600' : 'text-ink-500'}`}>{d.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {isCustomDate && (
            <View className="mt-2 self-start rounded-full bg-brand-50 px-3 py-1">
              <Text className="font-bold text-[11px] text-brand-700">📅 {fmtDateLabel(selectedDate)}</Text>
            </View>
          )}

          {allTodayPast ? (
            <View className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <Text className="font-bold text-sm text-amber-900">Operasional hari ini sudah tutup</Text>
              <Text className="font-medium mt-1 text-[11px] text-amber-800">
                Operasional 07:00-20:00. Pilih tanggal lain untuk lihat slot tersedia.
              </Text>
            </View>
          ) : isToday && !nowInOps ? (
            <View className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <Text className="font-bold text-sm text-amber-900">Di luar jam operasional</Text>
              <Text className="font-medium mt-1 text-[11px] leading-4 text-amber-800">
                Jam operasional 07:00-20:00. Pesanan hari ini sudah tidak bisa dijadwalkan. Pilih tanggal lain.
              </Text>
            </View>
          ) : (
            <>
              <View className="mt-4 mb-2 flex-row items-center justify-between">
                <Text className="font-semibold text-xs text-ink-600">Jam</Text>
                {/* Tombol custom time - prominent biar discoverable */}
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${customTime ? 'bg-brand-600' : 'bg-brand-50'}`}
                >
                  <Clock color={customTime ? 'white' : '#1D4ED8'} size={12} />
                  <Text className={`font-bold text-[11px] ${customTime ? 'text-white' : 'text-brand-700'}`}>
                    {customTime ? `${String(customTime.h).padStart(2, '0')}:${String(customTime.m).padStart(2, '0')}` : 'Pilih Jam Bebas'}
                  </Text>
                </Pressable>
              </View>
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
                          onPress={() => { setUseNowTime(true); setCustomTime(null); }}
                          className={`rounded-lg border-2 px-3 py-2 ${useNowTime && isToday ? 'border-emerald-600 bg-emerald-600' : 'border-emerald-400 bg-emerald-50'}`}
                        >
                          <Text className={`font-extrabold text-xs ${useNowTime && isToday ? 'text-white' : 'text-emerald-700'}`}>
                            Sekarang ({label})
                          </Text>
                        </Pressable>,
                      );
                    }
                    const disabled = !isSlotValid(t);
                    const active = !customTime && timeSlot === t && !useNowTime && !disabled;
                    out.push(
                      <Pressable
                        key={t}
                        disabled={disabled}
                        onPress={() => { setUseNowTime(false); setTimeSlot(t); setCustomTime(null); }}
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
              <Text className="mt-3 text-[10px] text-ink-500">Operasional 07:00-20:00 · Min 1 jam dari sekarang · Tap "Jam Lain" untuk pilih jam custom</Text>
            </>
          )}

          <Pressable
            onPress={confirm}
            disabled={isToday && (allTodayPast || (!nowInOps && !customTime))}
            className={`mt-5 h-12 items-center justify-center rounded-2xl ${isToday && (allTodayPast || (!nowInOps && !customTime)) ? 'bg-ink-300' : 'bg-brand-600'}`}
          >
            <Text className="font-bold text-sm text-white">Pilih Jadwal Ini</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      {/* Date picker — inline calendar untuk semua platform (native picker gak jalan di web) */}
      {showDatePicker && (
        <InlineDatePicker
          value={selectedDate}
          minDate={todayStart}
          maxDate={maxDate}
          onPick={(d) => { pickDate(d); setShowDatePicker(false); }}
          onClose={() => setShowDatePicker(false)}
        />
      )}
      {/* Time picker — slot grid 15-min, cross-platform */}
      {showTimePicker && (
        <InlineTimePicker
          initialHour={customTime?.h ?? Number(timeSlot.split(':')[0])}
          initialMinute={customTime?.m ?? Number(timeSlot.split(':')[1])}
          onPick={(h, m) => {
            setCustomTime({ h, m });
            setTimeSlot(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            setUseNowTime(false);
            setShowTimePicker(false);
          }}
          onClose={() => setShowTimePicker(false)}
        />
      )}
    </Modal>
  );
}

// Cross-platform inline date picker (month calendar grid)
function InlineDatePicker({ value, minDate, maxDate, onPick, onClose }: {
  value: Date; minDate: Date; maxDate: Date;
  onPick: (d: Date) => void; onClose: () => void;
}) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const firstOfMonth = new Date(view.getFullYear(), view.getMonth(), 1);
  const lastOfMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0);
  const startOffset = firstOfMonth.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastOfMonth.getDate(); d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  function canGoPrev() {
    const prev = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    return prev.getTime() >= new Date(minDate.getFullYear(), minDate.getMonth(), 1).getTime();
  }
  function canGoNext() {
    const next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    return next.getTime() <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1).getTime();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, maxWidth: 380, alignSelf: 'center', width: '100%' }}>
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable
              onPress={() => canGoPrev() && setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              disabled={!canGoPrev()}
              style={{ opacity: canGoPrev() ? 1 : 0.3 }}
              className="h-9 w-9 items-center justify-center rounded-full bg-ink-100"
            >
              <ChevronLeft color="#475569" size={18} />
            </Pressable>
            <Text className="font-extrabold text-base text-ink-900">{months[view.getMonth()]} {view.getFullYear()}</Text>
            <Pressable
              onPress={() => canGoNext() && setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              disabled={!canGoNext()}
              style={{ opacity: canGoNext() ? 1 : 0.3 }}
              className="h-9 w-9 items-center justify-center rounded-full bg-ink-100"
            >
              <ChevronRight color="#475569" size={18} />
            </Pressable>
          </View>
          <View className="flex-row">
            {days.map((dn, i) => (
              <View key={dn} className="flex-1 items-center py-1.5">
                <Text className={`font-bold text-[10px] uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-ink-400'}`}>{dn}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {cells.map((d, i) => {
              if (!d) return <View key={`e-${i}`} style={{ width: `${100 / 7}%` }} className="p-0.5" />;
              const dNorm = new Date(d); dNorm.setHours(0, 0, 0, 0);
              const isPast = dNorm.getTime() < minDate.getTime();
              const isAfter = dNorm.getTime() > maxDate.getTime();
              const disabled = isPast || isAfter;
              const isSelected = dNorm.getTime() === new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
              const isSunday = d.getDay() === 0;
              return (
                <View key={d.toISOString()} style={{ width: `${100 / 7}%` }} className="p-0.5">
                  <Pressable
                    disabled={disabled}
                    onPress={() => onPick(dNorm)}
                    style={disabled ? { opacity: 0.25 } : undefined}
                    className={`aspect-square items-center justify-center rounded-xl ${isSelected ? 'bg-brand-600' : disabled ? 'bg-ink-100' : 'bg-ink-50'}`}
                  >
                    <Text className={`font-extrabold text-sm ${isSelected ? 'text-white' : isSunday ? 'text-red-500' : 'text-ink-900'}`}>{d.getDate()}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <Pressable onPress={onClose} className="mt-3 py-2">
            <Text className="font-semibold text-center text-xs text-ink-500">Tutup</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Cross-platform wheel-style time picker (iOS-like 3-column spinner).
// 24-hour format dgn jam 07-20 (ops hours), menit 0/15/30/45.
function InlineTimePicker({ initialHour, initialMinute, onPick, onClose }: {
  initialHour: number; initialMinute: number;
  onPick: (h: number, m: number) => void; onClose: () => void;
}) {
  const HOURS = Array.from({ length: OPS_END_HOUR - OPS_START_HOUR + 1 }, (_, i) => OPS_START_HOUR + i);
  // Step 5 menit (00, 05, 10, ..., 55) - granular biar customer bisa pilih jam spesifik
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
  const [h, setH] = useState(initialHour);
  const [m, setM] = useState(() => MINUTES.reduce((closest, curr) => Math.abs(curr - initialMinute) < Math.abs(closest - initialMinute) ? curr : closest, MINUTES[0]!));

  function adjustH(delta: number) {
    const idx = HOURS.indexOf(h);
    const next = HOURS[Math.max(0, Math.min(HOURS.length - 1, idx + delta))];
    if (next !== undefined) setH(next);
  }
  function adjustM(delta: number) {
    const idx = MINUTES.indexOf(m);
    const next = MINUTES[Math.max(0, Math.min(MINUTES.length - 1, idx + delta))];
    if (next !== undefined) setM(next);
  }

  function Column({ values, current, format }: { values: number[]; current: number; format: (v: number) => string }) {
    const idx = values.indexOf(current);
    const prev2 = idx >= 2 ? values[idx - 2] : null;
    const prev1 = idx >= 1 ? values[idx - 1] : null;
    const next1 = idx < values.length - 1 ? values[idx + 1] : null;
    const next2 = idx < values.length - 2 ? values[idx + 2] : null;
    return (
      <View className="items-center" style={{ width: 64 }}>
        <Text className="font-medium text-base text-ink-200" style={{ height: 28 }}>{prev2 != null ? format(prev2) : ''}</Text>
        <Text className="font-medium text-base text-ink-300" style={{ height: 28 }}>{prev1 != null ? format(prev1) : ''}</Text>
        <View className="items-center justify-center rounded-xl border border-ink-200 bg-white" style={{ height: 40, width: 64 }}>
          <Text className="font-extrabold text-lg text-ink-900">{format(current)}</Text>
        </View>
        <Text className="font-medium text-base text-ink-300" style={{ height: 28 }}>{next1 != null ? format(next1) : ''}</Text>
        <Text className="font-medium text-base text-ink-200" style={{ height: 28 }}>{next2 != null ? format(next2) : ''}</Text>
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, alignSelf: 'center' }}>
          <Text className="font-semibold mb-4 text-center text-sm text-ink-700">Pilih Jam</Text>
          <View className="flex-row items-center justify-center gap-2">
            {/* HOUR column */}
            <View className="items-center">
              <Pressable onPress={() => adjustH(-1)} disabled={HOURS.indexOf(h) === 0} style={{ opacity: HOURS.indexOf(h) === 0 ? 0.25 : 1 }} className="h-7 items-center justify-center">
                <Text className="font-bold text-base text-ink-500">▲</Text>
              </Pressable>
              <Column values={HOURS} current={h} format={(v) => String(v).padStart(2, '0')} />
              <Pressable onPress={() => adjustH(1)} disabled={HOURS.indexOf(h) === HOURS.length - 1} style={{ opacity: HOURS.indexOf(h) === HOURS.length - 1 ? 0.25 : 1 }} className="h-7 items-center justify-center">
                <Text className="font-bold text-base text-ink-500">▼</Text>
              </Pressable>
            </View>

            <Text className="font-extrabold text-xl text-ink-700" style={{ paddingTop: 12 }}>:</Text>

            {/* MINUTE column */}
            <View className="items-center">
              <Pressable onPress={() => adjustM(-1)} disabled={MINUTES.indexOf(m) === 0} style={{ opacity: MINUTES.indexOf(m) === 0 ? 0.25 : 1 }} className="h-7 items-center justify-center">
                <Text className="font-bold text-base text-ink-500">▲</Text>
              </Pressable>
              <Column values={MINUTES} current={m} format={(v) => String(v).padStart(2, '0')} />
              <Pressable onPress={() => adjustM(1)} disabled={MINUTES.indexOf(m) === MINUTES.length - 1} style={{ opacity: MINUTES.indexOf(m) === MINUTES.length - 1 ? 0.25 : 1 }} className="h-7 items-center justify-center">
                <Text className="font-bold text-base text-ink-500">▼</Text>
              </Pressable>
            </View>
          </View>

          <View className="mt-6 flex-row items-center justify-end gap-4">
            <Pressable onPress={onClose} className="px-3 py-2">
              <Text className="font-semibold text-sm text-ink-600">Batal</Text>
            </Pressable>
            <Pressable
              onPress={() => onPick(h, m)}
              className="rounded-lg bg-brand-600 px-4 py-2"
            >
              <Text className="font-bold text-sm text-white">Simpan</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
