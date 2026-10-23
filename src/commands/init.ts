import path from 'node:path';
import { promises as fs } from 'node:fs';
import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd } from '../render/agents-md.ts';
import { writeAgentsMd, writeMirrors, MIRROR_TARGETS, readManagedBlock, type MirrorTarget } from '../render/write.ts';
import { readTextIfExists } from '../util/fsx.ts';
import { planInstall, runInstall } from '../install/deps.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface InitOptions {
  root?: string;
  lang: Lang;
  install: boolean;
  dryRun: boolean;
  force: boolean;
  mirrors: MirrorTarget[];
  outFile: string;
  selfInstall: boolean;
  timeoutMs?: number;
  quiet: boolean;
}

export function parseInitOptions(args: ParsedArgs): InitOptions {
  const mirrorArg = flagString(args.flags, 'mirror');
  const mirrors = mirrorArg
    ? mirrorArg
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is MirrorTarget => (MIRROR_TARGETS as string[]).includes(value))
    : [];

  const timeout = flagString(args.flags, 'timeout');
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    install: flagBoolean(args.flags, 'install', true),
    dryRun: flagBoolean(args.flags, 'dry-run', false),
    force: flagBoolean(args.flags, 'force', false),
    mirrors,
    outFile: flagString(args.flags, 'out') ?? 'AGENTS.md',
    selfInstall: flagBoolean(args.flags, 'self-install', false),
    timeoutMs: timeout ? Number(timeout) * 1000 : undefined,
    quiet: flagBoolean(args.flags, 'quiet', false),
  };
}

export async function runInit(options: InitOptions): Promise<number> {
  const log = (message: string) => {
    if (!options.quiet) console.log(message);
  };

  const snapshot = await collectEnvironment({ root: options.root, exclude: [options.outFile] });
  const body = renderAgentsMd(snapshot, { lang: options.lang, generator: 'devtools-agents' });

  const target = path.join(snapshot.root, options.outFile);
  const result = await writeAgentsMd(target, body, { lang: options.lang, force: options.force });
  log(`✓ ${path.relative(process.cwd(), target) || target} ${result.action} (env ${snapshot.fingerprint})`);

  if (options.mirrors.length) {
    // Mirror the block that was actually written: when the environment did not
    // change the previous block (and its timestamp) is kept, so mirroring that
    // instead of the fresh rendering keeps the mirrors byte-stable as well.
    const written = (await readTextIfExists(target)) ?? '';
    const mirrorBody = readManagedBlock(written)?.block.trim() ?? body;
    const mirrors = await writeMirrors(snapshot.root, mirrorBody, options.mirrors, options.lang);
    for (const mirror of mirrors) {
      log(`✓ ${path.relative(process.cwd(), mirror.path)} ${mirror.action}`);
    }
  }

  // Machine readable snapshot for other tools and for drift detection.
  const snapshotDir = path.join(snapshot.root, '.devtools');
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.writeFile(
    path.join(snapshotDir, 'env.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8',
  );

  if (options.install) {
    const plans = planInstall(snapshot);
    if (plans.length === 0) {
      log('· no dependency install command detected, skipping install');
    }
    for (const plan of plans) {
      log(`→ ${plan.command} (${plan.reason})`);
      const installResult = await runInstall(plan, {
        cwd: snapshot.root,
        dryRun: options.dryRun,
        timeoutMs: options.timeoutMs,
      });
      if (installResult.code !== 0) {
        log(`✗ ${plan.command} failed with exit code ${installResult.code}`);
        if (installResult.output) console.log(installResult.output.slice(-2000));
        if (options.selfInstall) {
          log('· skipping self install because dependency installation failed');
        }
        return 1;
      }
      log(`✓ ${plan.command} finished in ${(installResult.durationMs / 1000).toFixed(1)}s`);
    }
  } else {
    log('· dependency installation skipped (--no-install)');
  }

  if (options.selfInstall) {
    log('→ npm install --save-dev devtools-agents');
    const selfResult = await runInstall(
      {
        manager: 'npm',
        command: 'npm install --save-dev devtools-agents',
        reason: 'project dev dependency',
        mutatesLockfile: true,
      },
      { cwd: snapshot.root, dryRun: options.dryRun, timeoutMs: options.timeoutMs },
    );
    if (selfResult.code !== 0) {
      log('✗ self installation failed');
      return 1;
    }
    log('✓ devtools-agents installed as a dev dependency');
  }

  return 0;
}
