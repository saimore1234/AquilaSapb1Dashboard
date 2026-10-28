import { isNative } from './platform';

/**
 * Session storage for the login token and the signed-in user.
 *  - Installed app: the iOS Keychain / Android Keystore-backed secure store (never the WebView's localStorage).
 *  - Website: localStorage, exactly as before.
 * Reads are synchronous from an in-memory copy that is loaded once, before the app renders (initSession). The SAP password is never stored.
 */
const KEYS = ['sapb1_token', 'sapb1_user'];
const memory = new Map<string, string>();

async function secure() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  return SecureStorage;
}

export async function initSession(): Promise<void> {
  if (isNative) {
    try {
      const store = await secure();
      for (const k of KEYS) {
        const v = await store.get(k);
        if (typeof v === 'string') memory.set(k, v);
      }
    } catch {
      // Secure store unavailable: start signed out rather than failing to start.
    }
    return;
  }
  for (const k of KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) memory.set(k, v);
    } catch {
      // storage blocked
    }
  }
}

export const session = {
  get(key: string): string | null {
    return memory.get(key) ?? null;
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    if (isNative) void secure().then((s) => s.set(key, value)).catch(() => undefined);
    else {
      try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
    }
  },
  remove(key: string): void {
    memory.delete(key);
    if (isNative) void secure().then((s) => s.remove(key)).catch(() => undefined);
    else {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    }
  }
};
