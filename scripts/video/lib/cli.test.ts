import { describe, expect, it } from 'vitest';
import { flag, opt, optNumber, parseArgs, required } from './cli';

describe('parseArgs', () => {
  it('lit --clé valeur et --clé=valeur', () => {
    expect(parseArgs(['--page', 'http://localhost:5313', '--take=concepts'])).toEqual({
      page: 'http://localhost:5313',
      take: 'concepts',
    });
  });

  it('traite une option sans valeur comme un drapeau', () => {
    expect(parseArgs(['--dry-run', '--take', 'x'])).toEqual({ 'dry-run': true, take: 'x' });
    expect(parseArgs(['--keep'])).toEqual({ keep: true });
  });

  it('refuse un argument qui ne commence pas par --', () => {
    expect(() => parseArgs(['concepts'])).toThrow(/concepts/);
  });
});

describe('opt / required / flag / optNumber', () => {
  const args = parseArgs(['--take', 'concepts', '--speed', '0.4', '--keep']);

  it('rend la valeur, ou le repli', () => {
    expect(opt(args, 'take', 'x')).toBe('concepts');
    expect(opt(args, 'page', 'http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('exige une valeur nommée quand elle est obligatoire', () => {
    expect(required(args, 'take')).toBe('concepts');
    expect(() => required(args, 'plan')).toThrow(/--plan/);
  });

  it('lit un drapeau et un nombre', () => {
    expect(flag(args, 'keep')).toBe(true);
    expect(flag(args, 'dry-run')).toBe(false);
    expect(optNumber(args, 'speed', 1)).toBe(0.4);
    expect(optNumber(args, 'absent', 1)).toBe(1);
    expect(() => optNumber(parseArgs(['--speed', 'vite']), 'speed', 1)).toThrow(/--speed/);
  });

  it('refuse un drapeau là où une valeur est attendue', () => {
    expect(() => required(parseArgs(['--take']), 'take')).toThrow(/--take/);
  });
});
