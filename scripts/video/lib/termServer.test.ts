import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrom, startTerminalServer } from './termServer';

const ESC = String.fromCharCode(27);

describe('parseFrom', () => {
  it('lit le rang demandé par la page', () => {
    expect(parseFrom('12')).toBe(12);
    expect(parseFrom('0')).toBe(0);
  });

  it('repart de zéro sur tout ce qui n’est pas un entier positif', () => {
    expect(parseFrom(null)).toBe(0);
    expect(parseFrom('-3')).toBe(0);
    expect(parseFrom('deux')).toBe(0);
    expect(parseFrom('1.5')).toBe(0);
  });
});

describe('startTerminalServer', () => {
  it('sert la page et les nouvelles lignes du fichier, en HTML coloré', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tomato-term-')), 'term.log');
    writeFileSync(path, `${ESC}[90mserver   ${ESC}[0m prêt\n${ESC}[33mtool_use ${ESC}[0m cut {}\n`, 'utf8');
    const server = await startTerminalServer(path);
    try {
      const page = await fetch(server.url).then((r) => r.text());
      expect(page).toContain('Tomato server');
      expect(page).toContain('id="out"');

      const first = await fetch(`${server.url}lines?from=0`).then((r) => r.json());
      expect(first).toEqual({
        next: 2,
        lines: ['<span style="color:#7C8798">server   </span> prêt', '<span style="color:#FBBF24">tool_use </span> cut {}'],
      });

      // La page ne redemande que la suite ; rien de nouveau, rien à ajouter.
      expect(await fetch(`${server.url}lines?from=2`).then((r) => r.json())).toEqual({ next: 2, lines: [] });
    } finally {
      await server.close();
    }
  });

  it('rend une liste vide plutôt qu’une erreur quand le serveur n’a encore rien écrit', async () => {
    const server = await startTerminalServer(join(tmpdir(), 'tomato-term-absent.log'));
    try {
      expect(await fetch(`${server.url}lines`).then((r) => r.json())).toEqual({ next: 0, lines: [] });
    } finally {
      await server.close();
    }
  });
});
