import * as Location from 'expo-location';
import { Crosshair, MapPin, Search, X } from 'lucide-react-native';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { toast } from '../stores/ui';

export type PickedLocation = {
  lat: number;
  lng: number;
  address: string;
};

const DEFAULT_LAT = -7.7956;
const DEFAULT_LNG = 110.3695; // Yogyakarta

const HTML = (lat: number, lng: number) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;font-family:system-ui,-apple-system,sans-serif}
  .pin{position:fixed;top:50%;left:50%;transform:translate(-50%,-100%);pointer-events:none;z-index:1000;font-size:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
  .pin-shadow{position:fixed;top:50%;left:50%;width:14px;height:6px;margin-left:-7px;margin-top:-3px;background:rgba(0,0,0,.3);border-radius:50%;pointer-events:none;z-index:999;filter:blur(1px)}
</style>
</head><body>
<div id="map"></div>
<div class="pin">📍</div>
<div class="pin-shadow"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${lat}, ${lng}], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function send(type, payload){
    var msg = JSON.stringify({type: type, ...payload});
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    else window.parent && window.parent.postMessage(msg, '*');
  }

  function notify(){
    var c = map.getCenter();
    send('moveend', { lat: c.lat, lng: c.lng });
  }

  map.on('moveend', notify);
  map.on('zoomend', notify);
  setTimeout(notify, 300);

  window.addEventListener('message', function(e){
    try {
      var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data.type === 'setView') map.setView([data.lat, data.lng], data.zoom || 16);
    } catch(_){}
  });

  window._setView = function(lat, lng){ map.setView([lat, lng], 16); };
</script>
</body></html>`;

// Promise.race timeout - gak depend AbortController (Hermes occasionally flaky).
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const inner = (async () => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'JasaBersih.com/0.1' } },
      );
      const j = await res.json();
      return (j.display_name as string) ?? fallback;
    })();
    return await withTimeout(inner, 5000, fallback);
  } catch {
    return fallback;
  }
}

async function searchPlace(q: string): Promise<{ lat: number; lng: number; name: string }[]> {
  try {
    const inner = (async () => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=id`,
        { headers: { 'User-Agent': 'JasaBersih.com/0.1' } },
      );
      const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      return j.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), name: r.display_name }));
    })();
    return await withTimeout(inner, 6000, []);
  } catch {
    return [];
  }
}

type MapHandle = { setView: (lat: number, lng: number) => void };

// Map di-isolate ke komponen sendiri + React.memo supaya parent re-render
// (lat/lng/address state changes) GAK trigger re-render iframe/WebView.
// Itu yg bikin flicker tiles tiap kali user geser peta.
const MapView = memo(
  forwardRef<MapHandle, { html: string; onMove: (lat: number, lng: number) => void }>(
    function MapView({ html, onMove }, ref) {
      const webRef = useRef<WebView>(null);
      const iframeRef = useRef<HTMLIFrameElement | null>(null);
      const source = useMemo(() => ({ html }), [html]);

      useImperativeHandle(ref, () => ({
        setView(lat, lng) {
          if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ type: 'setView', lat, lng, zoom: 16 }),
              '*',
            );
          } else {
            webRef.current?.injectJavaScript(`window._setView(${lat}, ${lng}); true;`);
          }
        },
      }), []);

      useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handler = (e: MessageEvent): void => {
          try {
            const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (d?.type === 'moveend' && typeof d.lat === 'number') onMove(d.lat, d.lng);
          } catch {}
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
      }, [onMove]);

      const onWebMessage = useCallback((e: WebViewMessageEvent): void => {
        try {
          const d = JSON.parse(e.nativeEvent.data);
          if (d.type === 'moveend') onMove(d.lat, d.lng);
        } catch {}
      }, [onMove]);

      if (Platform.OS === 'web') {
        // @ts-ignore iframe is web-only
        return <iframe ref={iframeRef} srcDoc={html} style={{ width: '100%', height: '100%', border: 0 }} />;
      }
      return (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={source}
          onMessage={onWebMessage}
          style={{ flex: 1 }}
        />
      );
    },
  ),
);

export function LocationPicker({
  visible,
  initial,
  onClose,
  onPick,
}: {
  visible: boolean;
  initial?: { lat: number; lng: number };
  onClose: () => void;
  onPick: (loc: PickedLocation) => void;
}) {
  const [lat, setLat] = useState(initial?.lat ?? DEFAULT_LAT);
  const [lng, setLng] = useState(initial?.lng ?? DEFAULT_LNG);
  // Render HTML SEKALI di awal (pakai initial coords). Update map pakai postMessage,
  // jangan ganti srcDoc - itu bikin iframe re-mount + flicker tiles.
  const initialHtml = useMemo(
    () => HTML(initial?.lat ?? DEFAULT_LAT, initial?.lng ?? DEFAULT_LNG),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const mapRef = useRef<MapHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeqRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResolving(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++reqSeqRef.current;
      const a = await reverseGeocode(lat, lng);
      // Stale callback guard: kalo ada call lebih baru, abaikan hasil ini.
      if (seq !== reqSeqRef.current) return;
      setAddress(a);
      setResolving(false);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [lat, lng, visible]);

  const onMove = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  }, []);

  function setMapView(newLat: number, newLng: number): void {
    setLat(newLat);
    setLng(newLng);
    mapRef.current?.setView(newLat, newLng);
  }

  async function useCurrent(): Promise<void> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.info('Izin lokasi ditolak. Aktifkan di Setting → App → JasaBersih → Permissions → Location.');
        return;
      }
      toast.info('Mencari lokasi GPS...');
      // High accuracy + timeout 8 detik. Kalau gagal, fallback ke last-known.
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]).catch(async () => {
        // Fallback: pakai last-known kalau current timeout.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) return last;
        throw new Error('Lokasi gak ke-detect. Pastikan GPS aktif & coba lagi.');
      });
      if (!pos?.coords) {
        toast.error('Gagal ambil koordinat. Coba pindah ke area terbuka.');
        return;
      }
      setMapView(pos.coords.latitude, pos.coords.longitude);
      toast.success('Lokasi saat ini diambil');
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal ambil lokasi');
    }
  }

  async function doSearch(): Promise<void> {
    if (searchQ.trim().length < 3) return;
    const r = await searchPlace(searchQ);
    setResults(r);
    if (r.length === 0) toast.info('Tidak ada hasil');
  }

  function confirm(): void {
    const finalAddress = address.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    onPick({ lat, lng, address: finalAddress });
    onClose();
  }

  // Web: kalau Modal tetap di DOM saat visible=false, dia bisa intercept focus &
  // bikin field di belakang gak bisa di-tap. Unmount total saat closed.
  if (!visible && Platform.OS === 'web') return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} className="bg-brand-700">
        <View className="flex-row items-center px-3 py-2">
          <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center">
            <X color="white" size={22} />
          </Pressable>
          <Text className="font-bold ml-1 text-base text-white">Pilih Lokasi</Text>
        </View>
      </SafeAreaView>

      {/* Search bar */}
      <View className="bg-white px-4 py-2">
        <View className="flex-row items-center gap-2 rounded-2xl bg-ink-100 px-3 py-2">
          <Search color="#64748B" size={18} />
          <TextInput
            value={searchQ}
            onChangeText={setSearchQ}
            onSubmitEditing={doSearch}
            placeholder="Cari alamat / tempat…"
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            className="font-sans flex-1 text-sm text-ink-900"
          />
          {searchQ.length > 0 && (
            <Pressable
              onPress={() => {
                setSearchQ('');
                setResults([]);
              }}
              className="p-1"
            >
              <X color="#94A3B8" size={14} />
            </Pressable>
          )}
        </View>
        {results.length > 0 && (
          <View className="mt-2 rounded-xl border border-ink-200 bg-white">
            {results.map((r, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  setMapView(r.lat, r.lng);
                  setResults([]);
                  setSearchQ('');
                }}
                className="flex-row items-start gap-2 border-b border-ink-100 p-3 last:border-b-0"
              >
                <MapPin color="#1D4ED8" size={14} strokeWidth={2.4} />
                <Text className="font-sans flex-1 text-xs text-ink-800" numberOfLines={2}>
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Map */}
      <View className="flex-1">
        <MapView ref={mapRef} html={initialHtml} onMove={onMove} />

        <Pressable
          onPress={useCurrent}
          className="absolute right-4 top-4 h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
          style={{ elevation: 6 }}
        >
          <Crosshair color="#1D4ED8" size={20} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Bottom card */}
      <SafeAreaView edges={['bottom']} className="border-t border-ink-200 bg-white">
        <View className="p-4">
          <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-ink-500">
            Alamat Terpilih
          </Text>
          <Text className="font-medium text-sm text-ink-900" numberOfLines={3}>
            {resolving ? 'Mencari alamat…' : address || 'Geser peta untuk pilih lokasi'}
          </Text>
          <Text className="font-sans mt-1 text-[10px] text-ink-400">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </Text>
          <Pressable
            onPress={confirm}
            disabled={resolving && !address}
            className="mt-3 rounded-2xl bg-brand-600 py-3.5 disabled:opacity-50"
          >
            <Text className="font-bold text-center text-sm text-white">
              {resolving ? 'Mencari alamat…' : 'Pakai Alamat Ini'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
