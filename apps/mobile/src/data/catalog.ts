import {
  type LucideIcon,
  Bath,
  BedDouble,
  Building2,
  ChefHat,
  DoorOpen,
  Hammer,
  Home,
  Car,
  Trees,
  Refrigerator,
  Shirt,
  Snowflake,
  Sofa,
  Sparkles,
  Wind,
} from 'lucide-react-native';

const UNS = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`;

// ============ SERVICE CATEGORIES (untuk landing) ============
export type ServiceCategory = {
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  /** Custom icon URL dari CMS (override Lucide). Optional — fallback ke `icon`. */
  customIconUrl?: string | null;
  imageUrl: string;
  startingPrice: number;
  popular?: boolean;
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { code: 'kamar', name: 'Bersih Kamar', description: 'Kamar tidur standar', icon: BedDouble, iconColor: '#1D4ED8', iconBg: '#DBEAFE', imageUrl: UNS('photo-1505693416388-ac5ce068fe85'), startingPrice: 120_000, popular: true },
  { code: 'dapur', name: 'Bersih Dapur', description: 'Area dapur', icon: ChefHat, iconColor: '#B45309', iconBg: '#FEF3C7', imageUrl: UNS('photo-1556909114-f6e7ad7d3136'), startingPrice: 160_000, popular: true },
  { code: 'kamar_mandi', name: 'Toilet', description: 'Kamar mandi', icon: Bath, iconColor: '#0E7490', iconBg: '#CFFAFE', imageUrl: UNS('photo-1552321554-5fefe8c9ef14'), startingPrice: 90_000 },
  { code: 'ruang_tamu', name: 'Ruang Tamu', description: 'Ruang tamu & keluarga', icon: Sofa, iconColor: '#7C3AED', iconBg: '#EDE9FE', imageUrl: UNS('photo-1555041469-a586c61ea9bc'), startingPrice: 150_000 },
  { code: 'full_house', name: 'Full House', description: 'Bersih seluruh rumah', icon: Home, iconColor: '#1D4ED8', iconBg: '#DBEAFE', imageUrl: UNS('photo-1564013799919-ab600027ffc6'), startingPrice: 350_000, popular: true },
  { code: 'kos', name: 'Pindah Kos', description: 'Serah terima kamar', icon: DoorOpen, iconColor: '#0F766E', iconBg: '#CCFBF1', imageUrl: UNS('photo-1522708323590-d24dbb6b0267'), startingPrice: 200_000 },
  { code: 'kantor', name: 'Kantor', description: 'Cleaning office', icon: Building2, iconColor: '#475569', iconBg: '#E2E8F0', imageUrl: UNS('photo-1497366216548-37526070297c'), startingPrice: 250_000 },
  { code: 'pasca_renovasi', name: 'Pasca Renovasi', description: 'Sisa material & debu', icon: Hammer, iconColor: '#B45309', iconBg: '#FEF3C7', imageUrl: UNS('photo-1503387762-592deb58ef4e'), startingPrice: 0 },
  { code: 'pekarangan', name: 'Pekarangan', description: 'Sapu daun & rapikan luar', icon: Trees, iconColor: '#15803D', iconBg: '#DCFCE7', imageUrl: UNS('photo-1416879595882-3373a0480b5b'), startingPrice: 150_000 },
  { code: 'garasi', name: 'Garasi/Teras', description: 'Bersih garasi & teras', icon: Car, iconColor: '#475569', iconBg: '#E2E8F0', imageUrl: UNS('photo-1597007030739-6d2e7172ee6c'), startingPrice: 130_000 },
];

// ============ PAKET FIXED COST (sesuai 06-pricing-modes.md) ============
export type Package = {
  id: string;
  categoryCode: string;
  name: string;
  price: number;
  durationMin: number;
  scope: string;
};

export const PACKAGES: Package[] = [
  { id: 'pkg_kamar_hemat', categoryCode: 'kamar', name: 'Hemat – Kamar Tidur', price: 120_000, durationMin: 90, scope: 'Kamar tidur standar' },
  { id: 'pkg_kombo', categoryCode: 'kamar', name: 'Kombo – Kamar + KM', price: 160_000, durationMin: 120, scope: 'Kamar tidur + kamar mandi' },
  { id: 'pkg_toilet', categoryCode: 'kamar_mandi', name: 'Toilet', price: 90_000, durationMin: 60, scope: 'Kamar mandi saja' },
  { id: 'pkg_ruang_tamu', categoryCode: 'ruang_tamu', name: 'Ruang Tamu', price: 150_000, durationMin: 90, scope: 'Ruang tamu & keluarga' },
  { id: 'pkg_dapur', categoryCode: 'dapur', name: 'Dapur', price: 160_000, durationMin: 120, scope: 'Area dapur lengkap' },
  { id: 'pkg_vacuum', categoryCode: 'ruang_tamu', name: 'Vacuum Seluruh Area', price: 120_000, durationMin: 90, scope: 'Vacuum lantai/karpet seluruh ruangan' },
  { id: 'pkg_pekarangan', categoryCode: 'kantor', name: 'Pekarangan', price: 150_000, durationMin: 120, scope: 'Area outdoor / taman depan' },
  { id: 'pkg_garasi', categoryCode: 'kantor', name: 'Garasi/Teras', price: 130_000, durationMin: 90, scope: 'Garasi atau teras depan' },
  { id: 'pkg_pindah_kos', categoryCode: 'kos', name: 'Pindah Kost / Kosongan', price: 200_000, durationMin: 180, scope: 'Serah terima kamar kos' },
  { id: 'pkg_full_kecil', categoryCode: 'full_house', name: 'Full House Kecil', price: 350_000, durationMin: 240, scope: '1 kamar + 1 KM + tamu + dapur (≤60m²)' },
  { id: 'pkg_full_sedang', categoryCode: 'full_house', name: 'Full House Sedang', price: 550_000, durationMin: 300, scope: '2 kamar + 2 KM + tamu + dapur (≤100m²)' },
  { id: 'pkg_full_besar', categoryCode: 'full_house', name: 'Full House Besar', price: 850_000, durationMin: 420, scope: '3+ kamar + 2+ KM + lengkap (≥150m²)' },
];

// ============ HOURLY TIERS ============
export type HourlyTier = {
  code: string;
  name: string;
  pricePerHour: number;
  minHours: number;
  description: string;
};

export const HOURLY_TIERS: HourlyTier[] = [
  { code: 'standard', name: 'Standard', pricePerHour: 65_000, minHours: 2, description: 'Cleaner tanpa alat khusus' },
  { code: 'with_tools', name: 'Bawa Alat', pricePerHour: 80_000, minHours: 2, description: 'Cleaner bawa vacuum, mop, alat lengkap' },
  { code: 'specialist', name: 'Spesialis', pricePerHour: 100_000, minHours: 3, description: 'Sertifikat lanjutan + alat profesional' },
];

// ============ ADD-ONS (12 sesuai spec 05-booking-form.md) ============
export type AddOnItem = {
  code: string;
  name: string;
  price: number;
  durationMin: number;
  unit?: string;
  icon: LucideIcon;
};

export const ADDONS: AddOnItem[] = [
  { code: 'rapi_baju', name: 'Merapikan barang/lipat baju', price: 30_000, durationMin: 30, icon: Shirt },
  { code: 'cuci_pakaian', name: 'Cuci pakaian (mesin)', price: 25_000, durationMin: 15, unit: '/5kg', icon: Wind },
  { code: 'setrika', name: 'Setrika pakaian', price: 50_000, durationMin: 45, unit: '/10 pcs', icon: Shirt },
  { code: 'ganti_seprai', name: 'Ganti seprai & sarung bantal', price: 20_000, durationMin: 15, icon: BedDouble },
  { code: 'cuci_piring', name: 'Cuci piring & rapikan dapur', price: 30_000, durationMin: 30, icon: ChefHat },
  { code: 'kulkas', name: 'Bersihin kulkas (luar+dalam)', price: 50_000, durationMin: 30, icon: Refrigerator },
  { code: 'oven', name: 'Bersihin microwave/oven', price: 35_000, durationMin: 20, icon: ChefHat },
  { code: 'vacuum_sofa', name: 'Vacuum sofa/kasur', price: 40_000, durationMin: 25, unit: '/item', icon: Sofa },
  { code: 'sterilisasi', name: 'Sterilisasi area (disinfectant)', price: 60_000, durationMin: 30, icon: Sparkles },
  { code: 'jendela', name: 'Bersihin jendela', price: 15_000, durationMin: 10, unit: '/panel', icon: Wind },
  { code: 'sampah', name: 'Buang sampah ke TPS', price: 20_000, durationMin: 15, icon: Snowflake },
  { code: 'mop_outdoor', name: 'Mop area outdoor', price: 30_000, durationMin: 30, icon: Wind },
];

// ============ FORM OPTIONS ============
export const PROPERTY_TYPES = ['Kos', 'Apartemen', 'Rumah', 'Ruko', 'Kantor', 'Villa', 'Guest House'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const FLOOR_OPTIONS = ['1', '2', '3', '>3'] as const;
export type FloorOption = (typeof FLOOR_OPTIONS)[number];

export const ROOM_FACILITIES = ['Dapur', 'Ruang Tamu', 'Pekarangan', 'Garasi'] as const;

export const DIRT_LEVELS: { level: 1 | 2 | 3 | 4 | 5; label: string; desc: string; multiplier: number }[] = [
  { level: 1, label: 'Baru rapi', desc: 'Habis dibersihkan, tinggal touch-up', multiplier: 1 },
  { level: 2, label: 'Ringan', desc: 'Debu & kotoran harian', multiplier: 1 },
  { level: 3, label: 'Sedang', desc: 'Belum dibersihkan beberapa hari', multiplier: 1 },
  { level: 4, label: 'Berat', desc: 'Lama tidak dibersihkan, foto wajib', multiplier: 1.25 },
  { level: 5, label: 'Ekstrim', desc: 'Pasca renovasi/banjir, foto wajib', multiplier: 1.5 },
];

export const DIRT_CHARACTERS = [
  'Debu',
  'Tumpahan cair',
  'Lemak dapur',
  'Kerak kamar mandi',
  'Jamur',
  'Bekas renovasi',
  'Bulu hewan',
  'Sampah numpuk',
] as const;

export const FLOOR_TYPES = ['Keramik', 'Marmer', 'Kayu', 'Vinyl', 'Karpet', 'Beton ekspos'] as const;

export const FURNITURE_DENSITY = ['Sedikit', 'Sedang', 'Padat'] as const;
export type FurnitureDensity = (typeof FURNITURE_DENSITY)[number];

// ============ BANNERS ============
export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  imageUrl: string;
};

export const BANNERS: Banner[] = [
  {
    id: 'b1',
    title: 'Diskon 20%\nPesanan Pertama',
    subtitle: 'Pakai kode HEMAT20 di checkout',
    cta: 'Pesan Sekarang',
    imageUrl: UNS('photo-1581578731548-c64695cc6952'),
  },
  {
    id: 'b2',
    title: 'Full House\nMulai Rp 350rb',
    subtitle: 'Bersih seluruh rumah, sekali jadi',
    cta: 'Lihat Paket',
    imageUrl: UNS('photo-1556909114-f6e7ad7d3136'),
  },
  {
    id: 'b3',
    title: 'Konsultasi Gratis\nvia WhatsApp',
    subtitle: 'Properti besar / kompleks? Survey dulu',
    cta: 'Mulai',
    imageUrl: UNS('photo-1581092446327-9b52bd1570c2'),
  },
];

export const SERVICE_CITIES = [
  'Yogyakarta',
  'Sleman',
  'Bantul',
  'Semarang',
  'Solo',
  'Surabaya',
  'Bekasi',
  'Bogor',
  'Bandung',
  'Jakarta Pusat',
  'Jakarta Selatan',
  'Jakarta Barat',
  'Jakarta Timur',
  'Jakarta Utara',
  'Tangerang',
  'Klaten',
  'Bali',
] as const;

export function formatRupiah(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}
