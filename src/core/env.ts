import path from 'node:path';
import { scanProject } from './scan.ts';
import { detectManifests } from '../detect/manifests.ts';
import { detectRuntimes, detectPackageManagers } from '../detect/runtimes.ts';
import { detectFrameworks } from '../detect/frameworks.ts';
import { deriveCommands } from '../detect/commands.ts';
import { detectConfigs, detectCi } from '../detect/configs.ts';
import { detectDirs, detectEntryPoints, detectLanguages } from '../detect/structure.ts';
import { detectEnvVars } from '../detect/envvars.ts';
import { detectGit } from '../detect/git.ts';
import { fingerprint } from '../util/hash.ts';
import { exists } from '../util/fsx.ts';
import type { EnvSnapshot } from './types.ts';

const ROOT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'mix.exs',
  'deno.json',
  'Cargo.lock',
  'Makefile',
  'CMakeLists.txt',
];

/**
 * Files this tool writes itself. They describe the environment rather than
 * belong to it, so they must never influence the snapshot - otherwise
 * `init --mirror` would read its own output back as a change on the next run
 * and rewrite the document it just declared current.
 */
export const SELF_ARTIFACTS = [
  '.devtools',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules/devtools-agents.mdc',
];

export interface CollectOptions {
  /** Explicit project root. When omitted it is derived from the current directory. */
  root?: string;
  /** How deep the rendered tree goes. */
  treeDepth?: number;
  /** Relative paths that must not influence the result (e.g. the generated file). */
  exclude?: string[];
}

/**
 * Walks up from `start` and returns the nearest directory that looks like a
 * project root. Walking to the outermost match instead would let a stray
 * `package.json` in a home or temp directory turn `devtools agents init` into a
 * scan of that whole directory tree.
 */
export async function findProjectRoot(start: string): Promise<string> {
  let current = path.resolve(start);

  for (;;) {
    for (const marker of ROOT_MARKERS) {
      if (await exists(path.join(current, marker))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(start);
}

export async function collectEnvironment(options: CollectOptions = {}): Promise<EnvSnapshot> {
  const root = options.root ? path.resolve(options.root) : await findProjectRoot(process.cwd());

  const scan = await scanProject(root, {
    treeDepth: options.treeDepth ?? 2,
    exclude: [...SELF_ARTIFACTS, ...(options.exclude ?? [])],
  });
  const bundle = await detectManifests(root);
  const runtimes = await detectRuntimes(root, bundle);
  const { managers, primary } = await detectPackageManagers(root, bundle);

  const frameworks = detectFrameworks({
    dependencies: bundle.packageJson?.dependencies ?? {},
    devDependencies: bundle.packageJson?.devDependencies ?? {},
    otherDependencies: bundle.otherDependencies,
  });

  const configs = await detectConfigs(root);
  const commands = deriveCommands(bundle, primary, frameworks, configs);
  const dirs = detectDirs(scan, root);
  const entryPoints = detectEntryPoints(scan);
  const languages = detectLanguages(scan);
  const ci = await detectCi(root);
  const envVars = await detectEnvVars(root, scan);
  const git = await detectGit(root);

  const notes: string[] = [];

  let monorepo: string | undefined;
  const workspaces = bundle.packageJson?.workspaces;
  if (workspaces?.length) {
    monorepo = `npm workspaces (${workspaces.join(', ')})`;
  } else if (await exists(path.join(root, 'pnpm-workspace.yaml'))) {
    monorepo = 'pnpm workspace';
  } else if (await exists(path.join(root, 'turbo.json'))) {
    monorepo = 'Turborepo';
  } else if (await exists(path.join(root, 'nx.json'))) {
    monorepo = 'Nx';
  } else if (await exists(path.join(root, 'lerna.json'))) {
    monorepo = 'Lerna';
  }
  if (monorepo) notes.push(`Monorepo layout detected: ${monorepo}.`);

  if (git.hooks.length) {
    notes.push(`Git hooks installed: ${git.hooks.join(', ')}.`);
  }
  if (primary?.selfInstallCommand) {
    notes.push(
      `\`${primary.name}\` is not bundled with Node. Install it with \`${primary.selfInstallCommand}\` before running the install command.`,
    );
  }
  const testCommand = commands.find((c) => c.purpose === 'test');
  if (!testCommand) {
    notes.push('No test command detected - confirm how this project is verified before changing code.');
  }
  if (bundle.packageJson?.private) {
    notes.push('`package.json` is marked private: this project is not published.');
  }
  if (envVars.some((v) => v.required)) {
    notes.push('Some environment variables have no default value - ask before guessing them.');
  }

  const snapshot: EnvSnapshot = {
    root,
    name: bundle.packageJson?.name ?? bundle.python?.name ?? bundle.rust?.name ?? path.basename(root),
    generatedAt: new Date().toISOString(),
    fingerprint: '',
    monorepo,
    runtimes,
    packageManagers: managers,
    manifests: bundle.manifests,
    frameworks,
    commands,
    scripts: bundle.packageJson?.scripts ?? {},
    dirs,
    tree: scan.tree,
    entryPoints,
    configs,
    envVars,
    ci,
    git,
    languages,
    notes,
  };

  snapshot.fingerprint = fingerprint({
    name: snapshot.name,
    monorepo: snapshot.monorepo,
    runtimes: snapshot.runtimes,
    packageManagers: snapshot.packageManagers,
    manifests: snapshot.manifests,
    frameworks: snapshot.frameworks,
    commands: snapshot.commands,
    scripts: snapshot.scripts,
    dirs: snapshot.dirs,
    entryPoints: snapshot.entryPoints,
    configs: snapshot.configs,
    envVars: snapshot.envVars.map((v) => ({ name: v.name, required: v.required })),
    languages: snapshot.languages,
  });

  return snapshot;
}
