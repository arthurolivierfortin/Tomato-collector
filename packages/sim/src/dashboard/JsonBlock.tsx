import { jsonTokens, type JsonTokenKind } from './traceJson';

/** Couleurs discrètes : la structure reste grise, seules les valeurs se distinguent. */
const TOKEN_CLASS: Record<JsonTokenKind, string> = {
  key: 'text-stem',
  string: 'text-ink',
  number: 'text-basket',
  atom: 'text-turning',
  plain: 'text-ink-dim',
};

interface Props {
  json: string;
  label: string;
  testId: string;
}

/** Bloc JSON monospace, indenté à 2 espaces, coloré sobrement, avec un libellé (« arguments », « résultat »). */
export function JsonBlock({ json, label, testId }: Props) {
  return (
    <div className="mt-1">
      <span className="text-[10px] uppercase tracking-widest text-ink-dim">{label}</span>
      <pre
        data-testid={testId}
        className="mt-0.5 max-h-72 overflow-auto rounded-sm border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] leading-[1.35] whitespace-pre-wrap break-words"
      >
        {jsonTokens(json).map((t, i) => (
          <span key={i} className={TOKEN_CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
