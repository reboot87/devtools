import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import type { ManifestBundle } from './manifests.ts';
import type { PackageManagerInfo, RuntimeInfo } from '../core/types.ts';

const VERSION_FILES: { file: string; runtime: string; pattern?: RegExp }[] = [
  { file: '.nvmrc', runtime: 'node' },
  { file: '.node-version', runtime: 'node' },
  { file: '.python-version', runtime: 'python' },
  { file: '.ruby-version', runtime: 'ruby' },
  { file: '.php-version', runtime: 'php' },
  { file: '.java-version', runtime: 'java' },
  { file: '.tool-versions', runtime: 'asdf' },
  { file: '.go-version', runtime: 'go' },
  { file: 'rust-toolchain.toml', runtime: 'rust' },
  { file: 'rust-toolchain', runtime: 'rust' },
  { file: 'mise.toml', runtime: 'mise' },
  { file: '.mise.toml', runtime: 'mise' },
  { file: 'deno.json', runtime: 'deno' },
  { file: 'deno.jsonc', runtime: 'deno' },
];

export async function detectRuntimes(root: string, bundle: ManifestBundle): Promise<RuntimeInfo[]> {
  const runtimes = new Map<string, RuntimeInfo>();

  const add = (name: string, version?: string, file?: string) => {
    const existing = runtimes.get(name);
    if (existing) {
      if (!existing.version && version) existing.version = version;
      if (file && !existing.files.includes(file)) existing.files.push(file);
      return;
    }
    runtimes.set(name, { name, version, files: file ? [file] : [] });
  };

  for (const { file, runtime } of VERSION_FILES) {
    const text = await readTextIfExists(path.join(root, file));
    if (!text) continue;
    const version = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    add(runtime, version, file);
  }

  if (bundle.packageJson) {
    const engine = bundle.packageJson.engines?.['node'];
    if (engine) add('node', engine.replace(/^[\^~>=<\s]+/, ''), 'package.json (engines.node)');
    if (bundle.packageJson.type) add('node', undefined, 'package.json (module type)');
    // Any project with a package.json runs on Node, even without `engines` or
    // `type`. Without this the runtime section of the document would be empty.
    if (!engine && !bundle.packageJson.type) add('node', undefined, 'package.json');
  }
  if (bundle.python?.requiresPython) {
    add('python', bundle.python.requiresPython.replace(/^[\^~>=<\s]+/, ''), 'pyproject.toml');
  }
  if (bundle.rust) {
    add('rust', bundle.rust.edition ? `edition ${bundle.rust.edition}` : undefined, 'Cargo.toml');
  }
  if (bundle.go?.goVersion) {
    add('go', bundle.go.goVersion, 'go.mod');
  }
  if (bundle.has('pom.xml') || bundle.has('build.gradle')) add('java', undefined, 'pom.xml');
  if (bundle.has('Gemfile')) add('ruby', undefined, 'Gemfile');
  if (bundle.has('composer.json')) add('php', undefined, 'composer.json');
  if (bundle.has('mix.exs')) add('elixir', undefined, 'mix.exs');
  if (bundle.has('deno.json') || bundle.has('deno.jsonc')) add('deno', undefined, 'deno.json');
  if (bundle.has('bun.lockb') || bundle.has('bun.lock')) add('bun', undefined, 'bun.lock');

  // Node is the runtime this tool itself runs on, so it is always present.
  if (runtimes.has('node')) {
    const node = runtimes.get('node') as RuntimeInfo;
    node.version = node.version ?? process.versions.node;
    if (!node.files.length) node.files.push('package.json');
  }

  return [...runtimes.values()];
}

export interface PackageManagerDetection {
  managers: PackageManagerInfo[];
  /** The manager the project actually uses, i.e. the one matching the lockfile. */
  primary?: PackageManagerInfo;
}

export async function detectPackageManagers(
  root: string,
  bundle: ManifestBundle,
): Promise<PackageManagerDetection> {
  const managers: PackageManagerInfo[] = [];
  const add = (info: PackageManagerInfo) => {
    if (!managers.some((m) => m.name === info.name)) managers.push(info);
  };

  const lockfiles: { file: string; manager: string; install: string; self?: string }[] = [
    { file: 'bun.lock', manager: 'bun', install: 'bun install' },
    { file: 'bun.lockb', manager: 'bun', install: 'bun install' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm', install: 'pnpm install --frozen-lockfile', self: 'npm i -g pnpm' },
    { file: 'yarn.lock', manager: 'yarn', install: 'yarn install' },
    { file: 'package-lock.json', manager: 'npm', install: 'npm ci' },
    { file: 'deno.lock', manager: 'deno', install: 'deno install' },
    { file: 'uv.lock', manager: 'uv', install: 'uv sync', self: 'npm i -g uv' },
    { file: 'poetry.lock', manager: 'poetry', install: 'poetry install', self: 'pipx install poetry' },
    { file: 'Pipfile.lock', manager: 'pipenv', install: 'pipenv install', self: 'pipx install pipenv' },
    { file: 'Cargo.lock', manager: 'cargo', install: 'cargo fetch' },
    { file: 'go.sum', manager: 'go', install: 'go mod download' },
    { file: 'composer.lock', manager: 'composer', install: 'composer install' },
    { file: 'Gemfile.lock', manager: 'bundler', install: 'bundle install' },
  ];

  for (const lock of lockfiles) {
    const text = await readTextIfExists(path.join(root, lock.file));
    if (!text) continue;
    add({
      name: lock.manager,
      lockfile: lock.file,
      installCommand: lock.install,
      selfInstallCommand: lock.self,
    });
  }

  // `packageManager` field wins over lockfile guessing (corepack).
  const declared = bundle.packageJson?.packageManager;
  if (declared) {
    const [name, version] = declared.split('@');
    const manager = managers.find((m) => m.name === name);
    if (manager) {
      manager.version = version;
    } else {
      add({ name: name ?? 'npm', version, installCommand: name === 'pnpm' ? 'pnpm install' : undefined });
    }
  }

  if (bundle.has('package.json') && !managers.some((m) => m.name === 'npm' || m.name === 'pnpm' || m.name === 'yarn' || m.name === 'bun')) {
    add({ name: 'npm', installCommand: 'npm install' });
  }

  if (bundle.python?.packageManager === 'pip' && !managers.some((m) => m.name === 'pip')) {
    add({ name: 'pip', installCommand: 'pip install -r requirements.txt' });
  }
  if (bundle.python?.packageManager === 'uv' && !managers.some((m) => m.name === 'uv')) {
    add({ name: 'uv', installCommand: 'uv sync' });
  }
  if (bundle.python?.packageManager === 'poetry' && !managers.some((m) => m.name === 'poetry')) {
    add({ name: 'poetry', installCommand: 'poetry install' });
  }

  const priority = ['pnpm', 'bun', 'yarn', 'npm', 'uv', 'poetry', 'pipenv', 'pip', 'cargo', 'go', 'composer', 'bundler'];
  const sorted = [...managers].sort((a, b) => {
    const ai = priority.indexOf(a.name);
    const bi = priority.indexOf(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return { managers: sorted, primary: sorted[0] };
}
