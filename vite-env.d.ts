/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_DEPARTAMENTO_GATE_MODO?: string;
    /** Serviços externos (services/plataforma/servicos.ts); vazios = CFI. */
    readonly VITE_PLATAFORMA_URL?: string;
    readonly VITE_SERVICO_CADASTRO_URL?: string;
    readonly VITE_SERVICO_COFRE_URL?: string;
    readonly VITE_SERVICO_GOVERNO_URL?: string;
    readonly VITE_SERVICO_EMAIL_URL?: string;
    readonly VITE_SERVICO_WHATSAPP_URL?: string;
    readonly VITE_SERVICO_IA_URL?: string;
    readonly VITE_PAINEL_MENSAGENS_URL?: string;
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
