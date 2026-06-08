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
  /** Admin-controlled flag dari CMS — kalau false, gak muncul di home grid. */
  showOnHome?: boolean;
  /** True = tampil di section "Paket Lengkap" (combo/bundle), bukan grid Home reguler. */
  isBundle?: boolean;
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { code: 'kamar',          name: 'Kamar Tidur',     description: 'Kamar tidur standar',          icon: BedDouble, iconColor: '#1D4ED8', iconBg: '#DBEAFE', imageUrl: UNS('photo-1505693416388-ac5ce068fe85'), startingPrice: 120_000, popular: true },
  { code: 'kamar_km_dalam', name: 'Kamar + Toilet',  description: 'Kamar tidur + kamar mandi',    icon: BedDouble, iconColor: '#1D4ED8', iconBg: '#DBEAFE', imageUrl: UNS('photo-1505693416388-ac5ce068fe85'), startingPrice: 160_000, popular: true },
  { code: 'kamar_mandi',    name: 'Toilet',          description: 'Kamar mandi / toilet',         icon: Bath,      iconColor: '#0E7490', iconBg: '#CFFAFE', imageUrl: UNS('photo-1552321554-5fefe8c9ef14'), startingPrice: 120_000 },
  { code: 'dapur',          name: 'Dapur',           description: 'Area dapur',                   icon: ChefHat,   iconColor: '#B45309', iconBg: '#FEF3C7', imageUrl: UNS('photo-1556909114-f6e7ad7d3136'), startingPrice: 160_000, popular: true },
  { code: 'ruang_tamu',     name: 'Ruang Tamu',      description: 'Ruang tamu & keluarga',        icon: Sofa,      iconColor: '#7C3AED', iconBg: '#EDE9FE', imageUrl: UNS('photo-1555041469-a586c61ea9bc'), startingPrice: 150_000 },
  { code: 'pindah_kos',     name: 'Pindah Kamar',     description: 'Cleaning kamar kos (kosongan)', icon: DoorOpen, iconColor: '#0F766E', iconBg: '#CCFBF1', imageUrl: UNS('photo-1522708323590-d24dbb6b0267'), startingPrice: 200_000 },
  { code: 'ruangan_kosong', name: 'Ruangan Kosong',  description: 'Ruangan kosongan tanpa furniture', icon: DoorOpen, iconColor: '#9333EA', iconBg: '#F3E8FF', imageUrl: UNS('photo-1505691938895-1758d7feb511'), startingPrice: 140_000 },
  { code: 'garasi',         name: 'Garasi/Teras',    description: 'Garasi & teras',               icon: Car,       iconColor: '#475569', iconBg: '#E2E8F0', imageUrl: UNS('photo-1597007030739-6d2e7172ee6c'), startingPrice: 130_000 },
  { code: 'pekarangan',     name: 'Pekarangan',      description: 'Halaman rumah',                icon: Trees,     iconColor: '#15803D', iconBg: '#DCFCE7', imageUrl: UNS('photo-1416879595882-3373a0480b5b'), startingPrice: 150_000 },
  { code: 'ruko',           name: 'Ruko',            description: 'Bersih ruko/toko · per m²',    icon: Building2, iconColor: '#7C2D12', iconBg: '#FED7AA', imageUrl: UNS('photo-1497366216548-37526070297c'), startingPrice: 6_000 },
  { code: 'kantor',         name: 'Kantor',          description: 'Bersih kantor · per m²',       icon: Building2, iconColor: '#075985', iconBg: '#BAE6FD', imageUrl: UNS('photo-1497366754035-f200968a6e72'), startingPrice: 5_500 },
  { code: 'apartemen',      name: 'Apartemen',       description: 'Bersih apartemen · per m²',    icon: Home,      iconColor: '#5B21B6', iconBg: '#DDD6FE', imageUrl: UNS('photo-1502672260266-1c1ef2d93688'), startingPrice: 8_000 },
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

// Satu paket per kategori — gak ada lagi "Pilih Paket" sub-card.
// Harga = Regular (PDF). Deep Clean dihitung pakai multiplier dari cleanMode.
export const PACKAGES: Package[] = [
  { id: 'pkg_kamar',          categoryCode: 'kamar',          name: 'Kamar Tidur',    price: 120_000, durationMin: 90,  scope: 'Bersih kamar tidur standar' },
  { id: 'pkg_kamar_km',       categoryCode: 'kamar_km_dalam', name: 'Kamar + Toilet', price: 160_000, durationMin: 120, scope: 'Kamar tidur + kamar mandi dalam' },
  { id: 'pkg_toilet',         categoryCode: 'kamar_mandi',    name: 'Toilet',         price: 120_000, durationMin: 90,  scope: 'Kamar mandi / toilet' },
  { id: 'pkg_dapur',          categoryCode: 'dapur',          name: 'Dapur',          price: 160_000, durationMin: 120, scope: 'Area dapur lengkap' },
  { id: 'pkg_ruang_tamu',     categoryCode: 'ruang_tamu',     name: 'Ruang Tamu',     price: 150_000, durationMin: 90,  scope: 'Ruang tamu & keluarga' },
  { id: 'pkg_pindah_kos',     categoryCode: 'pindah_kos',     name: 'Pindah Kamar',    price: 200_000, durationMin: 180, scope: 'Serah terima kamar kos' },
  { id: 'pkg_ruangan_kosong', categoryCode: 'ruangan_kosong', name: 'Ruangan Kosong', price: 140_000, durationMin: 100, scope: 'Ruangan tanpa furniture · pasca pindah / baru beli' },
  { id: 'pkg_garasi',         categoryCode: 'garasi',         name: 'Garasi/Teras',   price: 130_000, durationMin: 90,  scope: 'Garasi atau teras depan' },
  { id: 'pkg_pekarangan',     categoryCode: 'pekarangan',     name: 'Pekarangan',     price: 150_000, durationMin: 120, scope: 'Area outdoor / taman' },
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
export type AddOnGroup =
  | 'Vakum Kasur'
  | 'Bak Mandi / Bathtub'
  | 'Hydro Vacuum Kasur'
  | 'Dapur & Peralatan'
  | 'Kamar Mandi Ekstra'
  | 'Furniture & Kaca'
  | 'Sampah & Pembuangan'
  | 'Decluttering';

export type AddOnItem = {
  code: string;
  name: string;
  price: number;
  durationMin: number;
  unit?: string;
  icon: LucideIcon;
  group: AddOnGroup;
};

export const ADDONS: AddOnItem[] = [
  // Vacuum Lantai
  { code: 'vacuum_mop_lantai',  name: 'Vacuum & Mop Lantai',      price: 120_000, durationMin: 90, unit: '/ruangan', icon: Sparkles,  group: 'Vakum Kasur' },

  // Vakum Kasur
  { code: 'vakum_kasur_single', name: 'Vakum Kasur Single Bed',   price: 45_000,  durationMin: 20, unit: '/kasur',   icon: BedDouble, group: 'Vakum Kasur' },
  { code: 'vakum_kasur_queen',  name: 'Vakum Kasur Queen Bed',    price: 60_000,  durationMin: 25, unit: '/kasur',   icon: BedDouble, group: 'Vakum Kasur' },
  { code: 'vakum_kasur_master', name: 'Vakum Kasur Master Bed',   price: 75_000,  durationMin: 30, unit: '/kasur',   icon: BedDouble, group: 'Vakum Kasur' },

  // Bak Mandi / Bathtub
  { code: 'bathtub_general',    name: 'Bak Mandi / Bathtub (General)',    price: 30_000, durationMin: 20, unit: '/unit', icon: Bath, group: 'Bak Mandi / Bathtub' },
  { code: 'bathtub_deep',       name: 'Bak Mandi / Bathtub (Deep Clean)', price: 50_000, durationMin: 40, unit: '/unit', icon: Bath, group: 'Bak Mandi / Bathtub' },

  // Hydro Vacuum Kasur
  { code: 'hydro_100x200',      name: 'Hydro Vacuum Kasur 100×200', price: 250_000, durationMin: 60, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_120x200',      name: 'Hydro Vacuum Kasur 120×200', price: 270_000, durationMin: 60, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_140x200',      name: 'Hydro Vacuum Kasur 140×200', price: 290_000, durationMin: 75, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_160x200',      name: 'Hydro Vacuum Kasur 160×200', price: 310_000, durationMin: 75, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_180x200',      name: 'Hydro Vacuum Kasur 180×200', price: 330_000, durationMin: 90, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_200x200',      name: 'Hydro Vacuum Kasur 200×200', price: 350_000, durationMin: 90, unit: '/kasur',    icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_bantal',       name: 'Hydro Vacuum Bantal / Guling', price: 70_000, durationMin: 20, unit: '/pcs',     icon: Sparkles, group: 'Hydro Vacuum Kasur' },
  { code: 'hydro_sofa',         name: 'Hydro Vacuum Sofa',          price: 80_000,  durationMin: 30, unit: '/dudukan',  icon: Sofa,     group: 'Hydro Vacuum Kasur' },

  // Dapur & Peralatan
  { code: 'cuci_piring',        name: 'Cuci Piring',                 price: 30_000, durationMin: 20, unit: '/sink (max 20 pcs)', icon: ChefHat,      group: 'Dapur & Peralatan' },
  { code: 'cuci_alat_masak',    name: 'Cuci Peralatan Masak',        price: 40_000, durationMin: 25, unit: '/max 10 pcs',        icon: ChefHat,      group: 'Dapur & Peralatan' },
  { code: 'kulkas',             name: 'Bersihkan Kulkas (dalam+luar)', price: 75_000, durationMin: 40, unit: '',                 icon: Refrigerator, group: 'Dapur & Peralatan' },
  { code: 'kompor',             name: 'Bersihkan Kompor Gas (+grill)', price: 50_000, durationMin: 30, unit: '',                 icon: ChefHat,      group: 'Dapur & Peralatan' },
  { code: 'microwave_oven',     name: 'Bersihkan Microwave / Oven',  price: 50_000, durationMin: 25, unit: '/dalam+luar',        icon: ChefHat,      group: 'Dapur & Peralatan' },
  { code: 'hood_exhaust',       name: 'Bersihkan Hood / Exhaust Fan', price: 65_000, durationMin: 35, unit: '/unit',             icon: Wind,         group: 'Dapur & Peralatan' },
  { code: 'dispenser',          name: 'Bersihkan Dispenser',         price: 25_000, durationMin: 15, unit: '/luar+area bawah',   icon: Refrigerator, group: 'Dapur & Peralatan' },

  // Kamar Mandi Ekstra
  { code: 'sikat_keramik',      name: 'Sikat Keramik Dinding',       price: 30_000, durationMin: 20, unit: '/m²',     icon: Bath, group: 'Kamar Mandi Ekstra' },
  { code: 'shower_head',        name: 'Bersihkan Shower Head',       price: 25_000, durationMin: 15, unit: '/unit',   icon: Bath, group: 'Kamar Mandi Ekstra' },
  { code: 'poles_kaca_shower',  name: 'Poles Kaca Shower / Cermin',  price: 25_000, durationMin: 15, unit: '/unit',   icon: Sparkles, group: 'Kamar Mandi Ekstra' },
  { code: 'saluran_air',        name: 'Bersihkan Saluran Air',       price: 25_000, durationMin: 15, unit: '/lubang', icon: Wind, group: 'Kamar Mandi Ekstra' },

  // Furniture & Kaca
  { code: 'lap_kaca_jendela',   name: 'Lap Kaca Jendela',            price: 15_000, durationMin: 10, unit: '/daun',    icon: Wind,  group: 'Furniture & Kaca' },
  { code: 'cuci_sofa_kering',   name: 'Cuci Sofa Dry Clean',         price: 50_000, durationMin: 25, unit: '/dudukan', icon: Sofa,  group: 'Furniture & Kaca' },
  { code: 'cuci_sofa_wet',      name: 'Cuci Sofa Wet Clean',         price: 90_000, durationMin: 35, unit: '/dudukan', icon: Sofa,  group: 'Furniture & Kaca' },
  { code: 'lemari_kayu',        name: 'Lap / Poles Lemari Kayu',     price: 40_000, durationMin: 30, unit: '/dalam+luar', icon: Home, group: 'Furniture & Kaca' },
  { code: 'angkut_furniture',   name: 'Angkut / Pindah Furniture',   price: 30_000, durationMin: 15, unit: '/item',    icon: Hammer, group: 'Furniture & Kaca' },

  // Sampah & Pembuangan
  { code: 'sampah',             name: 'Buang Sampah / Trashbag',     price: 50_000, durationMin: 20, unit: '/1x buang', icon: Snowflake, group: 'Sampah & Pembuangan' },

  // Decluttering
  { code: 'decluttering',       name: 'Rapikan & Sortir Barang',     price: 75_000, durationMin: 60, unit: '/jam',     icon: Shirt, group: 'Decluttering' },
];

// ============ FORM OPTIONS ============
export const PROPERTY_TYPES = ['Kos', 'Apartemen', 'Rumah', 'Ruko', 'Kantor', 'Villa', 'Guest House'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const FLOOR_OPTIONS = ['1', '2', '3', '>3'] as const;
export type FloorOption = (typeof FLOOR_OPTIONS)[number];

export const ROOM_FACILITIES = ['Dapur', 'Ruang Tamu', 'Pekarangan', 'Garasi'] as const;

export const DIRT_LEVELS: { level: 1 | 2 | 3 | 4 | 5; label: string; desc: string; multiplier: number }[] = [
  { level: 1, label: 'Ringan', desc: 'Debu & kotoran harian', multiplier: 1 },
  { level: 2, label: 'Sedang', desc: 'Belum dibersihkan beberapa hari', multiplier: 1.15 },
  { level: 3, label: 'Sangat Kotor', desc: 'Lama tidak dibersihkan / pasca renovasi · foto wajib', multiplier: 1.4 },
];

export const DIRT_CHARACTERS = [
  'Debu',
  'Noda cair',
  'Minyak / lemak',
  'Kerak / karat',
  'Jamur / lumut',
  'Sisa renovasi',
  'Bulu hewan',
  'Sampah menumpuk',
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
