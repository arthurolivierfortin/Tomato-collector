import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogSink } from './logSink';

const dir = (): string => mkdtempSync(join(tmpdir(), 'tomato-sink-'));

describe('createLogSink', () => {
  it('appends one line per write, keeping the ANSI colours', () => {
    const path = join(dir(), 'term.log');
    const sink = createLogSink(path);
    sink.write('[33mtool_use[0m cut {}');
    sink.write('[32mtool_result[0m ok');
    expect(readFileSync(path, 'utf8')).toBe('[33mtool_use[0m cut {}\n[32mtool_result[0m ok\n');
  });

  it('truncates the file at startup: a take films one session, not the whole machine history', () => {
    const path = join(dir(), 'term.log');
    createLogSink(path).write('vieille ligne');
    createLogSink(path).write('nouvelle ligne');
    expect(readFileSync(path, 'utf8')).toBe('nouvelle ligne\n');
  });

  it('writes nothing, and never throws, when no file is asked for', () => {
    expect(() => createLogSink('').write('x')).not.toThrow();
  });

  it('falls back to a silent sink rather than bringing the server down', () => {
    // Un chemin qui ne peut pas être créé : le serveur doit continuer sans terminal filmé.
    expect(() => createLogSink(join(dir(), 'term.log', 'impossible.log')).write('x')).not.toThrow();
  });
});
