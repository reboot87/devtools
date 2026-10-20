import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd } from '../render/agents-md.ts';
import { writeAgentsMd } from '../render/write.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface WatchOptions {
  root?: string;
  lang: Lang;
  outFile: string;
  intervalMs: number;
  quiet: boolean;
}

export function parseWatchOptions(args: ParsedArgs): WatchOptions {
  const interval = flagString(args.flags, 'interval');
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    outFile: flagString(args.flags, 'out') ?? 'AGENTS.md',
    intervalMs: interval ? Number(interval) : 800,
    quiet: flagBoolean(args.flags, 'quiet', false),
  };
}

/** Files whose change should trigger a regeneration. */
const TRIGGER_FILES = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'tsconfig.json',
  '.tool-versions',
  '.nvmrc',
  '.node-version',
  'turbo.json',
  'pnpm-workspace.yaml',
  'nx.json',
];

export async function runWatch(options: WatchOptions): Promise<number> {
  const snapshot = await collectEnvironment({ root: options.root });
  const root = snapshot.root;
  const target = path.join(root, options.outFile);

  const regenerate = async () => {
    const next = await collectEnvironment({ root });
    const body = renderAgentsMd(next, { lang: options.lang, generator: 'devtools-agents' });
    const result = await writeAgentsMd(target, body, { lang: options.lang });
    if (!options.quiet && result.action !== 'unchanged') {
      console.log(`↻ ${options.outFile} ${result.action} (env ${next.fingerprint})`);
    }
  };

  console.log(`watching ${root} - press Ctrl+C to stop`);

  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void regenerate();
    }, options.intervalMs);
  };

  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const base = path.basename(filename.toString());
      if (TRIGGER_FILES.includes(base) || base === 'AGENTS.md') schedule();
    });
  } catch (error) {
    console.error(`watching failed: ${(error as Error).message}`);
    return 1;
  }

  await new Promise<void>((resolve) => {
    const stop = () => {
      watcher?.close();
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

  return 0;
}
