/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Website: "/api" (proxied). Installed app: the absolute HTTPS address of the Aquila API. Not a secret. */
  readonly VITE_API_BASE_URL: string;
  /** "true" only for an internal test build that points at a temporary tunnel. */
  readonly VITE_ALLOW_TEMP_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
