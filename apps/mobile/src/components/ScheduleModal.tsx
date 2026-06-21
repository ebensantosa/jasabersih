import * as Haptics from 'expo-haptics';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * Bottom-sheet modal untuk pilih tanggal & jam booking.
 * Quick chips untuk H+0..H+13, plus tombol "Tanggal Lain" untuk pilih tanggal bebas (max 90 hari ke depan).
 * Time slots per jam + "Sekarang" + "Jam Lain" untuk waktu bebas.
 */


const OPS_START_HOUR = 7;
// Maksimal JAM MULAI = 21:00. Pesanan selesai setelah 21:00 kena biaya lembur.
const OPS_END_HOUR = 21;
const MAX_DAYS_AHEAD = 90;
const QUICK_DAYS = 14;

function clampToOps(d: Date): Date {
  const out = new Date(d);
  if (out.getHours() < OPS_START_HOUR) {
    out.setHours(OPS_START_HOUR, 0, 0, 0);
  } else if (out.getHours() > OPS_END_HOUR || (out.getHours() === OPS_END_HOUR && out.getMinutes() > 0)) {
    // Lewat jam mulai maks → jadwalkan besok jam OPS_START_HOUR
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

const WHEEL_ITEM_H = 46;
const WHEEL_PAD = 2; // 2 item atas & bawah = total 5 item terlihat
const WHEEL_H = WHEEL_ITEM_H * (WHEEL_PAD * 2 + 1);

function WheelColumn({
  items,
  selectedIndex,
  onChange,
  flex,
}: {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  flex?: number;
}) {
  const ref = useRef<ScrollView>(null);
  const lastHapticIdx = useRef(selectedIndex);

  useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_H, animated: false });
  }, [selectedIndex]);

  const commit = (offsetY: number, forceScroll = false) => {
    const i = Math.max(0, Math.min(Math.round(offsetY / WHEEL_ITEM_H), items.length - 1));
    if (forceScroll) ref.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: true });
    if (i !== lastHapticIdx.current) {
      lastHapticIdx.current = i;
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
    onChange(i);
  };

  return (
    <View style={{ flex: flex ?? 1, height: WHEEL_H, overflow: 'hidden' }}>
      {/* Pill highlight item terpilih — tanpa zIndex supaya ScrollView selalu di atas */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: WHEEL_ITEM_H * WHEEL_PAD, height: WHEEL_ITEM_H,
        left: 4, right: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 12,
      }} />

      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_H }}
        onMomentumScrollEnd={(e) => commit(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => commit(e.nativeEvent.contentOffset.y, true)}
      >
        {Array.from({ length: WHEEL_PAD }).map((_, i) => <View key={`pt-${i}`} style={{ height: WHEEL_ITEM_H }} />)}
        {items.map((item, i) => {
          const dist = Math.abs(i - selectedIndex);
          return (
            <Pressable
              key={item}
              style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                onChange(i);
                ref.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: true });
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={{
                fontSize: dist === 0 ? 24 : 19,
                fontWeight: dist === 0 ? '700' : '400',
                color: dist === 0 ? '#1E293B' : dist === 1 ? '#64748B' : '#94A3B8',
              }}>
                {item}
              </Text>
            </Pressable>
          );
        })}
        {Array.from({ length: WHEEL_PAD }).map((_, i) => <View key={`pb-${i}`} style={{ height: WHEEL_ITEM_H }} />)}
      </ScrollView>

      {/* Fade hanya di ujung paling atas/bawah saja */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 20,
        backgroundColor: 'rgba(255,255,255,0.9)',
      }} />
      <View pointerEvents="none" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
        backgroundColor: 'rgba(255,255,255,0.9)',
      }} />
    </View>
  );
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
  const [selHour, setSelHour] = useState(9);
  const [selMinute, setSelMinute] = useState(0);
  const [useNowTime, setUseNowTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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
    setSelHour(value.getHours());
    // Snap menit ke 15 terdekat
    setSelMinute(Math.round(value.getMinutes() / 15) * 15 % 60);
    setUseNowTime(false);
  }, [visible, value]);

  const todayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const isToday = selectedDate.getTime() === todayStart.getTime();
  const earliest = new Date(Date.now() + 60 * 60 * 1000);
  const nowInOps = isToday && earliest.getHours() >= OPS_START_HOUR && earliest.getHours() <= OPS_END_HOUR;

  // Hours & minutes lists for wheel
  const MINUTES = [0, 15, 30, 45];
  const ALL_HOURS = Array.from({ length: OPS_END_HOUR - OPS_START_HOUR + 1 }, (_, i) => i + OPS_START_HOUR);

  // Filter valid hours for today
  const validHours = ALL_HOURS.filter(hr => {
    if (!isToday) return true;
    const mins = hr === OPS_END_HOUR ? [0] : MINUTES;
    return mins.some(mn => {
      const d = new Date(); d.setHours(hr, mn, 0, 0);
      return d.getTime() >= earliest.getTime();
    });
  });

  const allTodayPast = isToday && validHours.length === 0;

  // Clamp selHour ke valid range — harus dideklarasi SEBELUM validMinutes
  const h = validHours.includes(selHour) ? selHour : (validHours[0] ?? OPS_START_HOUR);

  // Filter valid minutes untuk jam terpilih
  const validMinutes = (h === OPS_END_HOUR ? [0] : MINUTES).filter(mn => {
    if (!isToday) return true;
    const d = new Date(); d.setHours(h, mn, 0, 0);
    return d.getTime() >= earliest.getTime();
  });

  const m = validMinutes.includes(selMinute) ? selMinute : (validMinutes[0] ?? 0);

  const hourIndex = validHours.indexOf(h);
  const minuteIndex = validMinutes.indexOf(m);

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
      sel.setHours(h, m, 0, 0);
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

          {/* STEP 1: TANGGAL */}
          <View className="mb-1 flex-row items-center gap-2">
            <View className="h-5 w-5 items-center justify-center rounded-full bg-brand-600">
              <Text className="font-extrabold text-[10px] text-white">1</Text>
            </View>
            <Text className="font-extrabold text-sm text-ink-900">Pilih Tanggal</Text>
          </View>
          <Text className="font-medium mb-2 ml-7 text-[11px] text-ink-500">
            {isCustomDate ? `📅 ${fmtDateLabel(selectedDate)}` : `${fmtDateLabel(selectedDate)}`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {quickDates.slice(0, 7).map((d, i) => {
                const active = quickIdx === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => pickDate(d.date)}
                    className={`min-w-[68px] items-center rounded-xl border px-3 py-2.5 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'}`}
                  >
                    <Text className={`font-bold text-[11px] ${active ? 'text-white' : 'text-ink-900'}`}>{d.label}</Text>
                    <Text className={`mt-0.5 text-[10px] ${active ? 'text-white/85' : 'text-ink-500'}`}>{d.sub}</Text>
                  </Pressable>
                );
              })}
              {/* Tombol "Tanggal lain" terlihat jelas sebagai opsi 8 */}
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className={`min-w-[68px] items-center justify-center rounded-xl border-2 border-dashed px-3 py-2.5 ${isCustomDate ? 'border-brand-600 bg-brand-50' : 'border-brand-400 bg-white'}`}
              >
                <Calendar color="#1D4ED8" size={16} />
                <Text className="font-bold mt-0.5 text-[10px] text-brand-700">{isCustomDate ? 'Ubah' : 'Tanggal'}</Text>
                <Text className="font-medium text-[9px] text-brand-600">{isCustomDate ? `${selectedDate.getDate()}/${selectedDate.getMonth() + 1}` : 'Lainnya'}</Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* STEP 2: JAM */}
          <View className="mt-5 mb-3 flex-row items-center gap-2">
            <View className="h-5 w-5 items-center justify-center rounded-full bg-brand-600">
              <Text className="font-extrabold text-[10px] text-white">2</Text>
            </View>
            <Text className="font-extrabold text-sm text-ink-900">Pilih Jam</Text>
          </View>

          {allTodayPast ? (
            <View className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <Text className="font-bold text-sm text-amber-900">⏰ Operasional hari ini sudah tutup</Text>
              <Text className="font-medium mt-1 text-[11px] text-amber-800">
                Pilih tanggal lain di langkah 1 untuk lihat jam yang tersedia.
              </Text>
            </View>
          ) : isToday && !nowInOps ? (
            <View className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <Text className="font-bold text-sm text-amber-900">⏰ Sudah lewat jam mulai maks</Text>
              <Text className="font-medium mt-1 text-[11px] leading-4 text-amber-800">
                Pemesanan hari ini maksimal mulai pukul 21:00. Pilih tanggal besok atau lainnya.
              </Text>
            </View>
          ) : (
            <>
              {/* Tombol Sekarang */}
              {nowInOps && (
                <Pressable
                  onPress={() => setUseNowTime(true)}
                  className={`mb-4 flex-row items-center justify-between rounded-xl border-2 p-3 ${useNowTime ? 'border-emerald-600 bg-emerald-600' : 'border-emerald-400 bg-emerald-50'}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base">⚡</Text>
                    <View>
                      <Text className={`font-extrabold text-sm ${useNowTime ? 'text-white' : 'text-emerald-800'}`}>Sekarang (1 jam lagi)</Text>
                      <Text className={`font-medium text-[11px] ${useNowTime ? 'text-white/85' : 'text-emerald-700'}`}>Cleaner langsung berangkat</Text>
                    </View>
                  </View>
                  <Text className={`font-extrabold text-sm ${useNowTime ? 'text-white' : 'text-emerald-700'}`}>
                    {String(clampToOps(new Date(Date.now() + 60 * 60 * 1000)).getHours()).padStart(2, '0')}:{String(clampToOps(new Date(Date.now() + 60 * 60 * 1000)).getMinutes()).padStart(2, '0')}
                  </Text>
                </Pressable>
              )}

              {/* Wheel picker jam & menit */}
              <Pressable onPress={() => setUseNowTime(false)} activeOpacity={1}>
                <View style={{ opacity: useNowTime ? 0.3 : 1 }} pointerEvents={useNowTime ? 'none' : 'auto'}>
                  {/* Label kolom */}
                  <View style={{ flexDirection: 'row', paddingHorizontal: 8, marginBottom: 4 }}>
                    <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#94A3B8', letterSpacing: 1 }}>JAM</Text>
                    <View style={{ width: 32 }} />
                    <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#94A3B8', letterSpacing: 1 }}>MENIT</Text>
                  </View>
                  {/* Wheel */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 4 }}>
                    <WheelColumn
                      flex={1}
                      items={validHours.map(hh => String(hh).padStart(2, '0'))}
                      selectedIndex={Math.max(0, hourIndex)}
                      onChange={(i) => {
                        setUseNowTime(false);
                        const newH = validHours[i] ?? OPS_START_HOUR;
                        setSelHour(newH);
                        const newMins = newH === OPS_END_HOUR ? [0] : MINUTES;
                        if (!newMins.includes(selMinute)) setSelMinute(newMins[0] ?? 0);
                      }}
                    />
                    <View style={{ width: 32, alignItems: 'center', justifyContent: 'center', height: WHEEL_H }}>
                      <Text style={{ fontSize: 24, fontWeight: '300', color: '#CBD5E1' }}>:</Text>
                    </View>
                    <WheelColumn
                      flex={1}
                      items={validMinutes.map(mm => String(mm).padStart(2, '0'))}
                      selectedIndex={Math.max(0, minuteIndex)}
                      onChange={(i) => {
                        setUseNowTime(false);
                        setSelMinute(validMinutes[i] ?? 0);
                      }}
                    />
                  </View>
                  <Text style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#94A3B8' }}>WIB</Text>
                </View>
              </Pressable>
              <Text className="mt-2 text-[10px] text-ink-400">07:00–21:00 · min 1 jam dari sekarang · selesai &gt;21:00 kena biaya lembur</Text>
            </>
          )}

          <Pressable
            onPress={confirm}
            disabled={isToday && allTodayPast}
            className={`mt-5 h-12 items-center justify-center rounded-2xl ${isToday && allTodayPast ? 'bg-ink-300' : 'bg-brand-600'}`}
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

