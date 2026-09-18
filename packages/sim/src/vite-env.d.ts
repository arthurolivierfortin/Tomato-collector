/// <reference types="vite/client" />

/** Réglages de démo : ports du serveur M5 quand il ne tourne pas sur ses ports par défaut. */
interface ImportMetaEnv {
  /** Hub WebSocket du serveur (défaut `ws://localhost:7332`). */
  readonly VITE_TOMATO_WS_URL?: string;
  /** HTTP annexe du serveur : /health, /episodes (défaut `http://localhost:7331`). */
  readonly VITE_TOMATO_API_URL?: string;
}
