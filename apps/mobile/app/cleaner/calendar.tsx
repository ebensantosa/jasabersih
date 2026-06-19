import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

type Job = {
  id: string;
  status: string;
  scheduledAt: string;
  cleanerPayout: number | null;
  addressLine: string | null;
  serviceName: string;
  customerName: string | null;
};

function formatMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function CleanerCalendar() {
  const router = useRouter();
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const { api } = await import('../../src/lib/api');
        const r = await api.get(`/cleaner/jobs/calendar?month=${formatMonth(monthDate)}`);
        const items = (r.data?.data ?? r.data ?? []) as Job[];
        if (mounted) setJobs(items);
      } catch {
        if (mounted) setJobs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [monthDate]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const d = new Date(j.scheduledAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    }
    return map;
  }, [jobs]);

  const totalEarning = jobs.reduce((s, j) => s + (Number(j.cleanerPayout) || 0), 0);

  // Generate calendar grid cells
  const cells = useMemo(() => {
    const firstDay = monthDate.getDay();
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const arr: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < firstDay; i++) arr.push({ date: null, key: `empty-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
      arr.push({ date: dt, key: dt.toISOString() });
    }
    return arr;
  }, [monthDate]);

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  const selectedJobs = selectedDate ? (jobsByDate.get(selectedDate) ?? []) : [];

  return (
    <View className="flex-1 bg-ink-50">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="flex-row items-center px-3 py-2">
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-extrabold ml-1 flex-1 text-lg text-ink-900">Kalender Jadwal</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Month navigator */}
        <View className="flex-row items-center justify-between rounded-2xl bg-white p-3" style={{ elevation: 2 }}>
          <Pressable
            onPress={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-ink-100"
          >
            <ChevronLeft color="#475569" size={18} />
          </Pressable>
          <View className="items-center">
            <Text className="font-extrabold text-base text-ink-900">{MONTHS[monthDate.getMonth()]} {monthDate.getFullYear()}</Text>
            <Text className="font-medium mt-0.5 text-[10px] text-ink-500">{jobs.length} job · est. {formatRupiah(totalEarning)}</Text>
          </View>
          <Pressable
            onPress={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-ink-100"
          >
            <ChevronRight color="#475569" size={18} />
          </Pressable>
        </View>

        {/* Day-of-week header */}
        <View className="mt-3 flex-row">
          {DAYS.map((d, i) => (
            <View key={d} className="flex-1 items-center py-1.5">
              <Text className={`font-bold text-[10px] uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-ink-400'}`}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View className="flex-row flex-wrap">
          {cells.map((cell) => {
            if (!cell.date) return <View key={cell.key} style={{ width: `${100 / 7}%` }} className="p-0.5" />;
            const dKey = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
            const dayJobs = jobsByDate.get(dKey) ?? [];
            const isToday = dKey === todayKey;
            const isSelected = selectedDate === dKey;
            const isSunday = cell.date.getDay() === 0;
            return (
              <View key={cell.key} style={{ width: `${100 / 7}%` }} className="p-0.5">
                <Pressable
                  onPress={() => setSelectedDate(isSelected ? null : dKey)}
                  className={`aspect-square items-center justify-center rounded-xl ${
                    isSelected ? 'bg-brand-600' : dayJobs.length > 0 ? 'bg-brand-50 border border-brand-300' : isToday ? 'border-2 border-brand-400 bg-white' : 'bg-white'
                  }`}
                >
                  <Text className={`font-extrabold text-sm ${isSelected ? 'text-white' : isSunday ? 'text-red-500' : 'text-ink-900'}`}>
                    {cell.date.getDate()}
                  </Text>
                  {dayJobs.length > 0 && (
                    <View className={`mt-0.5 rounded-full px-1.5 ${isSelected ? 'bg-white' : 'bg-brand-600'}`}>
                      <Text className={`font-bold text-[9px] ${isSelected ? 'text-brand-700' : 'text-white'}`}>{dayJobs.length}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Loading */}
        {loading && (
          <View className="mt-4 items-center py-6">
            <Text className="font-medium text-[12px] text-ink-500">Memuat jadwal...</Text>
          </View>
        )}

        {/* Selected date details */}
        {selectedDate && !loading && (
          <View className="mt-4">
            <Text className="font-bold mb-2 text-sm text-ink-900">
              {(() => {
                const d = new Date(selectedDate);
                return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
              })()}
            </Text>
            {selectedJobs.length === 0 ? (
              <View className="rounded-2xl border border-dashed border-ink-300 bg-white p-6 items-center">
                <Text className="font-medium text-[12px] text-ink-500">Tidak ada job di tanggal ini</Text>
              </View>
            ) : (
              <View className="gap-2">
                {selectedJobs.map((j) => (
                  <Pressable
                    key={j.id}
                    onPress={() => router.push({ pathname: '/booking/[id]', params: { id: j.id } })}
                    className="rounded-2xl bg-white p-3"
                    style={{ elevation: 2 }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-bold text-sm text-ink-900">
                        {new Date(j.scheduledAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text className="font-extrabold text-sm text-brand-700">{formatRupiah(Number(j.cleanerPayout) || 0)}</Text>
                    </View>
                    <Text className="font-semibold mt-1 text-[12px] text-ink-800">{j.serviceName}</Text>
                    <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={1}>{j.customerName ?? '—'} · {j.addressLine ?? '—'}</Text>
                    <View className="mt-1.5 self-start rounded-full bg-ink-100 px-2 py-0.5">
                      <Text className="font-bold text-[9px] uppercase tracking-wider text-ink-600">{j.status}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default withAuth(CleanerCalendar, 'freelancer');
