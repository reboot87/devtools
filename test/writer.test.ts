import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAgentsMd, writeMirrors } from '../src/render/write.ts';
import { BEGIN_MARKER, END_MARKER } from '../src/render/agents-md.ts';

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'devtools-agents-'));
}

test('creates the file with a managed block and a free form notes section', async () => {
  const dir = await tempDir();
  const target = path.join(dir, 'AGENTS.md');
  const result = await writeAgentsMd(target, '# Title\n\nbody', { lang: 'en' });

  assert.equal(result.action, 'created');
  const content = await fs.readFile(target, 'utf8');
  assert.ok(content.includes(BEGIN_MARKER));
  assert.ok(content.includes(END_MARKER));
  assert.ok(content.includes('body'));
  assert.ok(content.includes('Project-specific notes'));
});

test('preserves content outside the managed block on regeneration', async () => {
  const dir = await tempDir();
  const target = path.join(dir, 'AGENTS.md');
  await fs.writeFile(target, '# My project rules\n\nAlways be nice.\n', 'utf8');

  const first = await writeAgentsMd(target, 'generated v1', { lang: 'en' });
  assert.equal(first.action, 'merged');

  const second = await writeAgentsMd(target, 'generated v2', { lang: 'en' });
  assert.equal(second.action, 'updated');

  const content = await fs.readFile(target, 'utf8');
  assert.ok(content.includes('Always be nice.'));
  assert.ok(content.includes('generated v2'));
  assert.ok(!content.includes('generated v1'));
});

test('is idempotent when nothing changed', async () => {
  const dir = await tempDir();
  const target = path.join(dir, 'AGENTS.md');
  await writeAgentsMd(target, 'same body', { lang: 'en' });
  const result = await writeAgentsMd(target, 'same body', { lang: 'en' });
  assert.equal(result.action, 'unchanged');
});

test('force mode replaces the whole file', async () => {
  const dir = await tempDir();
  const target = path.join(dir, 'AGENTS.md');
  await fs.writeFile(target, 'human text', 'utf8');
  const result = await writeAgentsMd(target, 'body', { lang: 'en', force: true });
  assert.equal(result.action, 'updated');
  const content = await fs.readFile(target, 'utf8');
  assert.ok(!content.includes('human text'));
});

test('mirrors write pointer files for claude and gemini', async () => {
  const dir = await tempDir();
  const results = await writeMirrors(dir, 'body', ['claude', 'gemini'], 'en');
  assert.equal(results.length, 2);
  const claude = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(claude.includes('@AGENTS.md'));
  const gemini = await fs.readFile(path.join(dir, 'GEMINI.md'), 'utf8');
  assert.ok(gemini.includes('@AGENTS.md'));
});

test('copilot mirror copies the full content', async () => {
  const dir = await tempDir();
  await writeMirrors(dir, 'the real body', ['copilot'], 'en');
  const content = await fs.readFile(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
  assert.ok(content.includes('the real body'));
});
