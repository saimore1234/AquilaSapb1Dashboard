# Aquila Portal — Mobile app (Android & iOS) setup

The mobile app is the **existing React portal** wrapped with [Capacitor](https://capacitorjs.com). The web build (`dist/`) is bundled into the app;
all data still comes from the .NET API. The website (Vercel) is unchanged.

| Item | Value |
|---|---|
| App name | Aquila Portal |
| App ID / bundle ID | `com.aquila.portal` |
| Framework | Vite 5 + React 18 + TypeScript + Tailwind, `npm` |
| Capacitor | 8.5.x (core, cli, android, ios) |
| Web output folder | `dist` |
| Native projects | `android/` (Android Studio), `ios/` (Xcode, **needs a Mac**) |

---

## 1. What the app can and cannot do today

| | Status |
|---|---|
| Web build (`npm run build`) | passes |
| `npx cap sync` (Android + iOS) | passes |
| Android project | created, syncs; **not compiled here** (this PC has Java 8 and no Android SDK) |
| iOS project | created and synced; **cannot be built on Windows** |
| Signed `.aab` / TestFlight build | **not produced** — needs your keystore, Android Studio, a Mac and Apple account |
| Production API | **not available yet** — the API currently runs on a laptop behind a temporary tunnel |
| Push notifications, biometric login | **not implemented** (integration points only — see §9) |

**The installed app will show "can't connect" until `VITE_API_BASE_URL` is set to a permanent HTTPS address.** That is deliberate (see §3).

---

## 2. Commands (run in `SAPB1WebPortal/frontend/sap-b1-web`)

```bash
npm install                          # once, and after pulling
npm run build                        # the website build (unchanged)
npm run assets:generate              # (re)generate app icons + splash from assets/*.png

# Android
npm run cap:sync                     # production web build + copy into android/ and ios/
npm run cap:sync:staging             # same with the staging API address
npm run android:open                 # opens Android Studio
npm run android:run                  # staging build -> emulator / USB device
cd android && gradlew.bat bundleRelease      # signed .aab for Google Play (needs keystore.properties, see §6)

# iOS (on a Mac)
npm run cap:sync
npm run ios:open                     # opens Xcode
```

---

## 3. Backend connectivity (must be done before any real release)

1. **Host the .NET API on a server with a permanent HTTPS address** (Azure/AWS VM, company server, IIS + a real certificate). A laptop + `trycloudflare`
   tunnel is not acceptable: the address changes on every restart.
2. The server needs a private route to the SAP SQL Server (VPN / firewall rule). **The app never connects to SQL Server or SAP directly.**
3. Set the address per environment — copy the example file and edit it:
   ```
   .env.staging.example     -> .env.staging       VITE_API_BASE_URL=https://staging-api.<your-domain>/api
   .env.production.example  -> .env.production    VITE_API_BASE_URL=https://api.<your-domain>/api
   ```
   Build with `npm run build:staging` / `npm run build:production` (`cap:sync*` does it for you).
4. The app **refuses to start** (shows a clear message) if the address is missing, relative (`/api`), not HTTPS, still a placeholder, or — in a
   production build — a tunnel / localhost. The website keeps using the relative `/api` and is not affected.
5. **CORS** — the API already allows the app origins `https://localhost` (Android) and `capacitor://localhost` (iOS)
   (`Cors:AllowedOrigins` in `appsettings.json`). Keep your web origin there too.
6. Production checklist for the API: HTTPS only (valid certificate), `Jwt:Key` and connection strings in secrets/environment variables, request logging
   without tokens, rate limiting on `/api/auth/login`, backups.

### What is safe in the app and what is not
- **Safe (not secret):** `VITE_API_BASE_URL`, app version, app ID. These are compiled into the app and readable by anyone who unzips it.
- **Never in the app / any `VITE_` variable:** SQL or SAP passwords, JWT signing key, API secrets, certificates, keystores. These stay on the server
  (`dotnet user-secrets` in development, environment variables / a secret store in production). A `VITE_` variable is **not** a secret store.

---

## 4. Authentication & session

- The existing login flow and permission checks are unchanged; the **server enforces authorization** (the app UI only hides things).
- Installed app: the login token and user name are kept in the **iOS Keychain / Android Keystore-backed secure store**
  (`@aparajita/capacitor-secure-storage`), not in WebView `localStorage`. Website: `localStorage`, as before. The SAP password is never stored.
- A `401` anywhere clears the session and returns to the sign-in screen; returning to the app also re-checks the session (`/api/auth/me`).
- Logout clears the secure store.
- **Test accounts:** do not use real production data for store review or testers. Point a *staging* API at a SAP **test company database**
  (`CompanyConnectionStrings:<CODE>` in user-secrets), create a restricted role (Administration → Roles) and a test user for it. Give Apple/Google
  that user in the review notes.

---

## 5. Mobile UI

Already responsive before this work: sidebar → drawer, bottom navigation with safe-area padding, card/table layouts that scroll horizontally.
Added for the app (all scoped to `html.native` or touch devices; the desktop website is unchanged):
- Status-bar / notch safe areas, navy status-bar colour, no horizontal overflow, no overscroll bounce.
- 16 px form fields (stops iOS zooming on focus), 40 px minimum touch targets on touch devices.
- Keyboard: focused field is scrolled into view; Android back button goes back, then exits at the top level.
- External links open in the system browser; offline banner; clear timeout / no-connection messages.
- **CSV exports and printed PDFs** use the system **share sheet** in the app (a WebView cannot download blobs like a browser).

> Layout on real devices still needs a pass on an emulator/phone (status-bar spacing differs between Android versions). Test the login, dashboard,
> Sales Overview, Reports (wide tables), Target Management and the CSV/PDF share on both platforms before release.

---

## 6. Android (Windows / Mac / Linux)

Prerequisites: **Android Studio** (includes JDK 21 and the SDK; compile/target SDK is 36) — install it; this PC currently has Java 8 only.

1. `npm run cap:sync` then `npm run android:open`.
2. Let Gradle sync. Run on an emulator or USB-debugging device (`npm run android:run`, or the green Run button).
3. **Create a signing key (once; keep it safe — losing it means you can never update the app):**
   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore aquila-release.jks -alias aquila -keyalg RSA -keysize 2048 -validity 10000
   ```
   Store the `.jks` **outside** the repository. Back it up in two places.
4. Create `android/keystore.properties` (git-ignored; never commit it):
   ```
   storeFile=C:\\keys\\aquila-release.jks
   storePassword=...
   keyAlias=aquila
   keyPassword=...
   ```
   (or set `AQUILA_KEYSTORE_FILE`, `AQUILA_KEYSTORE_PASSWORD`, `AQUILA_KEY_ALIAS`, `AQUILA_KEY_PASSWORD` environment variables, e.g. in CI).
5. Raise `versionCode` (and `versionName`) in `android/app/build.gradle` for every upload.
6. Build the bundle: `cd android && gradlew.bat bundleRelease` →
   `android/app/build/outputs/bundle/release/app-release.aab`.
7. Enrol in **Play App Signing** when you create the app in Play Console (recommended); then upload the `.aab`.

The manifest allows **no cleartext HTTP**, disables backups of app data, and requests only the `INTERNET` permission.

---

## 7. iOS (requires a Mac or a cloud macOS builder)

1. On a Mac: install Xcode, Node 22+, then `npm install && npm run cap:sync && npm run ios:open`.
   (No Mac? Use a cloud macOS build service — Codemagic, Ionic Appflow, GitHub Actions `macos` runners.)
2. In Xcode → target **App** → *Signing & Capabilities*: choose your **Team**, keep Bundle Identifier `com.aquila.portal`, enable *Automatically manage signing*.
3. **Apple Developer Program** (US$99/year, organisation account needs a D-U-N-S number) → App Store Connect → *Apps → New App* with bundle ID `com.aquila.portal`.
4. Set version/build in Xcode (General tab); increase the build number for every upload.
5. *Product → Archive → Distribute App → App Store Connect → Upload*.
6. In App Store Connect → **TestFlight**: add internal testers (up to 100, no review) and later external testers (needs a short beta review).
7. Add a **Privacy Policy URL**, App Privacy answers, screenshots (6.7" and 6.5" iPhone; iPad if you support it), review notes with the test account, then *Submit for Review*.

---

## 8. Store release checklists

**Both stores**
- [ ] Permanent HTTPS API in production; production build uses it (no tunnel/localhost)
- [ ] Privacy policy URL; support email/URL
- [ ] Data-safety / App-privacy forms (the app handles login credentials and business data sent to your own server)
- [ ] Test account on a **test** company database, with review notes
- [ ] App icon, splash (regenerate with `npm run assets:generate` from `assets/`), screenshots, description
- [ ] Tested on real devices (small phone, large phone, tablet), light/dark theme, offline, expired session, wrong password
- [ ] Version number raised

**Google Play** — Play Console account (US$25 one-time; new personal accounts need a 14-day closed test with 12 testers before production — organisation
accounts do not) · app content forms · content rating questionnaire · target audience · upload `.aab` to *Internal testing* first · then Production.

**Apple App Store** — Apple Developer Program · TestFlight pass · "Guideline 4.2 minimum functionality": a plain website wrapper can be rejected, so
mention the native features (secure login storage, share sheet export, offline handling) and consider adding push notifications / biometric unlock.

**Internal staff only?** A public listing is not required. Use **Apple Business Manager → Custom Apps** (private distribution to your organisation) and
**Google Play managed private apps** — faster approval and no public exposure of a business tool.

---

## 9. Optional next steps (not implemented)

- **Push notifications** — add `@capacitor/push-notifications`, a Firebase project (`android/app/google-services.json`, `ios/App/GoogleService-Info.plist` —
  both git-ignored) and an API endpoint to register device tokens. Needs APNs key from Apple.
- **Biometric unlock** — would need a secure design with the existing JWT login (e.g. unlock a stored refresh token); not added without that design.
- Enable code shrinking for release (`minifyEnabled true` + ProGuard rules) after a full device test.

---

## 10. Files created / modified for the mobile app

Created: `capacitor.config.ts`, `android/`, `ios/`, `assets/` (icon/splash sources), `src/native/{platform,session,files}.ts`, `src/native/NativeShell.tsx`,
`src/native/ApiConfigError.tsx`, `.env.staging.example`, `.env.production.example`, `.env.development.example`, `MOBILE_APP_SETUP.md`.

Modified: `package.json` / `package-lock.json` (Capacitor + plugins + scripts), `.gitignore` (signing material, env files, native build output),
`.env.example`, `src/main.tsx`, `src/api/client.ts` (timeout, friendly network errors, secure session), `src/context/AuthContext.tsx`
(session store), `src/components/sales/salesUtils.ts` and `src/components/PrintButton.tsx` (share sheet in the app), `src/index.css`
(mobile rules), `src/vite-env.d.ts`, `android/app/build.gradle` + `AndroidManifest.xml` (signing from ignored file, no cleartext, no backup),
backend `appsettings.json` (CORS origins for the app).
