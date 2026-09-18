import { describe, expect, it } from 'vitest';
import { ansiToHtml, escapeHtml, tailFrom } from './ansi';

const ESC = String.fromCharCode(27);
const color = (code: string, text: string): string => `${ESC}[${code}m${text}${ESC}[0m`;

describe('ansiToHtml', () => {
  it('rend chaque bout coloré dans un span, et laisse le reste en clair', () => {
    expect(ansiToHtml(`${color('33', 'tool_use')} cut {}`)).toBe('<span style="color:#FBBF24">tool_use</span> cut {}');
  });

  it('échappe le texte : les arguments d’outils contiennent des chevrons et des esperluettes', () => {
    expect(ansiToHtml('note "a<b & c>"')).toBe('note "a&lt;b &amp; c&gt;"');
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
  });

  it('ferme la couleur plutôt que d’en inventer une sur un code inconnu', () => {
    expect(ansiToHtml(`${ESC}[1mgras${ESC}[0m`)).toBe('gras');
  });

  it('laisse passer une ligne sans code ANSI', () => {
    expect(ansiToHtml('prêt : MCP http://localhost:7331/mcp')).toBe('prêt : MCP http://localhost:7331/mcp');
  });

  it('n’ouvre jamais un span sans le fermer', () => {
    const html = ansiToHtml(`${ESC}[36minit${ESC}[0m session ${ESC}[32mok`);
    expect(html.match(/<span/gu)?.length).toBe(html.match(/<\/span>/gu)?.length);
  });
});

describe('tailFrom', () => {
  const content = 'une\ndeux\ntrois\n';

  it('rend les lignes à partir du rang demandé, et le rang suivant', () => {
    expect(tailFrom(content, 0)).toEqual({ next: 3, lines: ['une', 'deux', 'trois'] });
    expect(tailFrom(content, 2)).toEqual({ next: 3, lines: ['trois'] });
    expect(tailFrom(content, 3)).toEqual({ next: 3, lines: [] });
  });

  it('ignore une dernière ligne encore en cours d’écriture', () => {
    // Le serveur écrit la ligne puis son saut de ligne : sans ça la page afficherait une moitié.
    expect(tailFrom('une\ndeu', 0)).toEqual({ next: 1, lines: ['une'] });
    expect(tailFrom('pas encore de ligne', 0)).toEqual({ next: 0, lines: [] });
    expect(tailFrom('', 0)).toEqual({ next: 0, lines: [] });
  });

  it('repart de zéro si le fichier a été vidé sous les pieds de la page', () => {
    expect(tailFrom('une\n', 9)).toEqual({ next: 1, lines: [] });
  });
});
