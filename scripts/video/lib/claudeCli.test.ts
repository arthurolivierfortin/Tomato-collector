import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_NAME, mcpConfigJson, systemPromptFor, toolPattern } from './claudeCli';

describe('toolPattern', () => {
  it('nomme les outils du serveur MCP tel que Claude Code les préfixe', () => {
    expect(toolPattern('tomato-robot')).toBe('mcp__tomato-robot__*');
    expect(toolPattern('robot')).toBe('mcp__robot__*');
  });

  it('prend « tomato-robot » par défaut, le nom du README racine', () => {
    expect(DEFAULT_MCP_NAME).toBe('tomato-robot');
  });
});

describe('mcpConfigJson', () => {
  it('décrit le serveur en HTTP sur l’URL de la session', () => {
    const parsed: unknown = JSON.parse(mcpConfigJson('tomato-robot', 'http://localhost:7511/mcp'));
    expect(parsed).toEqual({ mcpServers: { 'tomato-robot': { type: 'http', url: 'http://localhost:7511/mcp' } } });
  });

  it('porte le nom demandé, pas un nom en dur', () => {
    const parsed = JSON.parse(mcpConfigJson('robot', 'http://localhost:7331/mcp')) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toEqual(['robot']);
  });
});

describe('systemPromptFor', () => {
  // Le prompt système du serveur cite le serveur MCP par son nom (« the nine tools of the `robot`
  // MCP server »). Le SDK l'appelle `robot`, le CLI l'appelle `tomato-robot` : sans cette
  // substitution, l'agent lirait un nom de serveur qui n'existe pas dans sa session.
  it('remplace le nom du serveur MCP cité par le prompt', () => {
    const prompt = 'Your only way to act is the nine tools of the `robot` MCP server. Everything else is off.';
    expect(systemPromptFor('tomato-robot', prompt)).toBe(
      'Your only way to act is the nine tools of the `tomato-robot` MCP server. Everything else is off.',
    );
  });

  it('laisse le prompt intact quand le nom est déjà le bon', () => {
    const prompt = 'the nine tools of the `robot` MCP server';
    expect(systemPromptFor('robot', prompt)).toBe(prompt);
  });

  it('ne touche pas au mot « robot » employé hors du nom du serveur', () => {
    const prompt = 'You are the control agent of a small harvesting robot. Use the `robot` MCP server.';
    expect(systemPromptFor('tomato-robot', prompt)).toBe(
      'You are the control agent of a small harvesting robot. Use the `tomato-robot` MCP server.',
    );
  });
});
