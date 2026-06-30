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

// Fix Notifee + Firebase packaging conflicts in AGP 8.x:
// - Notifee uses compileSdkVersion = 34 (assignment style, deprecated in AGP 8)
// - Both Notifee and Firebase Messaging may include duplicate native libs
// This plugin patches android/app/build.gradle to add pickFirst rules.
// Fix manifest merger conflict: expo-notifications sets default_notification_color,
// react-native-firebase/messaging also sets it → need tools:replace to let app win.
// Uses withDangerousMod (runs AFTER all other mods) to directly patch the generated XML.
const withFirebaseMessagingManifestFix = (config) => {
  try {
    const { withDangerousMod } = require('@expo/config-plugins');
    const fs = require('fs');
    const path = require('path');
    return withDangerousMod(config, [
      'android',
      (cfg) => {
        const manifestPath = path.join(
          cfg.modRequest.platformProjectRoot,
          'app/src/main/AndroidManifest.xml'
        );
        if (!fs.existsSync(manifestPath)) return cfg;
        let xml = fs.readFileSync(manifestPath, 'utf8');
        if (!xml.includes('xmlns:tools')) {
          xml = xml.replace(
            /(<manifest\s)/,
            '$1xmlns:tools="http://schemas.android.com/tools" '
          );
        }
        xml = xml.replace(
          /(<meta-data[^>]*default_notification_color[^>]*?)(\s*\/>)/,
          '$1 tools:replace="android:resource"$2'
        );
        fs.writeFileSync(manifestPath, xml, 'utf8');
        return cfg;
      },
    ]);
  } catch {
    return config;
  }
};

const withNotifeePackagingFix = (config) => {
  // Only import config-plugins in native build context to avoid breaking web
  try {
    const { withAppBuildGradle } = require('@expo/config-plugins');
    return withAppBuildGradle(config, (cfg) => {
      const content = cfg.modResults.contents;
      const marker = '// notifee-packaging-fix';
      if (!content.includes(marker)) {
        cfg.modResults.contents = content.replace(
          /android \{/,
          `android {
    ${marker}
    packagingOptions {
        pickFirst '**/libcrypto.so'
        pickFirst '**/libssl.so'
        pickFirst '**/libjsc.so'
        pickFirst '**/libfbjni.so'
        pickFirst '**/libc++_shared.so'
        exclude 'META-INF/DEPENDENCIES'
        exclude 'META-INF/LICENSE'
        exclude 'META-INF/LICENSE.txt'
        exclude 'META-INF/NOTICE'
        exclude 'META-INF/NOTICE.txt'
    }`
        );
      }
      return cfg;
    });
  } catch {
    return config;
  }
};

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
      sounds: [
        './assets/sounds/order_incoming.wav',
        './assets/sounds/call_incoming.wav',
        './assets/sounds/chat_message.wav',
      ],
    },
  ],
];

const firebasePlugins = [
  '@react-native-firebase/app',
  '@react-native-firebase/crashlytics',
  '@react-native-firebase/messaging',
  [
    'expo-build-properties',
    {
      ios: { useFrameworks: 'static' },
      android: {
        kotlinVersion: '2.1.21',
        compileSdkVersion: 35,
        targetSdkVersion: 34,
        minSdkVersion: 24,
      },
    },
  ],
];

module.exports = {
  expo: {
    name: 'JasaBersih',
    slug: 'jasabersih-app',
    version: '1.5.0',
    scheme: 'jasabersih',
    orientation: 'default',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    icon: './assets/icon.png',
    splash: {
      image: './assets/adaptive-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.jasabersih.app',
      buildNumber: '22',
      icon: './assets/icon.png',
      googleServicesFile: './GoogleService-Info.plist',
    },
    android: {
      package: 'com.jasabersih.app',
      versionCode: 22,
      edgeToEdgeEnabled: false,
      permissions: [
        'USE_FULL_SCREEN_INTENT',
        'FOREGROUND_SERVICE',
        'WAKE_LOCK',
        'VIBRATE',
        'RECEIVE_BOOT_COMPLETED',
        'RECORD_AUDIO',
        'MODIFY_AUDIO_SETTINGS',
        'BLUETOOTH',
        'BLUETOOTH_CONNECT',
      ],
      icon: './assets/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      googleServicesFile: './google-services.json',
    },
    plugins: [
      ...(SHOULD_USE_FIREBASE
        ? [...basePlugins, ...firebasePlugins, withNotifeePackagingFix, withFirebaseMessagingManifestFix]
        : basePlugins),
      [
        'expo-splash-screen',
        {
          image: './assets/adaptive-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
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
