# Secrets Management

## File rahasia yang TIDAK boleh masuk repo

### 1. Firebase Admin SDK Service Account JSON
**Untuk apa**: FCM V1 push notification credential (di-upload ke EAS).

**Lokasi sekarang**: `D:\jasabersih-secrets\jasabersih-app-firebase-adminsdk-fbsvc-*.json`

**Re-generate jika hilang**:
1. Firebase Console → ⚙ Project Settings → Service Accounts tab
2. Klik "Generate new private key"
3. Save ke `D:\jasabersih-secrets\` (jangan ke folder repo!)

**Re-upload ke EAS**:
```powershell
cd D:\JasaBersih.com\jasabersih\apps\mobile
eas credentials
# → Android → production → Google Service Account
# → Manage your Google Service Account Key for Push Notifications (FCM V1)
# → Set up / Replace → kasih path file JSON di D:\jasabersih-secrets\
```

---

### 2. `google-services.json` (Firebase Android client config)
**Untuk apa**: Firebase Analytics + Crashlytics di mobile app.

**Lokasi**: `apps/mobile/google-services.json`

**Note**: File INI **dibutuhkan saat build APK**, jadi WAJIB ada di `apps/mobile/`. Walaupun teknisnya berisi konfigurasi public (project ID, app ID), best practice tetap jangan commit ke repo public.

**Re-generate jika hilang**:
1. Firebase Console → ⚙ Project Settings → General tab
2. Scroll ke "Your apps" → pilih Android app
3. Klik "google-services.json" → download
4. Taruh di `apps/mobile/google-services.json`

---

### 3. `GoogleService-Info.plist` (Firebase iOS client config)
**Sama seperti google-services.json tapi untuk iOS**

**Lokasi**: `apps/mobile/GoogleService-Info.plist`

**Re-generate**: Firebase Console → Project Settings → iOS app → download plist.

---

### 4. `.env` files (API & mobile)
**Untuk apa**: DATABASE_URL, FLIP_SECRET_KEY, R2 credentials, JWT secret, dll.

**Lokasi**:
- `apps/api/.env` (di server: `/var/www/jasabersih/apps/api/.env`)
- `apps/mobile/.env.local` (jika ada)

**Backup**: Simpan di password manager (1Password, Bitwarden) atau cloud encrypted folder.

---

### 5. EAS Credentials (Keystore, certificates)
**Untuk apa**: Sign APK & iOS build.

**Lokasi**: EAS Cloud (managed by Expo, gak ada di local).

**Backup**: Run `eas credentials` → Download keystore → simpan di `D:\jasabersih-secrets\`. Kalau hilang, build baru harus pakai keystore baru → user gak bisa update app lama (harus uninstall).

---

## Aturan Umum

✅ **DO**:
- Simpan semua secret di folder `D:\jasabersih-secrets\` (di luar repo)
- Backup folder ke encrypted cloud storage (Drive personal, OneDrive)
- Gunakan password manager untuk credential text
- Add semua pattern secret ke `.gitignore` + `.easignore`

❌ **DON'T**:
- Commit file `*.json`, `*.pem`, `*.p12`, `.env` ke git
- Paste secret di chat/email/Slack (bocor di log/screenshot)
- Share secret via "Send password via SMS" (intercepted)
- Simpan di Notes/Notion publik

---

## Verifikasi Repo Bersih

```powershell
cd D:\JasaBersih.com\jasabersih
git ls-files | Select-String -Pattern "(firebase-adminsdk|\.env$|\.p12$|keystore$)"
```

Output harus kosong. Kalau ada hasil → file rahasia ke-commit, harus di-purge dari history.
