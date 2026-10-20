import path from 'node:path';
import { listDir, readTextIfExists } from '../util/fsx.ts';
import { runCommand } from '../util/exec.ts';
import type { GitInfo } from '../core/types.ts';

async function git(root: string, args: string): Promise<string | undefined> {
  const result = await runCommand(`git ${args}`, { cwd: root, timeoutMs: 10_000 });
  if (result.code !== 0) return undefined;
  const value = result.stdout.trim();
  return value.length ? value : undefined;
}

export async function detectGit(root: string): Promise<GitInfo> {
  const info: GitInfo = { isRepo: false, hooks: [] };

  const inside = await git(root, 'rev-parse --is-inside-work-tree');
  if (inside !== 'true') return info;
  info.isRepo = true;

  info.branch = await git(root, 'branch --show-current');
  info.remote = await git(root, 'remote get-url origin');
  info.lastCommit = await git(root, 'log -1 --pretty=%s');

  const status = await git(root, 'status --porcelain');
  if (status !== undefined) {
    info.dirty = status.length > 0;
  }

  const hooksDir = path.join(root, '.git', 'hooks');
  const hooks = await listDir(hooksDir);
  info.hooks = hooks
    .filter((hook) => hook.isFile() && !hook.name.endsWith('.sample'))
    .map((hook) => hook.name)
    .sort();

  // Fall back to the packed config for the remote when the worktree is fresh.
  if (!info.remote) {
    const config = await readTextIfExists(path.join(root, '.git', 'config'));
    const match = config?.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(\S+)/);
    if (match?.[1]) info.remote = match[1];
  }

  return info;
}
