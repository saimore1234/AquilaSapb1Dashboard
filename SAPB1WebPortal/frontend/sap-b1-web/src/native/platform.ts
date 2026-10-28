import { Capacitor } from '@capacitor/core';

/** True only inside the Android / iOS app (Capacitor). On the website every native feature is skipped, so the web build behaves as before. */
export const isNative = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

/**
 * The API address is a build-time value (VITE_API_BASE_URL). It is NOT a secret and ends up inside the app bundle — never put passwords,
 * tokens, SQL or SAP credentials in any VITE_ variable. The website uses the relative '/api' (proxied by Vercel / the Vite dev server);
 * the installed app has no such proxy, so it needs an absolute HTTPS address.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api';

const TEMP_TUNNEL = /(trycloudflare\.com|ngrok|loca\.lt|localtunnel|localhost|127\.0\.0\.1|10\.0\.2\.2)/i;

/** A problem with the API address that makes the INSTALLED app unusable. null = fine (always null on the website). */
export function apiConfigProblem(): string | null {
  if (!isNative) return null;
  if (!/^https?:\/\//i.test(API_BASE_URL)) {
    return 'This build has no API address. Set VITE_API_BASE_URL to the HTTPS address of the Aquila API and rebuild the app.';
  }
  if (!/^https:\/\//i.test(API_BASE_URL)) {
    return 'The API address must use HTTPS. Plain HTTP is blocked in the app.';
  }
  if (/(example.(com|org|net)|CHANGE-?ME|your-)/i.test(API_BASE_URL)) {
    return 'The API address is still the placeholder. Set VITE_API_BASE_URL to the real HTTPS address of the Aquila API and rebuild the app.';
  }
  // VITE_ALLOW_TEMP_API=true is for a short internal TEST build only (e.g. an emulator pointed at a tunnel). Never set it for a store build.
  if (import.meta.env.PROD && import.meta.env.VITE_ALLOW_TEMP_API !== 'true' && TEMP_TUNNEL.test(API_BASE_URL)) {
    return 'A production build must not point to a temporary tunnel or localhost. Set VITE_API_BASE_URL to the permanent HTTPS address of the Aquila API.';
  }
  return null;
}
