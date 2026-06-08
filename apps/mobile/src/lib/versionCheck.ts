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

/** Fetch info update dari backend (PUBLIC endpoint, no auth needed) */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  // Skip di web - gak relevan (gak ada app store), dan biasanya kena CORS dev.
  if (Platform.OS === 'web') return null;
  try {
    const baseUrl = (Constants.expoConfig?.extra as any)?.apiBaseUrl ?? 'https://api.jasabersih.com/v1';
    const res = await fetch(
      `${baseUrl}/app/version-check?platform=${Platform.OS}&version=${currentVersion()}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = (json?.data ?? json) as UpdateInfo;
    if (!data?.latestVersion) return null;
    return data;
  } catch {
    // Silent fail - version check is best-effort, never block app.
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
