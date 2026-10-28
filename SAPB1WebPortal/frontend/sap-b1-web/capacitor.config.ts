import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the existing React portal. The web build (vite -> dist/) is bundled INTO the app; all business data comes from the
 * .NET API over HTTPS (VITE_API_BASE_URL at build time). Nothing here is a secret: never put credentials in this file.
 */
const config: CapacitorConfig = {
  appId: 'com.aquila.portal',
  appName: 'Aquila Portal',
  webDir: 'dist',
  server: {
    // The app is served from https://localhost (Android) / capacitor://localhost (iOS). Cleartext HTTP is never allowed.
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    // Release builds must not be debuggable from a browser.
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'never' // the web layer handles notches itself via env(safe-area-inset-*)
  },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: true, backgroundColor: '#131f3a', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#131f3a', overlaysWebView: false },
    Keyboard: { resize: 'body', resizeOnFullScreen: true }
  }
};

export default config;
