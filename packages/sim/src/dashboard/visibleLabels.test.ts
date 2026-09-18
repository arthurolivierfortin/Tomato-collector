import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Les libellés de l'application sont **filmés**. La vidéo de démo grave ses propres textes en
 * anglais et sans tiret cadratin (`scripts/video/plans/demo.test.ts` le vérifie), mais le dashboard,
 * lui, est à l'image tel quel : un « — » dans un titre de panneau ou une pastille se retrouve dans
 * le film, et s'y lit mal.
 *
 * Trois fois de suite, la relecture d'une prise a trouvé un tiret que personne n'avait vu dans le
 * code : le titre du mode « Pipeline de traitement », l'en-tête du panneau « Perception », puis la
 * pastille du détecteur. Ce test remplace la relecture d'image : il lit les sources des écrans
 * filmés, retire les commentaires, et refuse tout cadratin ou demi-cadratin dans ce qui reste.
 */
const ROOTS = ['dashboard', 'perception', 'cameras'];
const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** Le code sans ses commentaires : un tiret dans une explication n'est pas à l'image. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n');
}

describe('libellés visibles du dashboard', () => {
  it('n’emploie ni tiret cadratin ni demi-cadratin : ces écrans sont filmés', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sources(join(SRC, root))) {
        for (const [i, line] of code(readFileSync(file, 'utf8')).split('\n').entries()) {
          if (/[–—]/u.test(line)) offenders.push(`${root}/${file.split(/[\\/]/).pop() ?? ''}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lit bien des fichiers : un test qui ne trouve rien ne prouve rien', () => {
    expect(sources(join(SRC, 'dashboard')).length).toBeGreaterThan(10);
    expect(code('/* — */\n// —\nconst a = 1;')).not.toMatch(/[–—]/u);
    expect(code('const a = "—";')).toMatch(/—/u);
  });
});
