import path from 'node:path';
import { unwatchFile, watchFile } from 'node:fs';
import { stat } from 'node:fs/promises';
import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd } from '../render/agents-md.ts';
import { writeAgentsMd } from '../render/write.ts';
import { IGNORED_DIRS } from '../core/scan.ts';
import { listDir } from '../util/fsx.ts';
import { sha256 } from '../util/hash.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface WatchOptions {
  root?: string;
  lang: Lang;
  outFile: string;
  /** How often manifests are polled, in milliseconds. */
  intervalMs: number;
  /** How often the file tree signature is checked, in milliseconds. */
  structureIntervalMs: number;
  quiet: boolean;
}

export function parseWatchOptions(args: ParsedArgs): WatchOptions {
  const interval = flagString(args.flags, 'interval');
  const structureInterval = flagString(args.flags, 'structure-interval');
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    outFile: flagString(args.flags, 'out') ?? 'AGENTS.md',
    intervalMs: interval ? Number(interval) : 1000,
    structureIntervalMs: structureInterval ? Number(structureInterval) : 5000,
    quiet: flagBoolean(args.flags, 'quiet', false),
  };
}

/** Files whose change should trigger a regeneration. */
const TRIGGER_FILES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'pyproject.toml',
  'uv.lock',
  'poetry.lock',
  'requirements.txt',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'tsconfig.json',
  '.tool-versions',
  '.nvmrc',
  '.node-version',
  'turbo.json',
  'pnpm-workspace.yaml',
  'nx.json',
  'Makefile',
  'CMakeLists.txt',
];

/**
 * A cheap signature of the project tree.
 *
 * Node's `fs.watch` aborts the process on Windows
 * (`Assertion failed: !_wcsnicmp(filename, dir, dirlen)` in `src\win\fs-event.c`),
 * so the watcher polls instead: manifests are watched individually and the tree
 * is summarised by name, size and modification time.
 */
async function treeSignature(root: string, maxDepth = 4, maxFiles = 4000): Promise<string> {
  const parts: string[] = [];
  let seen = 0;

  const walk = async (dir: string, relDir: string, depth: number): Promise<void> => {
    if (depth > maxDepth || seen >= maxFiles) return;
    for (const entry of await listDir(dir)) {
      if (seen >= maxFiles) return;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if (IGNORED_DIRS.has(entry.name)) continue;
        parts.push(`d:${rel}`);
        await walk(path.join(dir, entry.name), rel, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;
      let stats;
      try {
        stats = await stat(path.join(dir, entry.name));
      } catch {
        continue;
      }
      parts.push(`f:${rel}:${stats.size}:${Math.round(stats.mtimeMs)}`);
      seen++;
    }
  };

  await walk(root, '', 0);
  return sha256(parts.join('\n'));
}

export async function runWatch(options: WatchOptions): Promise<number> {
  const snapshot = await collectEnvironment({ root: options.root });
  const root = snapshot.root;
  const target = path.join(root, options.outFile);

  const regenerate = async () => {
    try {
      const next = await collectEnvironment({ root, exclude: [options.outFile] });
      const body = renderAgentsMd(next, { lang: options.lang, generator: 'devtools-agents' });
      const result = await writeAgentsMd(target, body, { lang: options.lang });
      if (!options.quiet && result.action !== 'unchanged') {
        console.log(`↻ ${options.outFile} ${result.action} (env ${next.fingerprint})`);
      }
    } catch (error) {
      console.error(`regeneration failed: ${(error as Error).message}`);
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void regenerate();
    }, Math.min(options.intervalMs, 300));
  };

  // Manifests: polled individually, cheap and exact.
  const watchedPaths: string[] = [];
  let watchedFiles = 0;
  for (const file of TRIGGER_FILES) {
    const absolute = path.join(root, file);
    try {
      watchFile(absolute, { interval: options.intervalMs }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) schedule();
      });
      watchedPaths.push(absolute);
      watchedFiles++;
    } catch {
      // A manifest that cannot be watched is simply skipped.
    }
  }

  // Everything else: a periodic signature of the tree.
  let lastSignature = await treeSignature(root);
  const structureTimer = setInterval(() => {
    void (async () => {
      const signature = await treeSignature(root);
      if (signature !== lastSignature) {
        lastSignature = signature;
        schedule();
      }
    })();
  }, options.structureIntervalMs);
  structureTimer.unref?.();

  console.log(
    `watching ${root} (${watchedFiles} manifests, tree every ${options.structureIntervalMs}ms) - press Ctrl+C to stop`,
  );

  await new Promise<void>((resolve) => {
    const stop = () => {
      for (const watched of watchedPaths) unwatchFile(watched);
      clearInterval(structureTimer);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

  return 0;
}
