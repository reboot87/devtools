import path from 'node:path';
import { listDir } from '../util/fsx.ts';

/** Directories that are noise for an agent trying to understand a project. */
export const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm-store',
  '.yarn',
  '.pnp',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.vercel',
  '.netlify',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  'dist',
  'build',
  'out',
  'coverage',
  '.nyc_output',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  'site-packages',
  'target',
  'vendor',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode-test',
  '.terraform',
  'bin',
  'obj',
  'Debug',
  'Release',
  '.dart_tool',
  '.pub-cache',
  '.bundle',
  '.serverless',
]);

/** Extensions that are not "source code" when computing language shares. */
export const IGNORED_EXTENSIONS = new Set([
  '.lock',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.wav',
  '.so',
  '.dll',
  '.dylib',
  '.exe',
  '.class',
  '.jar',
  '.wasm',
]);

export interface ScanOptions {
  /** How deep the tree view goes. */
  treeDepth?: number;
  /** Max children rendered per directory in the tree view. */
  maxTreeEntries?: number;
  /** Stop scanning below this depth (guards against pathological trees). */
  maxDepth?: number;
  /**
   * Relative posix paths that are ignored. Used to keep the tool's own output
   * (AGENTS.md) out of the environment it describes.
   */
  exclude?: string[];
}

export interface ScanResult {
  /** Relative posix path of every file that is not inside an ignored directory. */
  files: string[];
  /** Directories (relative posix) that contain at least one file. */
  dirs: string[];
  /** Number of files per directory, recursive, own files only. */
  dirFileCounts: Map<string, number>;
  /** File count per extension (lower case, including the dot). */
  extensionCounts: Map<string, number>;
  /** Formatted tree lines without the project root prefix. */
  tree: string[];
}

function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function isHidden(name: string): boolean {
  return name.startsWith('.') && name !== '.' && name !== '..';
}

/**
 * Walks the project, skipping vendored/build directories.
 * `bin` is in the ignore list on purpose, but a top-level `bin/` of shell scripts is
 * still interesting, so it is re-enabled when it lives directly in the root.
 */
export async function scanProject(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const treeDepth = options.treeDepth ?? 2;
  const maxTreeEntries = options.maxTreeEntries ?? 25;
  const maxDepth = options.maxDepth ?? 8;
  const excluded = new Set(options.exclude ?? []);

  const files: string[] = [];
  const dirs = new Set<string>();
  const dirFileCounts = new Map<string, number>();
  const extensionCounts = new Map<string, number>();
  const tree: string[] = [];

  const countFile = (relative: string) => {
    files.push(relative);
    const ext = path.extname(relative).toLowerCase();
    if (ext) extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
    const dir = path.posix.dirname(relative);
    if (dir && dir !== '.') {
      dirFileCounts.set(dir, (dirFileCounts.get(dir) ?? 0) + 1);
      const parts = dir.split('/');
      for (let i = 1; i <= parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
  };

  const walkTree = async (dir: string, relDir: string, depth: number) => {
    if (depth > treeDepth) return;
    const entries = (await listDir(dir)).filter((e) => {
      if (e.name === '.git') return false;
      if (e.isDirectory() && isHidden(e.name) && e.name !== '.github') return false;
      if (e.isDirectory() && isIgnoredDir(e.name) && !(relDir === '' && e.name === 'bin')) return false;
      return true;
    });
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const shown = entries.slice(0, maxTreeEntries);
    for (const entry of shown) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (excluded.has(rel)) continue;
      if (entry.isDirectory()) {
        tree.push(`${'  '.repeat(depth)}${entry.name}/`);
        await walkTree(path.join(dir, entry.name), rel, depth + 1);
      } else {
        tree.push(`${'  '.repeat(depth)}${entry.name}`);
      }
    }
    if (entries.length > shown.length) {
      tree.push(`${'  '.repeat(depth)}… +${entries.length - shown.length} more`);
    }
  };

  const walk = async (dir: string, relDir: string, depth: number) => {
    if (depth > maxDepth) return;
    const entries = await listDir(dir);
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (excluded.has(rel)) continue;
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name) && !(relDir === '' && entry.name === 'bin')) continue;
        if (isHidden(entry.name) && entry.name !== '.github') continue;
        dirs.add(rel);
        await walk(path.join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile()) {
        if (isHidden(entry.name)) continue;
        countFile(rel);
      }
    }
  };

  await walk(root, '', 0);
  await walkTree(root, '', 0);

  return {
    files,
    dirs: [...dirs].sort(),
    dirFileCounts,
    extensionCounts,
    tree,
  };
}
