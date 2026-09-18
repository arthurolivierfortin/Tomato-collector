/** Lecture des options de ligne de commande : `--clé valeur`, `--clé=valeur`, `--drapeau`. Pur. */

export type Args = Readonly<Record<string, string | true>>;

export function parseArgs(argv: readonly string[]): Args {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (!token.startsWith('--')) throw new Error(`argument inattendu « ${token} » : les options s’écrivent --clé valeur`);
    const eq = token.indexOf('=');
    if (eq !== -1) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[token.slice(2)] = true;
    else {
      out[token.slice(2)] = next;
      i += 1;
    }
  }
  return out;
}

export function opt(args: Args, name: string, fallback: string): string {
  const v = args[name];
  return typeof v === 'string' ? v : fallback;
}

export function required(args: Args, name: string): string {
  const v = args[name];
  if (typeof v !== 'string' || v === '') throw new Error(`option --${name} manquante`);
  return v;
}

export function flag(args: Args, name: string): boolean {
  return args[name] === true || args[name] === 'true';
}

export function optNumber(args: Args, name: string, fallback: number): number {
  const v = args[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (typeof v !== 'string' || !Number.isFinite(n)) throw new Error(`option --${name} : nombre attendu`);
  return n;
}
