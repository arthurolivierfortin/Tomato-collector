import { describe, expect, it } from 'vitest';
import { VERSION } from './version';

describe('server package', () => {
  it('exposes a semver version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
