import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildQueryOptions } from './packages/server/src/agent/queryOptions';
import { createVisibleQuery } from './packages/server/src/agent/visibleQuery';
import { createWindowLauncher } from './packages/server/src/agent/windowLauncher';

const dir = await mkdtemp(join(tmpdir(), 'tomato-integ-'));
console.log('workDir', dir);
const query = createVisibleQuery({
  workDir: dir,
  title: 'Claude Code headless',
  geometry: { cols: 110, rows: 32, x: 20, y: 20 },
  launcher: createWindowLauncher((l) => console.log('[launcher]', l)),
  log: (l) => console.log('[visible]', l),
});
const options = buildQueryOptions({
  mcpUrl: 'http://localhost:7541/mcp',
  model: 'opus',
  systemPrompt: 'You are a test probe for a video pipeline. Answer in one word. Do not call any tool.',
  sessionId: null,
  abortController: new AbortController(),
});
for await (const msg of query('Reply with the single word OK', options)) {
  const m = msg as Record<string, unknown>;
  console.log('MSG', m['type'], m['subtype'] ?? '', JSON.stringify(m).slice(0, 160));
}
console.log('FIN');
