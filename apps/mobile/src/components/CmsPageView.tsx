import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { api } from '../lib/api';

type Page = { slug: string; title: string; bodyMarkdown: string; updatedAt: string };

const LOCAL_CMS_FALLBACKS: Record<string, Page> = {
  about: {
    slug: 'about',
    title: 'Tentang JasaBersih',
    updatedAt: '2026-06-18T00:00:00.000Z',
    bodyMarkdown: `# Tentang JasaBersih

JasaBersih.com adalah platform marketplace cleaning service di Indonesia yang menghubungkan customer dengan cleaner profesional terverifikasi.

## Misi Kami
Menyediakan layanan kebersihan **berkualitas, transparan, dan aman** untuk semua orang.

## Kenapa JasaBersih
- Cleaner terverifikasi
- Harga jelas
- Garansi pekerjaan
- Pembayaran aman
- Proses booking praktis

## Kontak
- Email: halo@jasabersih.com
- WhatsApp: 6285124363374`,
  },
  faq: {
    slug: 'faq',
    title: 'FAQ',
    updatedAt: '2026-06-18T00:00:00.000Z',
    bodyMarkdown: `# Frequently Asked Questions

## Pembatalan dan Refund

### Bagaimana cara membatalkan pesanan?
Buka halaman pesanan, pilih order yang ingin dibatalkan, lalu tekan tombol batal jika status masih memungkinkan.

### Apakah ada biaya pembatalan?
- Pembatalan sesuai ketentuan waktu yang berlaku tidak dikenakan biaya.
- Pembatalan mendadak dapat dikenakan potongan sesuai syarat layanan.

## Cleaner dan Pekerjaan

### Bagaimana kalau cleaner tidak datang?
Gunakan fitur chat atau laporkan masalah melalui aplikasi agar tim kami bisa bantu tindak lanjut.

### Bisa pilih cleaner tertentu?
Penugasan cleaner mengikuti sistem dan ketersediaan area, tetapi preferensi tertentu bisa disampaikan saat pemesanan.

## Pembayaran

### Metode pembayaran apa saja yang tersedia?
Metode pembayaran mengikuti yang aktif di aplikasi, termasuk VA, QRIS, dan e-wallet yang tersedia.

### Kenapa harus bayar lewat aplikasi?
Pembayaran melalui aplikasi menjaga keamanan transaksi, pencatatan pesanan, dan proses bantuan jika ada kendala.`,
  },
  privacy: {
    slug: 'privacy',
    title: 'Kebijakan Privasi',
    updatedAt: '2026-06-18T00:00:00.000Z',
    bodyMarkdown: `# Kebijakan Privasi

Kami menjaga data pribadi pelanggan dan cleaner sesuai kebutuhan operasional layanan.

## Data yang Kami Kumpulkan
- Nama
- Nomor HP
- Email
- Alamat
- Data transaksi dan riwayat pesanan

## Penggunaan Data
- Memproses pesanan
- Menghubungkan customer dengan cleaner
- Mengirim notifikasi layanan
- Meningkatkan keamanan dan kualitas sistem

## Perlindungan Data
Kami tidak menjual data pribadi ke pihak ketiga. Data hanya digunakan untuk operasional layanan dan kewajiban hukum yang berlaku.`,
  },
  terms: {
    slug: 'terms',
    title: 'Syarat & Ketentuan',
    updatedAt: '2026-06-18T00:00:00.000Z',
    bodyMarkdown: `# Syarat dan Ketentuan Layanan JasaBersih.com

Dengan melakukan pemesanan, pelanggan menyetujui seluruh syarat dan ketentuan layanan JasaBersih.com.

## Ringkasan Utama
- Pemesanan dilakukan melalui kanal resmi JasaBersih.com
- Pembayaran mengikuti metode yang tersedia di aplikasi atau kanal resmi
- Komplain dan garansi layanan harus diajukan melalui chat resmi
- Komunikasi atau transaksi di luar kanal resmi berada di luar tanggung jawab management

## Pembatalan dan Reschedule
- Pembatalan mengikuti kebijakan waktu yang berlaku
- Reschedule tergantung ketersediaan jadwal

## Garansi
- Keluhan hasil kerja dapat diajukan maksimal 1 x 24 jam sesuai ketentuan layanan

## Keamanan
- Pelanggan disarankan tidak memberikan nomor pribadi atau melakukan transaksi langsung ke cleaner

Untuk versi lengkap terbaru, halaman ini akan otomatis memakai konten CMS saat server tersedia.`,
  },
};

// Lightweight markdown renderer - handles headings (#, ##, ###), bullets (- or *),
// bold (**text**), and paragraphs. Cukup untuk halaman statis CMS.
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let inList: string[] = [];

  function flushList(key: number) {
    if (inList.length === 0) return;
    blocks.push(
      <View key={`list-${key}`} className="my-1">
        {inList.map((item, i) => (
          <View key={i} className="flex-row gap-2 py-0.5">
            <Text className="font-sans text-sm text-ink-700">•</Text>
            <Text className="font-sans flex-1 text-sm text-ink-700">{renderInline(item)}</Text>
          </View>
        ))}
      </View>,
    );
    inList = [];
  }

  function renderInline(text: string): React.ReactNode {
    // Split by **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <Text key={i} className="font-bold">{p.slice(2, -2)}</Text>;
      }
      return p;
    });
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) { flushList(i); return; }

    if (trimmed.startsWith('### ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-3 text-sm text-ink-900">{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith('## ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-4 text-base text-ink-900">{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith('# ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-4 text-lg text-ink-900">{trimmed.slice(2)}</Text>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList.push(trimmed.slice(2));
    } else {
      flushList(i);
      blocks.push(<Text key={i} className="font-sans my-1 text-sm leading-6 text-ink-700">{renderInline(trimmed)}</Text>);
    }
  });
  flushList(lines.length);

  return blocks;
}

export function CmsPageView({ slug, fallbackTitle }: { slug: string; fallbackTitle?: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const localFallback = LOCAL_CMS_FALLBACKS[slug] ?? null;
    api.get(`/app/pages/${slug}`)
      .then((r) => {
        const data = r.data?.data ?? r.data;
        if (data) setPage(data as Page);
        else if (localFallback) setPage(localFallback);
        else setNotFound(true);
      })
      .catch(() => {
        if (localFallback) setPage(localFallback);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>;
  }

  if (notFound || !page) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="font-bold text-base text-ink-900">{fallbackTitle ?? 'Halaman belum tersedia'}</Text>
        <Text className="font-sans mt-2 text-center text-xs text-ink-500">
          Admin belum publish konten ini di dashboard CMS.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text className="font-bold mb-2 text-xl text-ink-900">{page.title}</Text>
      <Text className="font-sans mb-4 text-[10px] text-ink-400">
        Diperbarui: {new Date(page.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
      </Text>
      {renderMarkdown(page.bodyMarkdown)}
    </ScrollView>
  );
}
