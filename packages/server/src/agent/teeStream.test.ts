import { describe, expect, it } from 'vitest';
import { createTeeReader, decodeTeeChunk, parseAgentLine } from './teeStream';

const INIT =
  '{"type":"system","subtype":"init","session_id":"s1","model":"claude-opus-5","mcp_servers":[{"name":"robot","status":"connected"}],"apiKeySource":"none"}';
const RESULT =
  '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.42,"duration_ms":91000,"num_turns":17,"session_id":"s1"}';

describe('decodeTeeChunk', () => {
  // Mesuré sur cette machine : `Tee-Object -FilePath` de Windows PowerShell 5.1 écrit en
  // UTF-16LE avec nomenclature (« ff fe 7b 00 … »). Lu en UTF-8, chaque ligne devient illisible.
  it('lit l’UTF-16LE que Tee-Object écrit sous Windows PowerShell 5.1', () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${INIT}\r\n`, 'utf16le')]);
    expect(decodeTeeChunk(utf16)).toBe(`${INIT}\r\n`);
  });

  it('lit aussi de l’UTF-8, au cas où le shell change', () => {
    expect(decodeTeeChunk(Buffer.from(`${INIT}\n`, 'utf8'))).toBe(`${INIT}\n`);
  });

  it('retire la nomenclature UTF-8 : JSON.parse la refuse', () => {
    expect(decodeTeeChunk(Buffer.from(`\uFEFF${INIT}\n`, 'utf8'))).toBe(`${INIT}\n`);
  });
});

describe('parseAgentLine', () => {
  it('reconnaît le message init du CLI, identique à celui du SDK', () => {
    const msg = parseAgentLine(INIT);
    expect(msg).toMatchObject({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5' });
  });

  it('reconnaît le message result, celui qui porte le coût', () => {
    expect(parseAgentLine(RESULT)).toMatchObject({ type: 'result', total_cost_usd: 0.42, num_turns: 17 });
  });

  it('range ce qu’il ne connaît pas en « other » : le CLI émet des messages que le SDK n’a pas', () => {
    expect(parseAgentLine('{"type":"rate_limit_event","rate_limit_info":{}}')).toEqual({ type: 'other' });
  });

  it('ignore une ligne vide ou illisible plutôt que de casser l’épisode', () => {
    expect(parseAgentLine('')).toBeNull();
    expect(parseAgentLine('{ pas du json')).toBeNull();
  });
});

describe('createTeeReader', () => {
  it('rend les messages ligne à ligne', () => {
    const reader = createTeeReader();
    expect(reader.push(Buffer.from(`${INIT}\n${RESULT}\n`, 'utf8'))).toHaveLength(2);
  });

  // `Tee-Object` vide son tampon quand il veut : une lecture peut couper une ligne en plein milieu.
  it('garde une ligne coupée en deux et la rend une fois complète', () => {
    const reader = createTeeReader();
    const half = Math.floor(INIT.length / 2);
    expect(reader.push(Buffer.from(INIT.slice(0, half), 'utf8'))).toEqual([]);
    expect(reader.push(Buffer.from(`${INIT.slice(half)}\n`, 'utf8'))).toMatchObject([{ type: 'system' }]);
  });

  it('ne rend une ligne qu’une fois, même relue morceau par morceau', () => {
    const reader = createTeeReader();
    reader.push(Buffer.from(`${INIT}\r\n`, 'utf8'));
    expect(reader.push(Buffer.from(`${RESULT}\r\n`, 'utf8'))).toMatchObject([{ type: 'result' }]);
  });

  it('coupe une ligne UTF-16 tombée sur un demi-caractère sans perdre la suite', () => {
    const reader = createTeeReader();
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${INIT}\r\n`, 'utf16le')]);
    expect(reader.push(buf.subarray(0, 41))).toEqual([]);
    expect(reader.push(buf.subarray(41))).toMatchObject([{ type: 'system' }]);
  });

  it('rend la dernière ligne sans saut de ligne quand on ferme le flux', () => {
    const reader = createTeeReader();
    reader.push(Buffer.from(RESULT, 'utf8'));
    expect(reader.flush()).toMatchObject([{ type: 'result' }]);
    expect(reader.flush()).toEqual([]);
  });
});

describe('parseAgentLine, messages « system » qui ne sont pas un init', () => {
  // Relevé sur une vraie sortie : le CLI émet `system/hook_started`, `hook_progress` et
  // `hook_response` au démarrage (crochets SessionStart du poste). Ils n'ont ni `mcp_servers` ni
  // `session_id`, et `reduceStreamMessage` tombait dessus en lisant `msg.mcp_servers.find`.
  it('range les messages de crochets en « other » plutôt qu’en init', () => {
    const hook = '{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup","uuid":"a"}';
    expect(parseAgentLine(hook)).toEqual({ type: 'other' });
  });

  it('garde l’init, le seul message système que le réducteur sait lire', () => {
    expect(parseAgentLine(INIT)).toMatchObject({ type: 'system', subtype: 'init' });
  });

  it('refuse un init sans liste de serveurs MCP : le réducteur la parcourt', () => {
    expect(parseAgentLine('{"type":"system","subtype":"init","session_id":"s","model":"m"}')).toEqual({ type: 'other' });
  });
});
