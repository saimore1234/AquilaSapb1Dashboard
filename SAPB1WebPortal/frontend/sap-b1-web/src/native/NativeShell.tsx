import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNative, nativePlatform } from './platform';
import { session } from './session';
import { apiClient } from '../api/client';

/**
 * Everything that only makes sense inside the installed app. It renders nothing on the website (the hook effects return immediately),
 * so the web build is unchanged. Mounted once inside the Router.
 *   - status bar / splash screen / keyboard behaviour
 *   - Android hardware back button (go back, otherwise leave the app)
 *   - external links open in the system browser, not inside the app
 *   - offline banner
 *   - on returning to the app, a session check so an expired login shows the sign-in screen instead of failing silently
 */
export default function NativeShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [offline, setOffline] = useState(false);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    if (!isNative) return;
    document.documentElement.classList.add('native', nativePlatform);
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    (async () => {
      const [{ StatusBar, Style }, { SplashScreen }, { App }, { Network }, { Browser }] = await Promise.all([
        import('@capacitor/status-bar'), import('@capacitor/splash-screen'), import('@capacitor/app'),
        import('@capacitor/network'), import('@capacitor/browser')
      ]);
      if (cancelled) return;

      try {
        await StatusBar.setStyle({ style: Style.Dark }); // light icons on the dark navy bar
        if (nativePlatform === 'android') await StatusBar.setBackgroundColor({ color: '#131f3a' });
      } catch { /* not supported on this OS version */ }
      void SplashScreen.hide().catch(() => undefined);

      const back = await App.addListener('backButton', ({ canGoBack }) => {
        const atRoot = ['/', '/login', '/sales'].includes(locationRef.current);
        if (!atRoot && (canGoBack || window.history.length > 1)) navigate(-1);
        else void App.exitApp();
      });
      cleanups.push(() => void back.remove());

      const resume = await App.addListener('appStateChange', ({ isActive }) => {
        // A 401 here is handled by the API client (it clears the session and returns to the sign-in screen).
        if (isActive && session.get('sapb1_token')) void apiClient.get('/auth/me').catch(() => undefined);
      });
      cleanups.push(() => void resume.remove());

      const status = await Network.getStatus();
      setOffline(!status.connected);
      const net = await Network.addListener('networkStatusChange', (s) => setOffline(!s.connected));
      cleanups.push(() => void net.remove());

      const onClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null;
        if (!a || !a.href) return;
        const external = /^https?:/i.test(a.href) && new URL(a.href).origin !== window.location.origin;
        if (external || a.target === '_blank') {
          e.preventDefault();
          void Browser.open({ url: a.href });
        }
      };
      document.addEventListener('click', onClick, true);
      cleanups.push(() => document.removeEventListener('click', onClick, true));

      // Keep the focused field visible when the keyboard opens.
      const onFocus = (e: FocusEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) window.setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
      };
      document.addEventListener('focusin', onFocus);
      cleanups.push(() => document.removeEventListener('focusin', onFocus));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
    };
  }, [navigate]);

  if (!isNative || !offline) return null;
  return (
    <div role="alert" className="fixed left-0 right-0 z-[120] bg-warning text-white text-xs font-medium text-center px-3 py-1.5" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      You are offline. Data will load again when the connection returns.
    </div>
  );
}
