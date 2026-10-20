import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Always use posix separators in generated documents. */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Path of `target` relative to `root`, in posix form. `target` must be inside `root`. */
export function relativePosix(root: string, target: string): string {
  return toPosix(path.relative(root, target));
}

export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function listDir(dir: string): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
