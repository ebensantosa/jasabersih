import { Image } from 'expo-image';
import { formatScheduleWithTz } from '../../src/lib/datetime';
import { formatRupiah } from '../../src/data/catalog';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, Camera, ChevronRight, ClipboardList, Image as ImageIcon, Lock, Phone, Send, ShieldAlert, Star, X } from 'lucide-react-native';
import { withAuth } from '../../src/components/AuthGate';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Audio } from 'expo-av';
import { useChatSocket } from '../../src/hooks/useChatSocket';
import { CallOverlay } from '../../src/components/CallOverlay';
import { compressImage, formatBytes } from '../../src/lib/imageCompress';
import { uploadWithSignedUrl } from '../../src/lib/signedUpload';
import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { useBookingsStore } from '../../src/stores/bookings';
import { useConfig } from '../../src/stores/appContent';

// Decode JWT (no verify, just extract `sub` claim) to get current user id.
function decodeJwtSub(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const decoded = typeof (globalThis as any).atob === 'function'
      ? (globalThis as any).atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      : Buffer.from(part, 'base64').toString();
    const json = JSON.parse(decoded);
    return (json?.sub as string) ?? null;
  } catch { return null; }
}
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

// Quick replies dibedain by role - context cleaner vs customer beda
const QUICK_REPLIES_CLEANER = [
  '📍 Saya sudah di lokasi',
  '🚗 OTW, 10 menit lagi',
  '⏰ Maaf telat 5 menit',
  '🚪 Tolong bukain pintu',
  '🧴 Stok cairan habis, beli dulu boleh?',
  '🏠 Boleh masuk lewat samping?',
  '✓ Pekerjaan selesai',
  '🙏 Terima kasih',
];
const QUICK_REPLIES_CUSTOMER = [
  'Sudah sampai?',
  'Pakai pintu samping',
  'Kunci di kotak meteran',
  'Hati-hati ada hewan',
  'Tolong fokus area X dulu',
  'Tolong telpon dulu',
  'Terima kasih',
];

function Chat() {
  const router = useRouter();
  const { id, incomingCall } = useLocalSearchParams<{ id: string; incomingCall?: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === id));
  const fetchOne = useBookingsStore((s) => s.fetchOne);
  const myUserId = useAuthStore((s) => decodeJwtSub(s.tokens?.accessToken)) ?? 'me';
  const isCleaner = useModeStore((s) => s.mode === 'freelancer');

  // Always fetch fresh on open so cleanerPhotoUrl / status never stale
  useEffect(() => {
    if (id) void fetchOne(id).catch(() => {});
  }, [id, fetchOne]);

  const { messages, status, otherTyping, send, setTyping } = useChatSocket(id);

  // Mark-read tiap kali ada pesan baru ditujukan ke saya yg belum dibaca.
  // Sebelumnya cuma jalan saat mount -> pesan masuk SAAT chat udh kebuka gak
  // ke-mark read di server, jadi pengirim liat centang abu terus.
  useEffect(() => {
    if (!id) return;
    const hasUnreadForMe = messages.some((m) => m.recipientId === myUserId && !m.readAt);
    if (!hasUnreadForMe) return;
    import('../../src/lib/api').then(({ api }) => {
      api.post(`/chat/booking/${id}/read`).catch(() => {});
    });
  }, [id, messages, myUserId]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  // Track quick-reply yg lagi dikirim, supaya chip kasih feedback visual + ga bisa di-tap ulang
  const [pendingQuick, setPendingQuick] = useState<string | null>(null);
  const [blockWarning, setBlockWarning] = useState<string | null>(null);
  const [callToken, setCallToken] = useState<string | null>(null);
  const [callUrl, setCallUrl] = useState<string>('');
  const [callingLabel, setCallingLabel] = useState('');
  const [callLoading, setCallLoading] = useState(false);
  const [showIncomingBanner, setShowIncomingBanner] = useState(!!id && incomingCall === '1');
  const [cleanerStats, setCleanerStats] = useState<{ ratingAvg: number; ratingCount: number } | null>(null);
  const [peerPresence, setPeerPresence] = useState<{ isOnline: boolean; lastSeenAt: string | null } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const ringtoneRef = useRef<Audio.Sound | null>(null);

  // Auto-dismiss incoming banner setelah 65 detik (pemanggil timeout 60s + buffer)
  useEffect(() => {
    if (!showIncomingBanner) return;
    const t = setTimeout(() => setShowIncomingBanner(false), 65_000);
    return () => clearTimeout(t);
  }, [showIncomingBanner]);

  // Putar ringtone saat incoming call banner muncul, stop saat banner hilang
  useEffect(() => {
    if (!showIncomingBanner) {
      ringtoneRef.current?.stopAsync().catch(() => {});
      ringtoneRef.current?.unloadAsync().catch(() => {});
      ringtoneRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/order_incoming.wav'),
          { shouldPlay: true, isLooping: true, volume: 1.0 },
        );
        if (cancelled) { void sound.unloadAsync(); return; }
        ringtoneRef.current = sound;
      } catch { /* non-fatal — tetap bisa jawab tanpa suara */ }
    })();
    return () => {
      cancelled = true;
      ringtoneRef.current?.stopAsync().catch(() => {});
      ringtoneRef.current?.unloadAsync().catch(() => {});
      ringtoneRef.current = null;
    };
  }, [showIncomingBanner]);

  // Fetch cleaner rating + presence untuk header (kalau cleaner sudah di-assign)
  useEffect(() => {
    const cleanerId = (booking as any)?.cleanerId ?? (booking as any)?.cleaner_id;
    if (!cleanerId) return;
    let alive = true;
    import('../../src/lib/api').then(({ api }) => {
      api.get(`/ratings/cleaner/${cleanerId}`).then((r) => {
        const list: any[] = r.data?.data ?? [];
        if (list.length === 0) return;
        const sum = list.reduce((s, x) => s + Number(x.rating ?? 0), 0);
        if (alive) setCleanerStats({ ratingAvg: sum / list.length, ratingCount: list.length });
      }).catch(() => {});

      const fetchPresence = () => {
        api.get(`/users/${cleanerId}/presence`).then((r) => {
          const d = r.data?.data ?? r.data;
          if (alive) setPeerPresence({ isOnline: !!d?.isOnline, lastSeenAt: d?.lastSeenAt ?? null });
        }).catch(() => {});
      };
      fetchPresence();
      // Naikin ke 60s untuk hemat API call
      const t = setInterval(fetchPresence, 60_000);
      return () => { alive = false; clearInterval(t); };
    });
    return () => { alive = false; };
  }, [booking]);

  function presenceLabel(): string {
    if (otherTyping) return 'sedang mengetik…';
    if (!peerPresence) return 'tap untuk lihat profil';
    if (peerPresence.isOnline) return 'Online';
    if (!peerPresence.lastSeenAt) return 'tap untuk lihat profil';
    const t = new Date(peerPresence.lastSeenAt);
    const diffMin = (Date.now() - t.getTime()) / 60_000;
    if (diffMin < 60) return `Aktif ${Math.max(1, Math.floor(diffMin))} menit lalu`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(t); day.setHours(0, 0, 0, 0);
    const dayDiff = (today.getTime() - day.getTime()) / 86400000;
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    if (dayDiff === 0) return `Aktif jam ${hh}:${mm}`;
    if (dayDiff === 1) return `Aktif kemarin ${hh}:${mm}`;
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `Aktif ${t.getDate()} ${months[t.getMonth()]}`;
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  // Clear block warning after 5s
  useEffect(() => {
    if (!blockWarning) return;
    const t = setTimeout(() => setBlockWarning(null), 5000);
    return () => clearTimeout(t);
  }, [blockWarning]);

  if (!id) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans">Chat tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  async function handleSend(content: string, opts?: { fromQuick?: string }) {
    if (!content.trim()) return;
    if (sending) return; // anti double-tap composer
    if (opts?.fromQuick && pendingQuick) return; // anti double-tap quick reply

    // Quick reply: feedback flash 400ms aja (cukup utk tactile feedback +
    // cegah double-tap), gak nunggu ack server. Pesan udah optimistic
    // ke-render via socket broadcast - bikin UI snappy, ga keliatan ngebug.
    if (opts?.fromQuick) {
      const q = opts.fromQuick;
      setPendingQuick(q);
      setTimeout(() => {
        setPendingQuick((cur) => (cur === q ? null : cur));
      }, 400);
    } else {
      // Composer: clear text instan, spinner cuma 400ms juga.
      setText('');
      setSending(true);
      setTimeout(() => setSending(false), 400);
    }

    // Fire-and-forget. Error masuk toast, gak block UI.
    void send(content).then((res) => {
      if (!res.ok) {
        toast.error(res.error ?? 'Gagal kirim. Coba lagi.');
        if (!opts?.fromQuick) setText(content); // restore composer
      } else if (res.blocked) {
        setBlockWarning(res.userMessage ?? 'Pesan ditolak - dilarang share kontak / link / tawaran di luar app.');
      }
    });
  }

  function onChangeText(v: string) {
    setText(v);
    setTyping(v.length > 0);
  }

  async function startCall() {
    if (callLoading) return;
    setCallLoading(true);
    try {
      const { api } = await import('../../src/lib/api');
      const r = await api.post('/call/start', { bookingId: id });
      const d = r.data?.data ?? r.data;
      const peerName = isCleaner
        ? ((booking as any)?.customerName ?? 'Pelanggan')
        : (booking?.cleanerName ?? 'Cleaner');
      setCallingLabel(peerName);
      setCallUrl(d.url);
      setCallToken(d.token);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal memulai panggilan');
    } finally {
      setCallLoading(false);
    }
  }

  async function answerCall() {
    setShowIncomingBanner(false);
    setCallLoading(true);
    try {
      const { api } = await import('../../src/lib/api');
      const r = await api.post('/call/join', { bookingId: id });
      const d = r.data?.data ?? r.data;
      const peerName = isCleaner
        ? ((booking as any)?.customerName ?? 'Pelanggan')
        : (booking?.cleanerName ?? 'Cleaner');
      setCallingLabel(peerName);
      setCallUrl(d.url);
      setCallToken(d.token);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal angkat panggilan');
    } finally {
      setCallLoading(false);
    }
  }

  async function pickAndSendPhoto(source: 'camera' | 'gallery') {
    if (uploadingPhoto) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      let picked;
      if (source === 'camera') {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) {
          toast.warning('Butuh akses kamera. Aktifkan di Settings.');
          return;
        }
        picked = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        });
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          toast.warning('Butuh akses galeri untuk kirim foto.');
          return;
        }
        picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        });
      }
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];

      setUploadingPhoto(true);
      const compressed = await compressImage(asset.uri);
      if (compressed.oversize) {
        toast.error(`Foto terlalu besar (${formatBytes(compressed.size)}). Coba foto lain.`);
        return;
      }

      const { api } = await import('../../src/lib/api');
      const { publicUrl } = await uploadWithSignedUrl(
        async () => {
          const presign = await api.post(`/chat/booking/${id}/image-upload-url`, { contentType: 'image/jpeg' });
          return (presign.data?.data ?? presign.data) as { uploadUrl: string; publicUrl: string };
        },
        compressed.uri,
        'image/jpeg',
      );

      // Kirim sebagai chat message dgn messageType='image'. Content = URL (utk
      // backward compat sama backend yg validate content non-empty).
      void send(publicUrl, { messageType: 'image', attachmentUrl: publicUrl }).then((res) => {
        if (!res.ok) toast.error(res.error ?? 'Gagal kirim foto');
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal kirim foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView className="flex-1 bg-ink-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            {(() => {
              const cleanerId = (booking as any)?.cleanerId ?? (booking as any)?.cleaner_id;
              const hasAdminChat = messages.some((m) => m.isAdmin);
              const isManualBooking = booking?.isManual === true
                || (booking as any)?.formSnapshot?.createdByAdmin === true
                || (booking as any)?.formSnapshot?.createdByAdmin === 'true';

              // Hanya tampilkan Admin header kalau ada bukti explisit (pesan admin atau booking manual)
              // Jangan gunakan !cleanerId karena booking bisa belum ter-load
              if (hasAdminChat || isManualBooking) {
                return (
                  <>
                    <Image
                      source={require('../../assets/icon.png')}
                      style={{ width: 40, height: 40, borderRadius: 20 }}
                      contentFit="cover"
                    />
                    <View className="flex-1">
                      <Text className="font-semibold text-sm text-ink-900">Admin JasaBersih</Text>
                      <Text className="font-medium text-[11px] text-ink-500">
                        {status === 'connecting' ? 'Menyambung…' : status === 'error' ? 'Koneksi error' : 'Tim Support'}
                      </Text>
                    </View>
                  </>
                );
              }

              if (isCleaner) {
                // Cleaner views chat: show customer name + photo
                const customerPhotoUrl = (booking as any)?.customerPhotoUrl;
                const customerName = (booking as any)?.customerName ?? 'Pelanggan';
                return (
                  <>
                    {customerPhotoUrl ? (
                      <Image
                        source={{ uri: customerPhotoUrl }}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                        <Text className="font-bold text-sm text-emerald-700">{customerName[0]?.toUpperCase() ?? 'P'}</Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="font-semibold text-sm text-ink-900">{customerName}</Text>
                      <Text className="font-medium text-[11px] text-ink-500">
                        {status === 'connecting' ? 'Menyambung…' : status === 'error' ? 'Koneksi error' : 'Pelanggan'}
                      </Text>
                    </View>
                  </>
                );
              }

              return (
                <>
                  {booking?.cleanerPhotoUrl ? (
                    <Image
                      source={{ uri: booking.cleanerPhotoUrl }}
                      style={{ width: 40, height: 40, borderRadius: 20 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-100">
                      <Text className="font-bold text-sm text-brand-700">{(booking?.cleanerName ?? 'C')[0]}</Text>
                    </View>
                  )}
                  <Pressable
                    className="flex-1"
                    onPress={() => {
                      if (cleanerId) router.push({ pathname: '/cleaner/public/[id]', params: { id: cleanerId } });
                    }}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <Text className="font-semibold text-sm text-ink-900">{booking?.cleanerName ?? 'Menunggu cleaner…'}</Text>
                      {cleanerStats && (
                        <View className="flex-row items-center gap-0.5">
                          <Star color="#FACC15" fill="#FACC15" size={10} strokeWidth={1} />
                          <Text className="font-bold text-[10px] text-ink-700">{cleanerStats.ratingAvg.toFixed(1)}</Text>
                          <Text className="font-sans text-[10px] text-ink-400">({cleanerStats.ratingCount})</Text>
                        </View>
                      )}
                    </View>
                    <Text className={`font-medium text-[11px] ${peerPresence?.isOnline ? 'text-success' : 'text-ink-500'}`}>
                      {status === 'connecting' ? 'Menyambung…' :
                       status === 'error' ? 'Koneksi error' :
                       presenceLabel()}
                    </Text>
                  </Pressable>
                </>
              );
            })()}
          {/* Tombol telepon — hanya saat booking aktif */}
          {['matched', 'on_the_way', 'in_progress'].includes(booking?.status ?? '') && (
            <Pressable
              onPress={startCall}
              disabled={callLoading}
              className="h-10 w-10 items-center justify-center rounded-full bg-emerald-50"
            >
              {callLoading
                ? <ActivityIndicator size="small" color="#047857" />
                : <Phone color="#047857" size={18} strokeWidth={2.2} />}
            </Pressable>
          )}
          </View>
        </SafeAreaView>

        {/* Order context - link ke booking */}
        {booking && (
          <Pressable
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
            className="flex-row items-center gap-2.5 border-b border-ink-100 bg-white px-3 py-2.5"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <ClipboardList color="#1D4ED8" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="font-semibold text-[12px] text-ink-900" numberOfLines={1}>
                  {booking.pricingMode === 'hourly'
                    ? `Layanan Per Jam${booking.hours ? ` · ${booking.hours}j` : ''}`
                    : (booking.packageName ?? booking.categoryName ?? 'Pesanan')}
                </Text>
                <View className="rounded bg-ink-100 px-1.5 py-0.5">
                  <Text className="font-mono text-[9px] text-ink-600">#{booking.id.slice(0, 8)}</Text>
                </View>
              </View>
              <Text className="font-medium mt-0.5 text-[10px] text-ink-500" numberOfLines={1}>
                {formatScheduleWithTz(booking.scheduledAt, booking.addressLine)}{(() => { const price = isCleaner ? (booking.cleanerPayout ?? booking.totalPrice ?? 0) : (booking.totalPrice ?? 0); return price > 0 ? ` · ${formatRupiah(price)}` : ''; })()}
              </Text>
            </View>
            <ChevronRight color="#94A3B8" size={16} strokeWidth={2.4} />
          </Pressable>
        )}

        {/* Safety banner + Report button. Teks bisa diubah admin via app_config
            key 'safety.chat_banner' (fallback ke default kalau gak ke-set). */}
        {!isCleaner && <SafetyBanner onReport={() => router.push({ pathname: '/report-cleaner', params: { bookingId: id! } })} />}

        {/* Incoming call banner */}
        {showIncomingBanner && (
          <View className="flex-row items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-600">
              <Phone color="white" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-sm text-emerald-900">Panggilan masuk</Text>
              <Text className="font-sans text-xs text-emerald-700">
                {isCleaner ? ((booking as any)?.customerName ?? 'Pelanggan') : (booking?.cleanerName ?? 'Cleaner')} mengajak kamu telepon
              </Text>
            </View>
            <Pressable
              onPress={() => setShowIncomingBanner(false)}
              className="h-9 w-16 items-center justify-center rounded-lg border border-ink-200 bg-white"
            >
              <Text className="font-semibold text-xs text-ink-600">Tolak</Text>
            </Pressable>
            <Pressable
              onPress={answerCall}
              disabled={callLoading}
              className="h-9 w-16 items-center justify-center rounded-lg bg-emerald-600"
            >
              {callLoading
                ? <ActivityIndicator size="small" color="white" />
                : <Text className="font-bold text-xs text-white">Angkat</Text>}
            </Pressable>
          </View>
        )}

        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, gap: 8 }} showsVerticalScrollIndicator={false}>
          {status === 'connecting' ? (
            <View className="flex-1 items-center justify-center py-12 gap-2">
              <ActivityIndicator size="small" color="#6366F1" />
              <Text className="font-sans text-xs text-ink-400">Memuat pesan...</Text>
            </View>
          ) : messages.length === 0 ? (
            <View className="self-center rounded-full bg-ink-200 px-3 py-1">
              <Text className="font-sans text-[11px] text-ink-600">Mulai percakapan</Text>
            </View>
          ) : messages.map((m) => (
            <Bubble
              key={m.id}
              isMe={m.senderId === myUserId}
              isAdmin={!!m.isAdmin}
              text={m.content}
              time={new Date(m.createdAt).getTime()}
              messageType={m.messageType}
              attachmentUrl={m.attachmentUrl}
              readAt={m.readAt}
              onImagePress={(url) => setPreviewPhoto(url)}
            />
          ))}
        </ScrollView>

        {blockWarning && (
          <View className="mx-3 mb-2 flex-row items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
            <AlertCircle color="#B91C1C" size={16} />
            <Text className="font-sans flex-1 text-xs text-red-800">{blockWarning}</Text>
          </View>
        )}

        {/* Quick replies — hidden when chat is locked */}
        {!(['completed', 'canceled'].includes(booking?.status ?? '')) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12">
            <View className="flex-row gap-2 px-4 py-2">
              {(useModeStore.getState().mode === 'freelancer' ? QUICK_REPLIES_CLEANER : QUICK_REPLIES_CUSTOMER).map((q) => {
                const isFlashing = pendingQuick === q;
                return (
                  <Pressable
                    key={q}
                    onPress={() => handleSend(q, { fromQuick: q })}
                    disabled={pendingQuick !== null}
                    className={`rounded-full border px-3 py-1.5 ${
                      isFlashing
                        ? 'border-brand-600 bg-brand-600'
                        : 'border-brand-200 bg-white'
                    }`}
                    style={isFlashing ? { transform: [{ scale: 0.95 }] } : undefined}
                  >
                    <Text className={`font-medium text-xs ${isFlashing ? 'text-white' : 'text-brand-700'}`}>{q}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Composer or locked banner */}
        {['completed', 'canceled'].includes(booking?.status ?? '') ? (
          <SafeAreaView edges={['bottom']} className="border-t border-ink-200 bg-white">
            <Pressable
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: id! } })}
              className="flex-row items-center gap-3 px-4 py-3"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-ink-100">
                <Lock color="#64748B" size={18} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-sm text-ink-700">Chat ditutup</Text>
                <Text className="font-sans text-xs text-ink-500">
                  {booking?.status === 'canceled' ? 'Pesanan dibatalkan.' : 'Pesanan selesai.'}{!isCleaner ? ' Ada masalah? Tap untuk lapor.' : ''}
                </Text>
              </View>
              {!isCleaner && <ChevronRight color="#94A3B8" size={16} strokeWidth={2.4} />}
            </Pressable>
          </SafeAreaView>
        ) : (
          <SafeAreaView edges={['bottom']} className="border-t border-ink-200 bg-white">
            <View className="flex-row items-center gap-2 px-3 py-2">
              <Pressable
                onPress={() => setPhotoSheetOpen(true)}
                disabled={uploadingPhoto || status !== 'connected'}
                className="h-11 w-11 items-center justify-center rounded-full bg-ink-100 disabled:opacity-50"
              >
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color="#1D4ED8" />
                  : <Camera color="#1D4ED8" size={20} strokeWidth={2.2} />}
              </Pressable>
              <TextInput
                value={text}
                onChangeText={onChangeText}
                onBlur={() => setTyping(false)}
                placeholder="Tulis pesan…"
                placeholderTextColor="#94A3B8"
                multiline
                className="font-sans flex-1 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900"
                style={{ maxHeight: 100 }}
              />
              <Pressable
                onPress={() => handleSend(text)}
                disabled={!text.trim() || status !== 'connected' || sending}
                className="h-11 w-11 items-center justify-center rounded-full bg-brand-600 disabled:opacity-50"
              >
                {sending
                  ? <ActivityIndicator size="small" color="white" />
                  : <Send color="white" size={18} strokeWidth={2.4} />}
              </Pressable>
            </View>
            <Text className="font-sans px-4 pb-1 text-center text-[10px] text-ink-400">
              Pesan dimoderasi otomatis · Pelanggaran berulang = akun di-suspend
            </Text>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>

      {photoSheetOpen && (
        <Pressable
          onPress={() => setPhotoSheetOpen(false)}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['bottom']} className="bg-white">
              <View className="px-5 pt-4 pb-2">
                <View className="self-center mb-3 h-1 w-10 rounded-full bg-ink-200" />
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="font-bold text-base text-ink-900">Kirim Foto</Text>
                  <Pressable onPress={() => setPhotoSheetOpen(false)} className="h-8 w-8 items-center justify-center">
                    <X color="#64748B" size={18} />
                  </Pressable>
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => { setPhotoSheetOpen(false); void pickAndSendPhoto('camera'); }}
                    className="flex-1 items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-4"
                  >
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-600">
                      <Camera color="white" size={22} strokeWidth={2.2} />
                    </View>
                    <Text className="font-bold text-sm text-brand-700">Kamera</Text>
                    <Text className="font-sans text-center text-[10px] text-ink-500">Ambil foto langsung</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setPhotoSheetOpen(false); void pickAndSendPhoto('gallery'); }}
                    className="flex-1 items-center gap-2 rounded-2xl border border-ink-200 bg-white p-4"
                  >
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-ink-200">
                      <ImageIcon color="#1D4ED8" size={22} strokeWidth={2.2} />
                    </View>
                    <Text className="font-bold text-sm text-ink-900">Galeri</Text>
                    <Text className="font-sans text-center text-[10px] text-ink-500">Pilih dari foto tersimpan</Text>
                  </Pressable>
                </View>
                <Text className="font-medium mt-3 text-center text-[10px] text-ink-400">
                  Foto akan otomatis di-kompres supaya hemat kuota
                </Text>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      )}

      {previewPhoto && (
        <Pressable
          onPress={() => setPreviewPhoto(null)}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Image
            source={{ uri: previewPhoto }}
            style={{ width: '100%', height: '85%' }}
            contentFit="contain"
          />
          <Text className="font-medium mt-3 text-xs text-white/70">Tap di mana saja untuk tutup</Text>
        </Pressable>
      )}

      {callToken && (
        <CallOverlay
          token={callToken}
          serverUrl={callUrl}
          callerLabel={callingLabel}
          onEnd={() => setCallToken(null)}
        />
      )}
    </>
  );
}

function Bubble({
  isMe,
  isAdmin,
  text,
  time,
  messageType,
  attachmentUrl,
  readAt,
  onImagePress,
}: {
  isMe: boolean;
  isAdmin?: boolean;
  text: string;
  time: number;
  messageType?: string;
  attachmentUrl?: string | null;
  readAt?: string | null;
  onImagePress?: (url: string) => void;
}) {
  const t = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const looksLikeImageUrl = /\.(jpg|jpeg|png|gif|webp|avif)(\?[^#]*)?$/i.test(attachmentUrl ?? text);
  const isImage = (messageType === 'image' || looksLikeImageUrl) && (attachmentUrl || text);
  const imageUrl = attachmentUrl ?? text;
  const bubbleBg = isMe ? 'bg-brand-600' : isAdmin ? 'bg-amber-50' : 'bg-white';
  const textColor = isMe ? 'text-white' : 'text-ink-800';
  const borderStyle = isMe ? {} : isAdmin ? { borderWidth: 1, borderColor: '#FDE68A' } : { borderWidth: 1, borderColor: '#E2E8F0' };

  return (
    <View className={isMe ? 'items-end' : 'items-start'}>
      {isAdmin && !isMe && (
        <View className="mb-0.5 flex-row items-center gap-1">
          <Image source={require('../../assets/icon.png')} style={{ width: 16, height: 16, borderRadius: 8 }} contentFit="cover" />
          <Text className="font-bold text-[10px] text-amber-700">Admin JasaBersih</Text>
        </View>
      )}
      {isImage ? (
        <Pressable onPress={() => onImagePress?.(imageUrl)}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: 220, height: 220, borderRadius: 16 }}
            contentFit="cover"
          />
        </Pressable>
      ) : (
        <View
          className={`max-w-[80%] rounded-2xl px-3 py-2 ${bubbleBg}`}
          style={borderStyle}
        >
          <Text className={`font-sans text-sm ${textColor}`}>{text}</Text>
        </View>
      )}
      <View className="mx-1 mt-0.5 flex-row items-center gap-1">
        <Text className="font-sans text-[10px] text-ink-400">{t}</Text>
        {isMe && (
          readAt
            ? <Text className="font-sans text-[10px] text-blue-600">baca</Text>
            : <Text className="font-sans text-[10px] text-ink-400">belum dibaca</Text>
        )}
      </View>
    </View>
  );
}

// Banner peringatan share kontak. Teks default + bisa override via
// app_config key 'safety.chat_banner' (set di admin > App Settings).
function SafetyBanner({ onReport }: { onReport: () => void }) {
  const text = useConfig(
    'safety.chat_banner',
    'Dilarang share no HP, WA, transfer bank di chat. Lapor cleaner yang nanya nomor pribadi atau ajak transfer luar app - dapat voucher Rp 50.000.',
  );
  return (
    <View className="flex-row items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
      <ShieldAlert color="#92400E" size={14} />
      <View className="flex-1">
        <Text className="font-sans text-[11px] text-amber-900">{text}</Text>
        <Pressable onPress={onReport} className="mt-1.5 self-start rounded-md bg-amber-200 px-2 py-1">
          <Text className="font-bold text-[10px] text-amber-900">🚩 Lapor Cleaner</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default withAuth(Chat);
