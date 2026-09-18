import { readFileSync } from 'node:fs';

/** Chemin du prompt système, relatif à ce module : `packages/server/prompts/system.md`. */
export const SYSTEM_PROMPT_URL = new URL('../../prompts/system.md', import.meta.url);

/** Lit le prompt système complet (texte brut, sans substitution). */
export function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_URL, 'utf8');
}
