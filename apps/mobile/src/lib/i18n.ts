import { create } from 'zustand';

import { storage } from './storage';

export type Locale = 'id' | 'en';

const KEY = 'app.locale';

// Translation dictionary. Add new keys to BOTH id and en.
// Keys use dot.notation by feature (e.g. 'auth.login', 'common.cancel').
// For interpolation, use {name} placeholders - replace at call time.
const TRANSLATIONS = {
  id: {
    'common.cancel': 'Batal',
    'common.save': 'Simpan',
    'common.confirm': 'Konfirmasi',
    'common.next': 'Lanjut',
    'common.back': 'Kembali',
    'common.loading': 'Memuat…',
    'common.search': 'Cari',
    'common.error.generic': 'Terjadi kesalahan',
    'common.success': 'Berhasil',
    'common.delete': 'Hapus',
    'common.edit': 'Edit',
    'common.optional': 'opsional',
    'common.required': 'wajib',

    'auth.welcome': 'Selamat datang',
    'auth.phone_placeholder': 'Nomor HP',
    'auth.password_placeholder': 'Password',
    'auth.login': 'Masuk',
    'auth.register': 'Daftar',
    'auth.otp_title': 'Verifikasi OTP',
    'auth.otp_sent': 'Kode 6 digit dikirim ke {phone}',
    'auth.full_name': 'Nama lengkap',
    'auth.create_password': 'Buat password (min 8 karakter)',
    'auth.referral_code': 'Kode referral (opsional) - dapat bonus',
    'auth.processing': 'Memproses…',
    'auth.complete': 'Selesai & Masuk',

    'tab.home': 'Beranda',
    'tab.bookings': 'Pesanan',
    'tab.explore': 'Layanan',
    'tab.profile': 'Profil',
    'tab.jobs': 'Job',
    'tab.earnings': 'Pendapatan',

    'profile.account': 'Akun',
    'profile.others': 'Lainnya',
    'profile.addresses': 'Alamat Tersimpan',
    'profile.wallet': 'Wallet & Pembayaran',
    'profile.referral': 'Referral & Bonus',
    'profile.vouchers': 'Voucher Saya',
    'profile.security': 'Keamanan & Privasi',
    'profile.help': 'Pusat Bantuan',
    'profile.settings': 'Pengaturan',
    'profile.language': 'Bahasa',
    'profile.logout': 'Keluar',

    'booking.pay': 'Bayar',
    'booking.cancel': 'Batalkan Pesanan',
    'booking.report': 'Laporkan Masalah',
    'booking.rate': 'Beri Rating',
    'booking.already_rated': 'Sudah diberi rating',
    'booking.searching': 'Mencari Cleaner',
    'booking.matched': 'Cleaner Ditemukan',
    'booking.completed': 'Selesai',

    'cleaner.online': 'Online',
    'cleaner.offline': 'Offline',
    'cleaner.depart': 'Berangkat (OTW)',
    'cleaner.start_work': 'Mulai Kerja',
    'cleaner.finish': 'Selesai',
    'cleaner.brings_tools': 'Bawa Alat Sendiri',
    'cleaner.no_tools': 'Tanpa Alat',

    'lang.id': 'Indonesia',
    'lang.en': 'English',
    'lang.choose': 'Pilih Bahasa',

    'login.welcome_emoji': 'Selamat Datang 👋',
    'login.subtitle': 'Masuk untuk lanjut pesan jasa bersih',
    'login.email': 'Email',
    'login.no_account': 'Belum punya akun?',
    'login.signup_link': 'Daftar di sini',
    'login.signing_in': 'Memproses…',

    'home.send_to': 'Kirim ke',
    'home.no_address': 'Belum ada alamat',
    'home.tap_to_add': 'Tap untuk tambah alamat',
    'home.greeting': 'Halo',
    'home.headline': 'Mau bersihin apa hari ini?',
    'home.mode_packages': 'Paket',
    'home.mode_packages_sub': 'Harga tetap',
    'home.mode_hourly': 'Per Jam',
    'home.mode_hourly_sub': 'Mulai 90rb',
    'home.mode_wa': 'WA Survey',
    'home.mode_wa_sub': 'Konsultasi',
    'home.popular': 'Layanan Populer',
    'home.see_all': 'Lihat semua',
    'home.featured_cleaners': 'Cleaner Pilihan',
    'home.top_rated': 'Rating tertinggi',

    'bd.payment': 'Pembayaran',
    'bd.subtotal': 'Subtotal',
    'bd.total': 'Total',
    'bd.scheduled_at': 'Jadwal',
    'bd.address': 'Alamat',
    'bd.cleaner': 'Cleaner',
    'bd.timeline': 'Timeline Order',
    'bd.work_photos': 'Foto Pekerjaan',
    'bd.before': 'Sebelum',
    'bd.after': 'Sesudah',
    'bd.damage': 'Kerusakan',
    'bd.no_photos': 'Belum ada foto.',
    'bd.chat': 'Chat',
    'bd.chat_customer': 'Chat Customer',
    'bd.waiting_cleaner': 'Menunggu cleaner…',
    'bd.cs_will_wa': 'CS akan WhatsApp kamu',
    'bd.free_cancel_left': 'Batal ({sec}s gratis)',
    'bd.cancel_btn': 'Batalkan',
  } satisfies Record<string, string>,

  en: {
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.confirm': 'Confirm',
    'common.next': 'Next',
    'common.back': 'Back',
    'common.loading': 'Loading…',
    'common.search': 'Search',
    'common.error.generic': 'Something went wrong',
    'common.success': 'Success',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.optional': 'optional',
    'common.required': 'required',

    'auth.welcome': 'Welcome',
    'auth.phone_placeholder': 'Phone number',
    'auth.password_placeholder': 'Password',
    'auth.login': 'Sign In',
    'auth.register': 'Sign Up',
    'auth.otp_title': 'Verify OTP',
    'auth.otp_sent': '6-digit code sent to {phone}',
    'auth.full_name': 'Full name',
    'auth.create_password': 'Create password (min 8 characters)',
    'auth.referral_code': 'Referral code (optional) - get bonus',
    'auth.processing': 'Processing…',
    'auth.complete': 'Finish & Sign In',

    'tab.home': 'Home',
    'tab.bookings': 'Orders',
    'tab.explore': 'Services',
    'tab.profile': 'Profile',
    'tab.jobs': 'Jobs',
    'tab.earnings': 'Earnings',

    'profile.account': 'Account',
    'profile.others': 'Others',
    'profile.addresses': 'Saved Addresses',
    'profile.wallet': 'Wallet & Payment',
    'profile.referral': 'Referral & Bonus',
    'profile.vouchers': 'My Vouchers',
    'profile.security': 'Security & Privacy',
    'profile.help': 'Help Center',
    'profile.settings': 'Settings',
    'profile.language': 'Language',
    'profile.logout': 'Sign out',

    'booking.pay': 'Pay',
    'booking.cancel': 'Cancel Order',
    'booking.report': 'Report Issue',
    'booking.rate': 'Rate',
    'booking.already_rated': 'Already rated',
    'booking.searching': 'Finding Cleaner',
    'booking.matched': 'Cleaner Found',
    'booking.completed': 'Completed',

    'cleaner.online': 'Online',
    'cleaner.offline': 'Offline',
    'cleaner.depart': 'On The Way',
    'cleaner.start_work': 'Start Work',
    'cleaner.finish': 'Done',
    'cleaner.brings_tools': 'Bring Own Tools',
    'cleaner.no_tools': 'No Tools',

    'lang.id': 'Indonesia',
    'lang.en': 'English',
    'lang.choose': 'Choose Language',

    'login.welcome_emoji': 'Welcome 👋',
    'login.subtitle': 'Sign in to continue booking',
    'login.email': 'Email',
    'login.no_account': "Don't have an account?",
    'login.signup_link': 'Sign up here',
    'login.signing_in': 'Processing…',

    'home.send_to': 'Send to',
    'home.no_address': 'No address yet',
    'home.tap_to_add': 'Tap to add address',
    'home.greeting': 'Hi',
    'home.headline': 'What needs cleaning today?',
    'home.mode_packages': 'Packages',
    'home.mode_packages_sub': 'Fixed price',
    'home.mode_hourly': 'Hourly',
    'home.mode_hourly_sub': 'From 90k',
    'home.mode_wa': 'WA Survey',
    'home.mode_wa_sub': 'Consult',
    'home.popular': 'Popular Services',
    'home.see_all': 'See all',
    'home.featured_cleaners': 'Featured Cleaners',
    'home.top_rated': 'Top rated',

    'bd.payment': 'Payment',
    'bd.subtotal': 'Subtotal',
    'bd.total': 'Total',
    'bd.scheduled_at': 'Schedule',
    'bd.address': 'Address',
    'bd.cleaner': 'Cleaner',
    'bd.timeline': 'Order Timeline',
    'bd.work_photos': 'Work Photos',
    'bd.before': 'Before',
    'bd.after': 'After',
    'bd.damage': 'Damage',
    'bd.no_photos': 'No photos yet.',
    'bd.chat': 'Chat',
    'bd.chat_customer': 'Chat Customer',
    'bd.waiting_cleaner': 'Waiting for cleaner…',
    'bd.cs_will_wa': 'CS will reach via WhatsApp',
    'bd.free_cancel_left': 'Cancel ({sec}s free)',
    'bd.cancel_btn': 'Cancel',
  } satisfies Record<string, string>,
};

export type TranslationKey = keyof typeof TRANSLATIONS.id;

type State = {
  locale: Locale;
  hydrated: boolean;
  setLocale: (l: Locale) => void;
  hydrate: () => void;
};

export const useLocaleStore = create<State>((set) => ({
  locale: 'id',
  hydrated: false,
  hydrate: () => {
    const raw = storage.getString(KEY);
    if (raw === 'id' || raw === 'en') set({ locale: raw, hydrated: true });
    else set({ hydrated: true });
  },
  setLocale: (l) => {
    storage.set(KEY, l);
    set({ locale: l });
  },
}));

// Translate function. Use as: t('auth.login')
// For interpolation: t('auth.otp_sent', { phone: '+62812...' })
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.id;
    let s = (dict as Record<string, string>)[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return s;
  };
}

// Standalone t (non-reactive) - for use outside React (e.g. toast helpers)
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = useLocaleStore.getState().locale;
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.id;
  let s = (dict as Record<string, string>)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}
