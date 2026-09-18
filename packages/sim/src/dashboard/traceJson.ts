import { VIEW_SIZE_PX } from '@tomato/shared';

/** Remplaçant des images dans la trace : jamais de base64 (une vue pèse 250 ko). */
export const IMAGE_PLACEHOLDER = `<image ${VIEW_SIZE_PX}×${VIEW_SIZE_PX}>`;

/** Indentation JSON de la trace (spec issue #22 : 2 espaces, monospace). */
export const JSON_INDENT = 2;

/** Au-delà, une chaîne sans espace faite de caractères base64 est une image, pas un texte de l'agent. */
const BASE64_MIN_LENGTH = 120;
const BASE64_RE = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

const isImageString = (v: string): boolean => v.length >= BASE64_MIN_LENGTH && BASE64_RE.test(v);

/** Clés d'un `ViewsPayload` que la trace ne montre pas (poses de caméra et limites, déjà dans l'image). */
const VIEWS_SUMMARY_KEYS = ['simTimeS', 'phase', 'targetTomatoId', 'tomatoes', 'scissors', 'basket'] as const;
const VIEWS_PAYLOAD_KEYS = ['simTimeS', 'phase', 'tomatoes', 'scissors', 'basket', 'cameras', 'limits'] as const;
/** `visibleIn` est un détail de perception : la trace garde l'identité et la pose de chaque tomate. */
const TOMATO_DROPPED_KEYS = ['visibleIn', 'radiusCm', 'attached'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isViewsPayload(v: Record<string, unknown>): boolean {
  return VIEWS_PAYLOAD_KEYS.every((k) => k in v);
}

function summarizeTomato(t: unknown): unknown {
  if (!isRecord(t)) return t;
  return Object.fromEntries(Object.entries(t).filter(([k]) => !TOMATO_DROPPED_KEYS.includes(k)));
}

function summarizeViews(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of VIEWS_SUMMARY_KEYS) {
    if (!(k in v)) continue;
    out[k] = k === 'tomatoes' && Array.isArray(v[k]) ? (v[k] as unknown[]).map(summarizeTomato) : v[k];
  }
  return out;
}

/**
 * Prépare une valeur pour la trace : base64 remplacés par `<image 800×800>`, `ViewsPayload` réduit aux
 * tomates et à la pose des outils, nombres arrondis à deux décimales. Pure, sans effet de bord.
 */
export function maskAndSummarize(value: unknown): unknown {
  if (typeof value === 'string') return isImageString(value) ? IMAGE_PLACEHOLDER : value;
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  if (Array.isArray(value)) return value.map(maskAndSummarize);
  if (!isRecord(value)) return value;
  const source = isViewsPayload(value) ? summarizeViews(value) : value;
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, k === 'pngBase64' ? IMAGE_PLACEHOLDER : maskAndSummarize(v)]));
}

/** Arguments d'un appel d'outil, en JSON indenté. */
export function formatToolArgs(args: Record<string, unknown>): string {
  return JSON.stringify(maskAndSummarize(args), null, JSON_INDENT);
}

/** Résultat d'un appel d'outil, en JSON indenté, sans image ; chaîne vide si le serveur n'en a pas envoyé. */
export function formatToolResult(result: unknown): string {
  if (result === undefined) return '';
  return JSON.stringify(maskAndSummarize(result), null, JSON_INDENT);
}
