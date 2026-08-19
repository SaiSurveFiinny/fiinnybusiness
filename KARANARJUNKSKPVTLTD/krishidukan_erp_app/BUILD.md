# KrishiDukan ERP — Build & Play Store Guide

## Status: READY TO BUILD
All setup is complete. Icons generated. Keystore created. Just run the build command.

---

## Keystore credentials (KEEP SAFE — NEVER COMMIT TO GIT)

| Field         | Value                          |
|---------------|-------------------------------|
| File          | android/krishidukan.jks        |
| Alias         | krishidukan                    |
| Store password| KrishiDukan@2026               |
| Key password  | KrishiDukan@2026               |
| Valid until   | 2054-01-03                     |

**SHA256 fingerprint:**
`BB:92:72:A3:7C:BB:FF:17:49:8E:2E:0E:8D:B4:58:A5:3D:C0:FA:16:A2:1A:22:30:15:28:FD:94:F9:08:B0:F0`

---

## Build the release bundle (on any machine with Flutter installed)

```bash
# 1. Clone the repo and go into this folder
cd krishidukan_erp_app

# 2. Get dependencies
flutter pub get

# 3. Build release .aab
flutter build appbundle --release

# Output: build/app/outputs/bundle/release/app-release.aab
```

---

## Upload to Play Console

1. Go to https://play.google.com/console
2. Create new app → "KrishiDukan ERP"
3. Package name: com.krishidukan.erp
4. Fill store listing (description, screenshots, etc.)
5. Release → Production → Create new release
6. Upload `app-release.aab`
7. Submit for review → ~14 days

---

## CRITICAL — Back up your keystore
Back up these two files outside of git (Drive, 1Password, etc.):
- `android/krishidukan.jks`
- The passwords above

Losing the keystore = can never update the app on Play Store.
