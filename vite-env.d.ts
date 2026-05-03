/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Globais injetados em build-time pelo vite.config.ts (define) — preenchidos
// a partir do package.json e do git via scripts/genVersion.mjs.
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
declare const __APP_RELEASE__: string;
declare const __APP_BUILT_AT__: string;
