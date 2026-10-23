import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readTextIfExists } from '../util/fsx.ts';
import { runCommand } from '../util/exec.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface HookOptions {
  root?: string;
  uninstall: boolean;
  force: boolean;
  /** Command that runs the CLI. Defaults to the locally installed package. */
  command?: string;
}

export type HookActionName = 'install' | 'uninstall';

/** Action written after `agents hook`; `undefined` means install. */
export function hookActionName(value: string | undefined): HookActionName | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'install' || normalized === 'uninstall') return normalized;
  return undefined;
}

export function parseHookOptions(args: ParsedArgs): HookOptions {
  const action = hookActionName(args.positionals[2]);
  return {
    root: flagString(args.flags, 'root'),
    // `agents hook uninstall` is the documented form; the flag is kept because
    // `--uninstall` reads naturally next to `--force`.
    uninstall: action === 'uninstall' || flagBoolean(args.flags, 'uninstall', false),
    force: flagBoolean(args.flags, 'force', false),
    command: flagString(args.flags, 'command'),
  };
}

export const HOOK_BEGIN = '# devtools-agents:begin';
export const HOOK_END = '# devtools-agents:end';
export const DEFAULT_HOOK_COMMAND = 'npx --no-install devtools-agents';

export type HookAction = 'installed' | 'updated' | 'unchanged' | 'removed' | 'absent';

export interface HookResult {
  path: string;
  action: HookAction;
}

/**
 * The pre-commit block.
 *
 * It is plain POSIX shell because Git runs hooks with `sh` on every platform,
 * including Windows. `--fix` writes the document through the same code path as
 * `init`, so hand written text outside the managed block is kept, and the file
 * is re-staged only when Git already tracks it - a hook should never decide to
 * add a brand new file to someone's commit.
 */
export function renderHookBlock(command: string): string {
  return [
    `${HOOK_BEGIN} - installed by \`devtools agents hook install\``,
    '# Refreshes AGENTS.md before a commit. Skip once with `git commit --no-verify`.',
    `${command} agents check --fix`,
    'status=$?',
    'if [ "$status" -ne 0 ]; then',
    '  echo "devtools-agents: AGENTS.md is out of date and could not be refreshed" >&2',
    '  exit "$status"',
    'fi',
    'if git ls-files --error-unmatch -- AGENTS.md >/dev/null 2>&1; then',
    '  git add -- AGENTS.md',
    'fi',
    HOOK_END,
  ].join('\n');
}

function blockRange(content: string): { start: number; end: number } | undefined {
  const start = content.indexOf(HOOK_BEGIN);
  const end = content.indexOf(HOOK_END, start === -1 ? 0 : start);
  if (start === -1 || end === -1) return undefined;
  return { start, end };
}

/** Replaces our block, appends it, or drops the whole file when only it was left. */
export function mergeHook(existing: string | undefined, block: string): { content: string; action: HookAction } {
  if (existing === undefined) {
    return { content: `#!/bin/sh\n\n${block}\n`, action: 'installed' };
  }

  const range = blockRange(existing);
  if (range) {
    const next = `${existing.slice(0, range.start)}${block}${existing.slice(range.end + HOOK_END.length)}`;
    return { content: next, action: next === existing ? 'unchanged' : 'updated' };
  }

  // Somebody else's hook: keep it and run ours after it.
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${existing}${separator}${block}\n`, action: 'updated' };
}

/** Removes our block, deleting the file when nothing else was in it. */
export function stripHook(existing: string): { content: string | undefined; action: HookAction } {
  const range = blockRange(existing);
  if (!range) return { content: existing, action: 'unchanged' };

  const next = `${existing.slice(0, range.start)}${existing.slice(range.end + HOOK_END.length)}`;
  const meaningful = next
    .split('\n')
    .filter((line) => line.trim() !== '' && line.trim() !== '#!/bin/sh');
  return { content: meaningful.length === 0 ? undefined : next, action: 'removed' };
}

async function resolveRepoRoot(start: string): Promise<string | undefined> {
  const result = await runCommand('git rev-parse --show-toplevel', { cwd: start, timeoutMs: 10_000 });
  if (result.code !== 0) return undefined;
  const root = result.stdout.trim();
  return root === '' ? undefined : path.resolve(root);
}

/** Asks Git for the hooks directory so `core.hooksPath` and worktrees are respected. */
async function resolveHooksDir(root: string): Promise<string> {
  const result = await runCommand('git rev-parse --git-path hooks', { cwd: root, timeoutMs: 10_000 });
  const raw = result.code === 0 ? result.stdout.trim() : '';
  return path.resolve(root, raw === '' ? path.join('.git', 'hooks') : raw);
}

export async function runHookCommand(options: HookOptions): Promise<number> {
  const start = options.root ? path.resolve(options.root) : process.cwd();
  const repoRoot = await resolveRepoRoot(start);

  if (repoRoot === undefined) {
    console.log('✗ not a git repository - a pre-commit hook needs one');
    return 1;
  }
  const root = repoRoot;

  const hooksDir = await resolveHooksDir(root);
  const target = path.join(hooksDir, 'pre-commit');
  const existing = await readTextIfExists(target);
  const relative = path.relative(process.cwd(), target) || target;

  if (options.uninstall) {
    if (existing === undefined) {
      console.log(`· ${relative} does not exist, nothing to uninstall`);
      return 0;
    }
    const stripped = stripHook(existing);
    if (stripped.action === 'unchanged') {
      console.log(`· ${relative} has no devtools-agents block`);
      return 0;
    }
    if (stripped.content === undefined) {
      await fs.rm(target, { force: true });
      console.log(`✓ ${relative} removed (it only contained the devtools-agents block)`);
      return 0;
    }
    await fs.writeFile(target, stripped.content, 'utf8');
    console.log(`✓ ${relative} updated (the devtools-agents block was removed)`);
    return 0;
  }

  const command = options.command ?? DEFAULT_HOOK_COMMAND;
  const block = renderHookBlock(command);
  const merged: { content: string; action: HookAction } = options.force
    ? { content: `#!/bin/sh\n\n${block}\n`, action: existing === undefined ? 'installed' : 'updated' }
    : mergeHook(existing, block);

  if (merged.content !== existing) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, merged.content, 'utf8');
    // Git ignores a hook it cannot execute.
    await fs.chmod(target, 0o755);
  }

  const verb = merged.content === existing ? 'unchanged' : merged.action;
  console.log(`✓ ${relative} ${verb}`);
  console.log(`  runs: ${command} agents check --fix`);
  return 0;
}
