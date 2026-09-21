/**
 * Lecture du fichier `.jsonl` que `Tee-Object` écrit à côté de la fenêtre filmée.
 *
 * Chaque ligne est un message du flux `--output-format stream-json`, c'est-à-dire **le même objet
 * JSON** que celui que `query()` du SDK livre à `sdkQuery.ts` (vérifié sur une vraie sortie :
 * `system/init`, `assistant`, `result` ont les champs attendus par `AgentMessage`). Le serveur
 * peut donc les passer à `reduceStreamMessage` sans rien convertir, et le dashboard, le journal et
 * le coût suivent le chemin habituel.
 *
 * Deux pièges, tous deux mesurés :
 *
 * 1. **L'encodage.** `Tee-Object -FilePath` de Windows PowerShell 5.1 écrit en UTF-16LE avec
 *    nomenclature (`ff fe 7b 00 …`). Lu en UTF-8, chaque ligne est illisible.
 * 2. **Les lignes coupées.** Le fichier est lu pendant qu'il s'écrit : une lecture tombe souvent
 *    au milieu d'une ligne, et en UTF-16 au milieu d'un caractère. Le reste est gardé pour la
 *    lecture suivante.
 */
import { StringDecoder } from 'node:string_decoder';
import type { AgentMessage } from './types';

/** Nomenclature UTF-16LE : `Tee-Object` la pose en tête de fichier. */
function isUtf16(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
}

/**
 * Texte d'un morceau de fichier, quel que soit l'encodage écrit par le shell. La nomenclature,
 * UTF-16 comme UTF-8, est retirée : `JSON.parse` refuse une chaîne qui commence par U+FEFF.
 */
export function decodeTeeChunk(buffer: Buffer): string {
  return stripBom(isUtf16(buffer) ? buffer.subarray(2).toString('utf16le') : buffer.toString('utf8'));
}

/** `JSON.parse` refuse une chaine qui commence par U+FEFF. */
function stripBom(text: string): string {
  return text.startsWith('﻿') ? text.slice(1) : text;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Les types de message que `reduceStreamMessage` sait lire ; tout le reste devient `other`. */
const KNOWN = new Set(['system', 'assistant', 'user', 'stream_event', 'result']);

/**
 * Une ligne du flux, en message d'agent. Une ligne vide ou illisible rend `null` : un épisode ne
 * doit pas tomber parce que le CLI a écrit quelque chose d'inattendu. Un type inconnu — le CLI
 * émet par exemple `rate_limit_event`, que le SDK ne livre pas — devient `other`, que le réducteur
 * ignore déjà.
 */
export function parseAgentLine(line: string): AgentMessage | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed['type'] !== 'string') return null;
  return KNOWN.has(parsed['type']) ? (parsed as unknown as AgentMessage) : { type: 'other' };
}

export interface TeeReader {
  /** Messages complets contenus dans ce morceau ; le reste attend la lecture suivante. */
  push(buffer: Buffer): AgentMessage[];
  /** Dernière ligne, quand le fichier se termine sans saut de ligne. */
  flush(): AgentMessage[];
}

export function createTeeReader(): TeeReader {
  let pending = '';
  const take = (text: string): AgentMessage[] => {
    pending += text;
    const lines = pending.split(/\r?\n/);
    // Le dernier morceau n'est complet que s'il était suivi d'un saut de ligne : on le garde.
    pending = lines.pop() ?? '';
    return lines.map(parseAgentLine).filter((m): m is AgentMessage => m !== null);
  };
  // L'encodage se décide sur les deux premiers octets du fichier et vaut pour toute la suite :
  // seule la première lecture porte la nomenclature. Le `StringDecoder` garde les octets d'un
  // caractère coupé en deux — en UTF-16, une lecture sur deux tombe au milieu d'un caractère.
  let decoder: StringDecoder | null = null;
  let head: Buffer = Buffer.alloc(0);
  return {
    push(buffer) {
      if (decoder === null) {
        head = head.length === 0 ? buffer : Buffer.concat([head, buffer]);
        if (head.length < 2) return [];
        const utf16 = isUtf16(head);
        decoder = new StringDecoder(utf16 ? 'utf16le' : 'utf8');
        const body = utf16 ? head.subarray(2) : head;
        head = Buffer.alloc(0);
        return take(stripBom(decoder.write(body)));
      }
      return take(stripBom(decoder.write(buffer)));
    },
    flush() {
      const last = pending;
      pending = '';
      const msg = parseAgentLine(last);
      return msg === null ? [] : [msg];
    },
  };
}
