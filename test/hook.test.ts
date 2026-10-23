import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runHookCommand,
  parseHookOptions,
  hookActionName,
  HOOK_BEGIN,
  HOOK_END,
  DEFAULT_HOOK_COMMAND,
} from '../src/commands/hook.ts';
import { runCommand } from '../src/util/exec.ts';

async function gitRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-hook-'));
  const init = await runCommand('git init -q', { cwd: dir });
  assert.equal(init.code, 0, init.stderr);
  return dir;
}

async function readHook(dir: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8');
  } catch {
    return undefined;
  }
}

test('reads install / uninstall from the command line', () => {
  assert.equal(parseHookOptions({ positionals: ['agents', 'hook'], flags: {} }).uninstall, false);
  assert.equal(parseHookOptions({ positionals: ['agents', 'hook', 'install'], flags: {} }).uninstall, false);
  assert.equal(parseHookOptions({ positionals: ['agents', 'hook', 'uninstall'], flags: {} }).uninstall, true);
  assert.equal(parseHookOptions({ positionals: ['agents', 'hook'], flags: { uninstall: true } }).uninstall, true);
  assert.equal(
    parseHookOptions({ positionals: ['agents', 'hook', 'install'], flags: { command: 'node src/cli.ts' } }).command,
    'node src/cli.ts',
  );
  assert.equal(hookActionName('frobnicate'), undefined);
});

test('installs a pre-commit hook that refreshes AGENTS.md', async () => {
  const dir = await gitRepo();
  assert.equal(await runHookCommand({ uninstall: false, force: false, root: dir }), 0);

  const hook = (await readHook(dir)) ?? '';
  assert.ok(hook.startsWith('#!/bin/sh'));
  assert.ok(hook.includes(HOOK_BEGIN));
  assert.ok(hook.includes(HOOK_END));
  assert.ok(hook.includes(`${DEFAULT_HOOK_COMMAND} agents check --fix`));

  if (process.platform !== 'win32') {
    const stat = await fs.stat(path.join(dir, '.git', 'hooks', 'pre-commit'));
    assert.ok((stat.mode & 0o111) !== 0, 'the hook must be executable');
  }
});

test('a second install leaves exactly one block', async () => {
  const dir = await gitRepo();
  await runHookCommand({ uninstall: false, force: false, root: dir });
  const first = await readHook(dir);

  assert.equal(await runHookCommand({ uninstall: false, force: false, root: dir }), 0);
  const second = await readHook(dir);

  assert.equal(second, first);
  assert.equal(second?.split(HOOK_BEGIN).length, 2);
});

test('keeps an existing hook and runs ours after it', async () => {
  const dir = await gitRepo();
  const target = path.join(dir, '.git', 'hooks', 'pre-commit');
  await fs.writeFile(target, '#!/bin/sh\n\nnpm run lint\n', 'utf8');

  assert.equal(await runHookCommand({ uninstall: false, force: false, root: dir }), 0);
  const hook = (await readHook(dir)) ?? '';

  assert.ok(hook.includes('npm run lint'), 'the project hook must survive');
  assert.ok(hook.includes(HOOK_BEGIN));
  assert.ok(hook.indexOf('npm run lint') < hook.indexOf(HOOK_BEGIN), 'ours runs after theirs');
});

test('--command is written into the hook', async () => {
  const dir = await gitRepo();
  await runHookCommand({ uninstall: false, force: false, root: dir, command: 'node /repo/src/cli.ts' });

  const hook = (await readHook(dir)) ?? '';
  assert.ok(hook.includes('node /repo/src/cli.ts agents check --fix'));
});

test('uninstall removes only the devtools-agents block', async () => {
  const dir = await gitRepo();
  const target = path.join(dir, '.git', 'hooks', 'pre-commit');
  await fs.writeFile(target, '#!/bin/sh\n\nnpm run lint\n', 'utf8');
  await runHookCommand({ uninstall: false, force: false, root: dir });

  assert.equal(await runHookCommand({ uninstall: true, force: false, root: dir }), 0);
  const hook = (await readHook(dir)) ?? '';

  assert.ok(hook.includes('npm run lint'));
  assert.ok(!hook.includes(HOOK_BEGIN));
  assert.ok(!hook.includes(HOOK_END));
});

test('uninstall deletes a hook that only held the generated block', async () => {
  const dir = await gitRepo();
  await runHookCommand({ uninstall: false, force: false, root: dir });

  assert.equal(await runHookCommand({ uninstall: true, force: false, root: dir }), 0);
  assert.equal(await readHook(dir), undefined);
});

test('refuses to install outside a git repository', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-nogit-'));
  // A directory that is not inside a repository cannot receive a hook.
  const code = await runHookCommand({ uninstall: false, force: false, root: dir });
  const insideRepo = (await runCommand('git rev-parse --show-toplevel', { cwd: dir })).code === 0;
  if (insideRepo) {
    // The temp directory itself lives inside a checkout; nothing to assert then.
    assert.equal(code, 0);
    return;
  }
  assert.equal(code, 1);
});

test('follows core.hooksPath', async () => {
  const dir = await gitRepo();
  await runCommand('git config core.hooksPath .githooks', { cwd: dir });

  assert.equal(await runHookCommand({ uninstall: false, force: false, root: dir }), 0);
  const hook = await fs.readFile(path.join(dir, '.githooks', 'pre-commit'), 'utf8');
  assert.ok(hook.includes(HOOK_BEGIN));
  assert.equal(await readHook(dir), undefined);
});
