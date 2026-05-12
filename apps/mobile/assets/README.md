# Logo Assets — Drop here

Required files (PNG, transparent background):

| File | Size | Purpose |
|---|---|---|
| `icon.png` | **1024×1024** | App icon (iOS home screen + Android legacy) |
| `adaptive-icon.png` | **1024×1024** | Android adaptive (logo only, safe zone = inner 66%) |
| `splash-logo.png` | **400×400** (or larger square) | Splash screen logo, shown over `#1E40AF` background |

## How to update

1. Drop the 3 PNG files in this folder (overwriting if exists).
2. Run a fresh build:
   - Dev: `npx expo prebuild --clean` then `npx expo start --clear`
   - EAS: `eas build --platform all --profile production`
3. The next install/upgrade ships the new branding.

## Why split icon vs splash vs adaptive

- **icon.png**: shown on home screen, app store. Should look good even at 60×60.
- **adaptive-icon.png**: Android only. Background is set to `#1E40AF` via app.json; this PNG is the **foreground only** (logo with transparent bg). Don't include the bg color in the image.
- **splash-logo.png**: shown for ~1s before JS engine boots. Center-aligned over solid color.

## Notes

- After dropping logos, in-app **SplashOverlay** (covers boot until fonts+auth ready) still uses `brand.logo_url` from the CMS. Set that via `/admin/app-settings → brand.logo_url` to a public URL (e.g. uploaded R2 image) so non-app-update logo swaps still work.
