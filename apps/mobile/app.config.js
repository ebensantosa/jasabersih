// Dynamic Expo config.
// Firebase native plugins di-include cuma saat native build (EAS / expo run:*),
// dan di-skip saat web dev (Metro tidak punya native runtime).
// Override via env: EXPO_NO_FIREBASE=1 untuk paksa skip.

const IS_NATIVE_BUILD =
  !!process.env.EAS_BUILD ||
  process.env.EXPO_PLATFORM === 'ios' ||
  process.env.EXPO_PLATFORM === 'android';

const SHOULD_USE_FIREBASE =
  IS_NATIVE_BUILD && process.env.EXPO_NO_FIREBASE !== '1';

const basePlugins = [
  'expo-router',
  'expo-secure-store',
  [
    'expo-image-picker',
    {
      photosPermission: 'JasaBersih perlu akses galeri untuk upload foto kondisi rumah.',
      cameraPermission: 'JasaBersih perlu akses kamera untuk ambil foto kondisi rumah langsung.',
    },
  ],
  [
    'expo-notifications',
    {
      // Android 13+ POST_NOTIFICATIONS otomatis di-declare oleh plugin ini.
      // icon harus 96x96 monochrome (white on transparent) - pakai adaptive foreground.
      icon: './assets/adaptive-icon.png',
      color: '#1D4ED8',
    },
  ],
];

const firebasePlugins = [
  '@react-native-firebase/app',
  '@react-native-firebase/crashlytics',
  ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
];

module.exports = {
  expo: {
    name: 'JasaBersih',
    slug: 'jasabersih-app',
    version: '1.3.3',
    scheme: 'jasabersih',
    orientation: 'default',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.jasabersih.app',
      buildNumber: '18',
      icon: './assets/icon.png',
      googleServicesFile: './GoogleService-Info.plist',
    },
    android: {
      package: 'com.jasabersih.app',
      versionCode: 18,
      edgeToEdgeEnabled: false,
      icon: './assets/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      googleServicesFile: './google-services.json',
    },
    plugins: [
      ...(SHOULD_USE_FIREBASE ? [...basePlugins, ...firebasePlugins] : basePlugins),
      [
        'expo-splash-screen',
        {
          image: './assets/splash-logo.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          imageWidth: 280,
        },
      ],
    ],
    experiments: { typedRoutes: false },
    updates: {
      url: 'https://u.expo.dev/4ceb9dcf-a9bb-4125-b71e-3d3020c3ca4a',
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: { policy: 'appVersion' },
    extra: {
      apiBaseUrl: 'https://api.jasabersih.com/v1',
      privacyUrl: 'https://jasabersih.com/ketentuan-layanan/',
      termsUrl: 'https://jasabersih.com/syarat-dan-ketentuan/',
      eas: { projectId: '4ceb9dcf-a9bb-4125-b71e-3d3020c3ca4a' },
    },
    owner: 'ebensantosa',
  },
};
