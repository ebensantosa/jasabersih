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
  /** Custom icon URL dari CMS (override Lucide). Optional - fallback ke `icon`. */
  customIconUrl?: string | null;
  imageUrl: string;
  startingPrice: number;
  popular?: boolean;
  /** Admin-controlled flag dari CMS - kalau false, gak muncul di home grid. */
  showOnHome?: boolean;
  /** True = tampil di section "Paket Lengkap" (combo/bundle), bukan grid Home reguler. */
  isBundle?: boolean;
  /** False = lagi maintenance / tidak tersedia. Mobile tampil grey + blok CTA. Default true. */
  isActive?: boolean;
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
  { code: 'skala_besar',    name: 'Skala Besar',     description: 'Mall, pabrik, hotel · konsultasi', icon: Building2, iconColor: '#7C2D12', iconBg: '#FED7AA', imageUrl: UNS('photo-1497366216548-37526070297c'), startingPrice: 0 },
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

// Satu paket per kategori - gak ada lagi "Pilih Paket" sub-card.
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
  { code: 'vacuum_mop_lantai',  name: 'Vacuum + Pel Lantai',                  price: 65_000,  durationMin: 45, unit: 'per ruangan',          icon: Sparkles,  group: 'Lantai & Kasur' },

  // Vakum Kasur (sedot debu kasur)
  { code: 'vakum_kasur_single', name: 'Sedot Debu Kasur Single (90×200)',     price: 45_000,  durationMin: 20, unit: 'per kasur',            icon: BedDouble, group: 'Lantai & Kasur' },
  { code: 'vakum_kasur_queen',  name: 'Sedot Debu Kasur Queen (160×200)',     price: 60_000,  durationMin: 25, unit: 'per kasur',            icon: BedDouble, group: 'Lantai & Kasur' },
  { code: 'vakum_kasur_master', name: 'Sedot Debu Kasur King (180×200)',      price: 75_000,  durationMin: 30, unit: 'per kasur',            icon: BedDouble, group: 'Lantai & Kasur' },

  // Bak Mandi / Bathtub
  { code: 'bathtub_general',    name: 'Bersihin Bak Mandi (Standar)',         price: 30_000, durationMin: 20, unit: 'per bak',              icon: Bath, group: 'Kamar Mandi' },
  { code: 'bathtub_deep',       name: 'Bersihin Bak Mandi (Deep - kerak tebal)', price: 50_000, durationMin: 40, unit: 'per bak',            icon: Bath, group: 'Kamar Mandi' },

  // Cuci Kasur Hydro (lebih dalam: cairan, hisap, kering)
  { code: 'hydro_100x200',      name: 'Cuci Kasur (100×200) - Single Kecil',  price: 250_000, durationMin: 60, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_120x200',      name: 'Cuci Kasur (120×200) - Single Besar',  price: 270_000, durationMin: 60, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_140x200',      name: 'Cuci Kasur (140×200) - Full',          price: 290_000, durationMin: 75, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_160x200',      name: 'Cuci Kasur (160×200) - Queen',         price: 310_000, durationMin: 75, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_180x200',      name: 'Cuci Kasur (180×200) - King',          price: 330_000, durationMin: 90, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_200x200',      name: 'Cuci Kasur (200×200) - Super King',    price: 350_000, durationMin: 90, unit: 'per kasur',            icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_bantal',       name: 'Cuci Bantal / Guling',                 price: 70_000, durationMin: 20, unit: 'per buah',             icon: Sparkles, group: 'Cuci Kasur (Hydro)' },
  { code: 'hydro_sofa',         name: 'Cuci Sofa (Hydro)',                    price: 80_000,  durationMin: 30, unit: 'per tempat duduk',     icon: Sofa,     group: 'Cuci Kasur (Hydro)' },

  // Dapur & Peralatan
  { code: 'cuci_piring',        name: 'Cuci Piring (max 20 buah)',            price: 30_000, durationMin: 20, unit: 'sekali kerja',          icon: ChefHat,      group: 'Dapur' },
  { code: 'cuci_alat_masak',    name: 'Cuci Alat Masak (max 10 buah)',        price: 40_000, durationMin: 25, unit: 'sekali kerja',          icon: ChefHat,      group: 'Dapur' },
  { code: 'kulkas',             name: 'Bersihin Kulkas (dalam + luar)',       price: 75_000, durationMin: 40, unit: 'per kulkas',           icon: Refrigerator, group: 'Dapur' },
  { code: 'kompor',             name: 'Bersihin Kompor + Grill',              price: 50_000, durationMin: 30, unit: 'per kompor',           icon: ChefHat,      group: 'Dapur' },
  { code: 'microwave_oven',     name: 'Bersihin Microwave / Oven',            price: 50_000, durationMin: 25, unit: 'per unit',             icon: ChefHat,      group: 'Dapur' },
  { code: 'hood_exhaust',       name: 'Bersihin Hood / Cooker Hood',          price: 65_000, durationMin: 35, unit: 'per unit',             icon: Wind,         group: 'Dapur' },
  { code: 'dispenser',          name: 'Bersihin Dispenser Air',               price: 25_000, durationMin: 15, unit: 'per dispenser',        icon: Refrigerator, group: 'Dapur' },

  // Kamar Mandi Ekstra
  { code: 'sikat_keramik',      name: 'Sikat Keramik Dinding KM',             price: 30_000, durationMin: 20, unit: 'per m²',               icon: Bath,     group: 'Kamar Mandi' },
  { code: 'shower_head',        name: 'Bersihin Shower (kepala shower)',      price: 25_000, durationMin: 15, unit: 'per shower',           icon: Bath,     group: 'Kamar Mandi' },
  { code: 'poles_kaca_shower',  name: 'Poles Kaca Shower / Cermin',           price: 25_000, durationMin: 15, unit: 'per kaca',             icon: Sparkles, group: 'Kamar Mandi' },
  { code: 'saluran_air',        name: 'Bersihin Saluran Pembuangan Air',      price: 25_000, durationMin: 15, unit: 'per saluran',          icon: Wind,     group: 'Kamar Mandi' },

  // Furniture & Kaca
  { code: 'lap_kaca_jendela',   name: 'Lap Kaca Jendela',                     price: 15_000, durationMin: 10, unit: 'per panel jendela',    icon: Wind,  group: 'Furniture & Kaca' },
  { code: 'cuci_sofa_kering',   name: 'Cuci Sofa Kering (Dry Clean)',         price: 50_000, durationMin: 25, unit: 'per tempat duduk',     icon: Sofa,  group: 'Furniture & Kaca' },
  { code: 'cuci_sofa_wet',      name: 'Cuci Sofa Basah (Wet Clean - lebih bersih)', price: 90_000, durationMin: 35, unit: 'per tempat duduk', icon: Sofa,  group: 'Furniture & Kaca' },
  { code: 'lemari_kayu',        name: 'Lap + Poles Lemari Kayu',              price: 40_000, durationMin: 30, unit: 'per lemari',           icon: Home,  group: 'Furniture & Kaca' },
  { code: 'angkut_furniture',   name: 'Angkat / Pindahin Furniture',          price: 30_000, durationMin: 15, unit: 'per furniture',        icon: Hammer, group: 'Furniture & Kaca' },

  // Sampah & Pembuangan
  { code: 'sampah',             name: 'Buang Sampah ke TPS (1x)',             price: 50_000, durationMin: 20, unit: 'sekali angkut',        icon: Snowflake, group: 'Sampah' },

  // Decluttering
  { code: 'decluttering',       name: 'Rapikan + Sortir Barang',              price: 75_000, durationMin: 60, unit: 'per jam',              icon: Shirt, group: 'Decluttering' },
];

// ============ FORM OPTIONS ============
export const PROPERTY_TYPES = ['Kos', 'Apartemen', 'Rumah', 'Ruko', 'Kantor', 'Villa', 'Guest House'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

// Skala Besar: properti komersial / skala besar
export const LARGE_SCALE_PROPERTY_TYPES = ['Mall', 'Pabrik', 'Hotel', 'Sekolah', 'Gudang', 'Kantor', 'Ruko', 'Restoran', 'Rumah Sakit', 'Lainnya'] as const;
export type LargeScalePropertyType = (typeof LARGE_SCALE_PROPERTY_TYPES)[number];

// Area / item yg dibersihkan untuk skala besar (rate per m² × luas area)
export const LARGE_SCALE_TARGETS: { code: string; label: string; ratePerM2: number; desc: string }[] = [
  { code: 'lantai',         label: 'Lantai / area utama',      ratePerM2: 5500, desc: 'Sweep, mop, vacuum lantai keseluruhan' },
  { code: 'lantai_marmer',  label: 'Lantai marmer / granit',   ratePerM2: 7500, desc: 'Polish + kristalisasi lantai marmer' },
  { code: 'karpet',         label: 'Karpet / vinyl',           ratePerM2: 5500, desc: 'Vacuum + shampoo karpet, deep clean' },
  { code: 'atap',           label: 'Atap / genteng',           ratePerM2: 8000, desc: 'Bersihin atap dari debu, lumut, daun' },
  { code: 'plafon',         label: 'Plafon / langit-langit',   ratePerM2: 6500, desc: 'Sapu sarang laba-laba, lap plafon' },
  { code: 'dinding_dalam',  label: 'Dinding dalam',            ratePerM2: 5000, desc: 'Lap dinding interior, hilangin debu & noda' },
  { code: 'dinding',        label: 'Dinding luar / fasad',     ratePerM2: 7000, desc: 'Cuci dinding luar (kotor air hujan, lumut)' },
  { code: 'kaca',           label: 'Jendela / kaca',           ratePerM2: 5500, desc: 'Lap kaca dalam + luar' },
  { code: 'kaca_tinggi',    label: 'Kaca tinggi / gondola',    ratePerM2: 12000, desc: 'Kaca gedung tinggi pakai rope access / gondola' },
  { code: 'parkir',         label: 'Area parkir',              ratePerM2: 3500, desc: 'Sapu, semprot area parkir / drop-off' },
  { code: 'tangga',         label: 'Tangga / koridor',         ratePerM2: 4000, desc: 'Mop tangga, pegangan & koridor' },
  { code: 'lift',           label: 'Area lift / lobby',        ratePerM2: 5500, desc: 'Lap dinding lift, lantai lobby' },
  { code: 'taman',          label: 'Taman / halaman',          ratePerM2: 3000, desc: 'Sapu daun, bersihin halaman terbuka' },
  { code: 'kolam',          label: 'Kolam / fountain',         ratePerM2: 9000, desc: 'Drain, sikat, refill kolam' },
  { code: 'dapur_komersial',label: 'Dapur komersial',          ratePerM2: 8500, desc: 'Degreasing dapur, hood, lantai berminyak' },
  { code: 'gudang',         label: 'Gudang / warehouse',       ratePerM2: 3500, desc: 'Sapu lantai gudang, rak, area logistik' },
  { code: 'furniture',      label: 'Furniture / sofa kantor',  ratePerM2: 4000, desc: 'Vacuum + shampoo sofa, kursi kerja' },
  { code: 'sampah',         label: 'Pembersihan post-event',   ratePerM2: 3500, desc: 'Angkut sampah, sapu sisa acara' },
  { code: 'kaca_dalam',     label: 'Partisi kaca / sekat',     ratePerM2: 4500, desc: 'Lap partisi kaca kantor, ruang meeting' },
];
export const LARGE_SCALE_BATHROOM_RATE = 75_000;
export const LARGE_SCALE_MAX_M2 = 500;

// Pasca Renovasi: scope spesial (debu konstruksi, sisa cat, puing, kaca)
export const POST_RENO_PROPERTY_TYPES = ['Rumah', 'Apartemen', 'Ruko', 'Kantor', 'Villa', 'Lainnya'] as const;
export const POST_RENO_LEVELS: { code: string; label: string; desc: string; multiplier: number }[] = [
  { code: 'cat_ulang', label: 'Cat Ulang / Minor', desc: 'Repaint dinding, debu cat ringan, minim puing', multiplier: 1.0 },
  { code: 'renovasi_sedang', label: 'Renovasi Sedang', desc: 'Ada bongkar partisi, debu semen sedang, sisa material', multiplier: 1.3 },
  { code: 'renovasi_total', label: 'Renovasi Total', desc: 'Bongkar besar, debu semen tebal, banyak puing & sisa cat', multiplier: 1.6 },
];
export const POST_RENO_TARGETS: { code: string; label: string; ratePerM2: number; desc: string }[] = [
  { code: 'debu_semen',  label: 'Sapu & buang debu semen',  ratePerM2: 8000, desc: 'Debu konstruksi dari lantai, sudut, sela' },
  { code: 'sisa_cat',    label: 'Bersih sisa cat / plamir',  ratePerM2: 6500, desc: 'Cat menempel di lantai, kaca, kusen' },
  { code: 'kaca',        label: 'Lap kaca & jendela',        ratePerM2: 5500, desc: 'Kaca berdebu / ada residu cat' },
  { code: 'kusen',       label: 'Lap kusen & frame pintu',   ratePerM2: 4500, desc: 'Kusen pintu/jendela penuh debu konstruksi' },
  { code: 'plafon',      label: 'Lap plafon & langit-langit', ratePerM2: 6000, desc: 'Sarang laba-laba + debu pasca cat' },
  { code: 'lantai_poles',label: 'Pel + poles lantai',         ratePerM2: 5000, desc: 'Pel deep clean, poles bila marmer' },
  { code: 'furniture',   label: 'Lap furniture & kabinet',    ratePerM2: 4500, desc: 'Lemari, meja, kabinet built-in' },
  { code: 'puing',       label: 'Angkut puing kecil',         ratePerM2: 4000, desc: 'Sisa kayu, kardus, potongan kecil' },
  { code: 'saklar',      label: 'Bersih saklar & stop kontak', ratePerM2: 2000, desc: 'Saklar, stop kontak, AC outdoor' },
];
export const POST_RENO_BATHROOM_RATE = 100_000;  // bersih kamar mandi pasca reno
export const POST_RENO_KITCHEN_FLAT = 150_000;   // dapur pasca reno (degrease)
export const POST_RENO_MAX_M2 = 300;

// Subscription / Berlangganan Bulanan
export const SUBSCRIPTION_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;
// Mapping nama paket → jumlah visit per bulan (untuk validation user pilih cukup hari rutin).
export const SUBSCRIPTION_VISITS_BY_PKG: { match: RegExp; visits: number }[] = [
  { match: /basic|3x/i,    visits: 3 },
  { match: /standard|5x/i, visits: 5 },
  { match: /premium|6x/i,  visits: 6 },
  { match: /ultimate|10x/i, visits: 10 },
];

export const FLOOR_OPTIONS = ['1', '2', '3', '>3'] as const;
export type FloorOption = (typeof FLOOR_OPTIONS)[number];

export const ROOM_FACILITIES = ['Dapur', 'Ruang Tamu', 'Pekarangan', 'Garasi'] as const;

export const DIRT_LEVELS: { level: 1 | 2 | 3 | 4 | 5; label: string; desc: string; multiplier: number }[] = [
  { level: 1, label: 'Ringan', desc: 'Debu & kotoran harian', multiplier: 1 },
  { level: 2, label: 'Sedang', desc: 'Belum dibersihkan beberapa hari', multiplier: 1.15 },
  { level: 3, label: 'Sangat Kotor', desc: 'Lama tidak dibersihkan / pasca renovasi · foto wajib', multiplier: 1.4 },
];

// Jenis kotoran — bukan sampah (sampah masuk add-on "Buang Sampah ke TPS")
export const DIRT_CHARACTERS = [
  'Debu',
  'Noda cair',
  'Minyak / lemak',
  'Kerak / karat',
  'Jamur / lumut',
  'Sisa renovasi',
  'Bulu hewan',
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
