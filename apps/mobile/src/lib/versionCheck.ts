import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type UpdateInfo = {
  /** Versi terbaru yang ada di store */
  latestVersion: string;
  /** Minimum versi yang masih boleh dipakai. Di bawah ini → force update */
  minVersion: string;
  releaseNotes: string[];
  /** URL Play Store / App Store */
  storeUrl: string;
  required: boolean;
};

/** Versi app saat ini (dari app.json → expo.version) */
export function currentVersion(): string {
  return (Constants.expoConfig?.version ?? '0.1.0') as string;
}

/** Parse "1.2.3" → [1,2,3] */
function parseVer(v: string): number[] {
  return v.split('.').map((n) => Number(n) || 0);
}

/** a < b → -1, a > b → 1, equal → 0 */
export function compareVersion(a: string, b: string): number {
  const pa = parseVer(a);
  const pb = parseVer(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** Fetch info update dari backend. Untuk DEV: bisa di-override via env atau mock */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    // TODO Sprint 2: ganti dengan endpoint real
    // const baseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? 'http://localhost:3000/v1';
    // const res = await fetch(`${baseUrl}/app/version-check?platform=${Platform.OS}&version=${currentVersion()}`);
    // const json = await res.json();
    // return json.data as UpdateInfo;

    // DEV mock: ubah angka di sini untuk simulasi update tersedia
    const mock: UpdateInfo = {
      latestVersion: '1.1.0',
      minVersion: '0.5.0',
      releaseNotes: [
        'Pin alamat di Google Maps lebih akurat',
        'Wizard 3-step untuk booking lebih simple',
        'Mode Cleaner dengan Job Board real-time',
        'Bug fixes & performance',
      ],
      storeUrl:
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/id/app/jasabersih/id000000'
          : 'https://play.google.com/store/apps/details?id=com.jasabersih.app',
      required: false,
    };
    return mock;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[versionCheck] fetch failed', e);
    return null;
  }
}

/** True jika current < latest → recommend update; True force jika current < min */
export function evaluateUpdate(info: UpdateInfo): {
  hasUpdate: boolean;
  forced: boolean;
} {
  const cv = currentVersion();
  const isOutdated = compareVersion(cv, info.latestVersion) < 0;
  const isBelowMin = compareVersion(cv, info.minVersion) < 0;
  return { hasUpdate: isOutdated, forced: isBelowMin || info.required };
}
