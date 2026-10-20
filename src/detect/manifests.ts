import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import { parseToml, tomlGet, tomlString, tomlStringArray } from '../util/toml.ts';
import type { ManifestInfo } from '../core/types.ts';

export interface PackageJsonData {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  type?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  workspaces?: string[];
  packageManager?: string;
  engines?: Record<string, string>;
}

export interface PythonData {
  name?: string;
  version?: string;
  requiresPython?: string;
  dependencies: string[];
  packageManager?: 'uv' | 'poetry' | 'pipenv' | 'pip';
  tool?: string;
}

export interface RustData {
  name?: string;
  version?: string;
  edition?: string;
  dependencies: string[];
}

export interface GoData {
  module?: string;
  goVersion?: string;
  dependencies: string[];
}

export interface ManifestBundle {
  manifests: ManifestInfo[];
  packageJson?: PackageJsonData;
  python?: PythonData;
  rust?: RustData;
  go?: GoData;
  /** Dependencies from non-node ecosystems, used for framework detection. */
  otherDependencies: { ecosystem: string; name: string; version?: string }[];
  has: (file: string) => boolean;
}

function parseJsonSafe(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore malformed manifests */
  }
  return undefined;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') result[key] = raw;
  }
  return result;
}

/** Normalise a PEP 508 requirement (`requests>=2.0`) to its distribution name. */
export function pythonRequirementName(requirement: string): string {
  const cleaned = requirement.split(/[;#]/)[0] ?? '';
  const match = cleaned.trim().match(/^([A-Za-z0-9._-]+)/);
  return (match?.[1] ?? cleaned).toLowerCase();
}

export async function detectManifests(root: string): Promise<ManifestBundle> {
  const manifests: ManifestInfo[] = [];
  const otherDependencies: { ecosystem: string; name: string; version?: string }[] = [];
  const present = new Set<string>();
  const has = (file: string) => present.has(file);

  // ---- package.json -------------------------------------------------------
  let packageJson: PackageJsonData | undefined;
  const pkgText = await readTextIfExists(path.join(root, 'package.json'));
  if (pkgText) {
    present.add('package.json');
    const pkg = parseJsonSafe(pkgText);
    if (pkg) {
      const workspacesRaw = pkg['workspaces'];
      let workspaces: string[] | undefined;
      if (Array.isArray(workspacesRaw)) {
        workspaces = workspacesRaw.filter((w): w is string => typeof w === 'string');
      } else if (workspacesRaw && typeof workspacesRaw === 'object' && !Array.isArray(workspacesRaw)) {
        const packages = (workspacesRaw as Record<string, unknown>)['packages'];
        if (Array.isArray(packages)) {
          workspaces = packages.filter((w): w is string => typeof w === 'string');
        }
      }
      packageJson = {
        name: typeof pkg['name'] === 'string' ? pkg['name'] : undefined,
        version: typeof pkg['version'] === 'string' ? pkg['version'] : undefined,
        description: typeof pkg['description'] === 'string' ? pkg['description'] : undefined,
        private: pkg['private'] === true,
        type: typeof pkg['type'] === 'string' ? pkg['type'] : undefined,
        scripts: asStringRecord(pkg['scripts']),
        dependencies: asStringRecord(pkg['dependencies']),
        devDependencies: asStringRecord(pkg['devDependencies']),
        workspaces,
        packageManager: typeof pkg['packageManager'] === 'string' ? pkg['packageManager'] : undefined,
        engines: asStringRecord(pkg['engines']),
      };
      manifests.push({
        path: 'package.json',
        type: 'package.json',
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
      });
    }
  }

  // ---- pyproject.toml -----------------------------------------------------
  let python: PythonData | undefined;
  const pyText = await readTextIfExists(path.join(root, 'pyproject.toml'));
  if (pyText) {
    present.add('pyproject.toml');
    const doc = parseToml(pyText);
    const project = tomlGet(doc, 'project');
    const poetry = tomlGet(doc, 'tool.poetry');
    const dependencies = project
      ? tomlStringArray(doc, 'project.dependencies')
      : tomlStringArray(doc, 'tool.poetry.dependencies');
    const devDependencies = tomlStringArray(doc, 'project.optional-dependencies.dev');
    const allDeps = [...dependencies, ...devDependencies];
    let packageManager: PythonData['packageManager'];
    if (tomlGet(doc, 'tool.uv')) packageManager = 'uv';
    else if (poetry) packageManager = 'poetry';
    else if (await readTextIfExists(path.join(root, 'Pipfile'))) packageManager = 'pipenv';
    else packageManager = 'pip';

    python = {
      name: tomlString(doc, 'project.name') ?? tomlString(doc, 'tool.poetry.name'),
      version: tomlString(doc, 'project.version') ?? tomlString(doc, 'tool.poetry.version'),
      requiresPython: tomlString(doc, 'project.requires-python'),
      dependencies: allDeps,
      packageManager,
    };
    manifests.push({
      path: 'pyproject.toml',
      type: 'pyproject.toml',
      name: python.name,
      version: python.version,
    });
    for (const requirement of allDeps) {
      otherDependencies.push({ ecosystem: 'python', name: pythonRequirementName(requirement) });
    }
  }

  // ---- requirements.txt / Pipfile -----------------------------------------
  if (!python) {
    const requirements = await readTextIfExists(path.join(root, 'requirements.txt'));
    if (requirements) {
      present.add('requirements.txt');
      const deps = requirements
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
        .map(pythonRequirementName);
      python = { dependencies: deps, packageManager: 'pip' };
      manifests.push({ path: 'requirements.txt', type: 'requirements.txt' });
      for (const dep of deps) otherDependencies.push({ ecosystem: 'python', name: dep });
    }
  }
  if (await readTextIfExists(path.join(root, 'Pipfile'))) present.add('Pipfile');

  // ---- Cargo.toml ---------------------------------------------------------
  let rust: RustData | undefined;
  const cargoText = await readTextIfExists(path.join(root, 'Cargo.toml'));
  if (cargoText) {
    present.add('Cargo.toml');
    const doc = parseToml(cargoText);
    const dependencies = [
      ...Object.keys((tomlGet(doc, 'dependencies') as Record<string, unknown> | undefined) ?? {}),
      ...Object.keys((tomlGet(doc, 'dev-dependencies') as Record<string, unknown> | undefined) ?? {}),
      ...Object.keys((tomlGet(doc, 'build-dependencies') as Record<string, unknown> | undefined) ?? {}),
    ];
    rust = {
      name: tomlString(doc, 'package.name'),
      version: tomlString(doc, 'package.version'),
      edition: tomlString(doc, 'package.edition'),
      dependencies,
    };
    manifests.push({
      path: 'Cargo.toml',
      type: 'Cargo.toml',
      name: rust.name,
      version: rust.version,
    });
    for (const dep of dependencies) otherDependencies.push({ ecosystem: 'rust', name: dep });
  }

  // ---- go.mod -------------------------------------------------------------
  let go: GoData | undefined;
  const goText = await readTextIfExists(path.join(root, 'go.mod'));
  if (goText) {
    present.add('go.mod');
    const moduleMatch = goText.match(/^module\s+(\S+)/m);
    const goMatch = goText.match(/^go\s+(\S+)/m);
    const dependencies = [...goText.matchAll(/^\s*([\w.\-/]+\.[\w.\-/]+)\s+v[\w.\-+]+/gm)].map((m) => m[1] as string);
    go = {
      module: moduleMatch?.[1],
      goVersion: goMatch?.[1],
      dependencies: [...new Set(dependencies)],
    };
    manifests.push({ path: 'go.mod', type: 'go.mod', name: go.module });
    for (const dep of go.dependencies) otherDependencies.push({ ecosystem: 'go', name: dep });
  }

  // ---- composer.json / Gemfile / Maven / .NET ------------------------------
  const composerText = await readTextIfExists(path.join(root, 'composer.json'));
  if (composerText) {
    present.add('composer.json');
    const composer = parseJsonSafe(composerText);
    manifests.push({
      path: 'composer.json',
      type: 'composer.json',
      name: typeof composer?.['name'] === 'string' ? (composer['name'] as string) : undefined,
      version: typeof composer?.['version'] === 'string' ? (composer['version'] as string) : undefined,
    });
    for (const dep of Object.keys(asStringRecord(composer?.['require']))) {
      otherDependencies.push({ ecosystem: 'php', name: dep });
    }
  }

  if (await readTextIfExists(path.join(root, 'Gemfile'))) {
    present.add('Gemfile');
    manifests.push({ path: 'Gemfile', type: 'Gemfile' });
  }

  const pomText = await readTextIfExists(path.join(root, 'pom.xml'));
  if (pomText) {
    present.add('pom.xml');
    const artifact = pomText.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    const version = pomText.match(/<version>([^<]+)<\/version>/)?.[1];
    manifests.push({ path: 'pom.xml', type: 'pom.xml', name: artifact, version });
  }

  const gradleFiles = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
  for (const gradleFile of gradleFiles) {
    if (await readTextIfExists(path.join(root, gradleFile))) {
      present.add(gradleFile);
      manifests.push({ path: gradleFile, type: gradleFile });
    }
  }

  const { listDir } = await import('../util/fsx.ts');
  for (const entry of await listDir(root)) {
    if (entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))) {
      present.add(entry.name);
      manifests.push({ path: entry.name, type: entry.name.endsWith('.sln') ? 'solution' : '.NET project' });
    }
  }

  // Solutions and project files one level down (common in driver repositories).
  for (const entry of await listDir(root)) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    for (const child of await listDir(path.join(root, entry.name))) {
      if (!child.isFile()) continue;
      if (child.name.endsWith('.sln') || child.name.endsWith('.csproj') || child.name.endsWith('.vcxproj')) {
        const relative = `${entry.name}/${child.name}`;
        present.add(relative);
        manifests.push({
          path: relative,
          type: child.name.endsWith('.sln')
            ? 'Visual Studio solution'
            : child.name.endsWith('.vcxproj')
              ? 'Visual C++ project'
              : '.NET project',
        });
      }
    }
  }

  if (await readTextIfExists(path.join(root, 'CMakeLists.txt'))) {
    present.add('CMakeLists.txt');
    manifests.push({ path: 'CMakeLists.txt', type: 'CMake project' });
  }

  if (await readTextIfExists(path.join(root, 'mix.exs'))) {
    present.add('mix.exs');
    manifests.push({ path: 'mix.exs', type: 'mix.exs' });
  }

  return { manifests, packageJson, python, rust, go, otherDependencies, has };
}
