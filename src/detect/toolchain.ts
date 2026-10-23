import path from 'node:path';
import { promises as nodeFs } from 'node:fs';
import { runBinary, runCommand, type RunResult } from '../util/exec.ts';
import type { ToolInfo, ToolchainInfo, ToolKind } from '../core/types.ts';

/**
 * Detection of the machine wide toolchain.
 *
 * The document this tool generates is read by coding agents, and the most
 * expensive mistake such an agent makes on a prepared Windows box is to go
 * looking for (or installing) a compiler, CMake or Qt that is already there.
 * Everything found here is reported as "installed, use it directly".
 */

export type Runner = (
  file: string,
  args: string[],
  options?: { shell?: boolean },
) => Promise<RunResult>;

export interface ToolchainFs {
  exists(target: string): Promise<boolean>;
  readDir(target: string): Promise<string[]>;
}

export interface DetectToolchainOptions {
  /** Project root; the probe cache is stored below it. */
  root: string;
  /** Ignore a fresh cache and probe again. */
  refresh?: boolean;
  /** Do not read or write the cache (used by tests and `--dry-run`). */
  noCache?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  run?: Runner;
  fs?: ToolchainFs;
  now?: () => number;
}

export const TOOLCHAIN_CACHE_DIR = '.devtools';
export const TOOLCHAIN_CACHE_FILE = 'toolchain.json';
/** Probing spawns a few dozen processes, so the result is reused for a while. */
export const TOOLCHAIN_TTL_MS = 6 * 60 * 60 * 1000;

const KIND_ORDER: ToolKind[] = ['compiler', 'sdk', 'build', 'framework', 'runtime', 'package-manager', 'tool'];

interface PathTool {
  name: string;
  kind: ToolKind;
  /** Executable name, resolved through PATH. */
  bin: string;
  args: string[];
  /** Node cannot exec `.cmd` shims without a shell, so those few go through one. */
  shell?: boolean;
  /** Optional extra fact derived from the output. */
  detail?: (text: string) => string | undefined;
}

const NODE_SCRIPTS = process.platform === 'win32';

const PATH_TOOLS: PathTool[] = [
  { name: 'gcc', kind: 'compiler', bin: 'gcc', args: ['--version'] },
  { name: 'clang', kind: 'compiler', bin: 'clang', args: ['--version'] },
  { name: 'rustc', kind: 'compiler', bin: 'rustc', args: ['--version'] },
  { name: 'CMake', kind: 'build', bin: 'cmake', args: ['--version'] },
  { name: 'Ninja', kind: 'build', bin: 'ninja', args: ['--version'] },
  { name: 'MSBuild', kind: 'build', bin: 'msbuild', args: ['-version'] },
  { name: 'make', kind: 'build', bin: 'make', args: ['--version'] },
  { name: 'make (mingw32)', kind: 'build', bin: 'mingw32-make', args: ['--version'] },
  { name: 'cargo', kind: 'build', bin: 'cargo', args: ['--version'] },
  { name: 'Qt (qmake)', kind: 'framework', bin: 'qmake', args: ['-query', 'QT_VERSION'] },
  { name: 'node', kind: 'runtime', bin: 'node', args: ['--version'] },
  { name: 'python', kind: 'runtime', bin: 'python', args: ['--version'] },
  { name: 'go', kind: 'runtime', bin: 'go', args: ['version'] },
  { name: 'java', kind: 'runtime', bin: 'java', args: ['-version'] },
  { name: 'dotnet', kind: 'runtime', bin: 'dotnet', args: ['--version'] },
  { name: 'bun', kind: 'runtime', bin: 'bun', args: ['--version'] },
  { name: 'deno', kind: 'runtime', bin: 'deno', args: ['--version'] },
  { name: 'npm', kind: 'package-manager', bin: 'npm', args: ['--version'], shell: NODE_SCRIPTS },
  { name: 'pnpm', kind: 'package-manager', bin: 'pnpm', args: ['--version'], shell: NODE_SCRIPTS },
  { name: 'yarn', kind: 'package-manager', bin: 'yarn', args: ['--version'], shell: NODE_SCRIPTS },
  { name: 'uv', kind: 'package-manager', bin: 'uv', args: ['--version'] },
  { name: 'Conan', kind: 'package-manager', bin: 'conan', args: ['--version'] },
  { name: 'vcpkg', kind: 'package-manager', bin: 'vcpkg', args: ['version'] },
  { name: 'git', kind: 'tool', bin: 'git', args: ['--version'] },
  { name: 'docker', kind: 'tool', bin: 'docker', args: ['--version'] },
  { name: 'PowerShell', kind: 'tool', bin: 'pwsh', args: ['--version'] },
];

const DEFAULT_FS: ToolchainFs = {
  async exists(target: string) {
    try {
      await nodeFs.access(target);
      return true;
    } catch {
      return false;
    }
  },
  async readDir(target: string) {
    try {
      const entries = await nodeFs.readdir(target, { withFileTypes: true });
      return entries.map((entry) => entry.name);
    } catch {
      return [];
    }
  },
};

// Slow interpreters (python based tools) need a real budget; the probes run in
// parallel, so this is the wall clock cost of the slowest single tool.
const PROBE_TIMEOUT_MS = 10_000;

const DEFAULT_RUN: Runner = (file, args, options) =>
  options?.shell
    ? runCommand([file, ...args].map(quoteShellArg).join(' '), {
        cwd: process.cwd(),
        timeoutMs: PROBE_TIMEOUT_MS,
        maxOutput: 4_000,
      })
    : runBinary(file, args, { cwd: process.cwd(), timeoutMs: PROBE_TIMEOUT_MS, maxOutput: 4_000 });

function quoteShellArg(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/** First dotted version number in a command banner. */
export function firstVersion(text: string): string | undefined {
  const match = text.match(/(\d+\.\d+(?:\.\d+)*)/);
  return match?.[1];
}

/** Picks the highest dotted version from a list of directory names. */
export function pickNewestVersion(names: string[]): string | undefined {
  const versions = names
    .map((name) => name.match(/^\d+(?:\.\d+)+$/)?.[0])
    .filter((name): name is string => name !== undefined);
  if (versions.length === 0) return undefined;
  return versions.sort(compareVersions).at(-1);
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

export interface VisualStudioInstall {
  path: string;
  version?: string;
  displayName?: string;
}

/** Parses `vswhere -format json`. Tolerates a broken or empty answer. */
export function parseVisualStudioJson(text: string): VisualStudioInstall[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const installs: VisualStudioInstall[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const installPath = typeof record['installationPath'] === 'string' ? record['installationPath'] : undefined;
    if (!installPath) continue;
    installs.push({
      path: installPath,
      version: typeof record['installationVersion'] === 'string' ? record['installationVersion'] : undefined,
      displayName: typeof record['displayName'] === 'string' ? record['displayName'] : undefined,
    });
  }
  return installs;
}

/** Splits `Qt 6.7.2 (msvc2019_64, mingw_64)` style directory layouts. */
export function qtKitsOf(dirs: string[]): string[] {
  return dirs.filter((dir) => /^(msvc|mingw|clang|gcc|android|wasm)/i.test(dir)).sort();
}

/** Resolves an executable against PATH without starting a process. */
async function resolveOnPath(
  bin: string,
  env: NodeJS.ProcessEnv,
  fs: ToolchainFs,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  const dirs = (env.PATH ?? env['Path'] ?? '').split(path.delimiter).filter((dir) => dir !== '');
  const candidates = platform === 'win32' ? [`${bin}.exe`, `${bin}.cmd`, `${bin}.bat`, bin] : [bin];
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (await fs.exists(full)) return full;
    }
  }
  return undefined;
}

function toText(result: RunResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

async function probePathTool(
  tool: PathTool,
  options: { run: Runner; env: NodeJS.ProcessEnv; fs: ToolchainFs; platform: NodeJS.Platform },
): Promise<ToolInfo | undefined> {
  const { run, env, fs, platform } = options;
  const result = await run(tool.bin, tool.args, { shell: tool.shell });
  const text = toText(result);
  const version = firstVersion(text);

  // A missing binary fails to spawn at all and carries no output.
  if (result.error !== undefined) return undefined;

  const binaryPath = await resolveOnPath(tool.bin, env, fs, platform);

  if (result.timedOut) {
    // Installed but too slow to answer: still worth reporting, so the agent does
    // not go looking for it.
    return binaryPath
      ? { name: tool.name, kind: tool.kind, path: binaryPath, source: 'PATH', detail: 'version check timed out' }
      : undefined;
  }
  if (version === undefined && result.code !== 0) return undefined;
  if (version === undefined && text === '') return undefined;
  const info: ToolInfo = {
    name: tool.name,
    kind: tool.kind,
    source: 'PATH',
  };
  if (version) info.version = version;
  if (binaryPath) info.path = binaryPath;
  const detail = tool.detail?.(text);
  if (detail) info.detail = detail;
  return info;
}

/** Tools that only appear when Visual Studio, the Windows SDK or Qt are installed. */
async function detectWindowsTools(options: {
  env: NodeJS.ProcessEnv;
  fs: ToolchainFs;
  run: Runner;
}): Promise<ToolInfo[]> {
  const { env, fs, run } = options;
  const tools: ToolInfo[] = [];
  const programRoots = [env['ProgramFiles(x86)'], env['ProgramFiles'], env['ProgramW6432']].filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );

  const installs = new Map<string, VisualStudioInstall>();
  for (const root of programRoots) {
    const vswhere = path.join(root, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (!(await fs.exists(vswhere))) continue;
    const result = await run(vswhere, [
      '-latest',
      '-prerelease',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-format',
      'json',
      '-utf8',
    ]);
    for (const install of parseVisualStudioJson(toText(result))) installs.set(install.path, install);
  }

  for (const install of installs.values()) {
    const toolsRoot = path.join(install.path, 'VC', 'Tools', 'MSVC');
    const toolset = pickNewestVersion(await fs.readDir(toolsRoot));
    tools.push({
      name: 'MSVC',
      kind: 'compiler',
      version: toolset ?? install.version,
      path: toolset ? path.join(toolsRoot, toolset, 'bin', 'Hostx64', 'x64') : path.join(install.path, 'VC', 'Tools', 'MSVC'),
      source: 'vswhere',
      detail: [install.displayName, toolset ? `toolset ${toolset}` : undefined].filter(Boolean).join(' · ') || undefined,
    });

    const msbuild = path.join(install.path, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe');
    if (await fs.exists(msbuild)) {
      tools.push({ name: 'MSBuild', kind: 'build', path: msbuild, source: 'vswhere', detail: 'bundled with Visual Studio' });
    }
    const cmake = path.join(install.path, 'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake', 'CMake', 'bin', 'cmake.exe');
    if (await fs.exists(cmake)) {
      tools.push({ name: 'CMake', kind: 'build', path: cmake, source: 'vswhere', detail: 'bundled with Visual Studio' });
    }
    const ninja = path.join(install.path, 'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake', 'Ninja', 'ninja.exe');
    if (await fs.exists(ninja)) {
      tools.push({ name: 'Ninja', kind: 'build', path: ninja, source: 'vswhere', detail: 'bundled with Visual Studio' });
    }
  }

  for (const root of programRoots) {
    const include = path.join(root, 'Windows Kits', '10', 'Include');
    const sdkVersions = (await fs.readDir(include)).filter((name) => /^\d+(?:\.\d+)+$/.test(name));
    const newest = sdkVersions.sort(compareVersions).at(-1);
    if (newest) {
      tools.push({
        name: 'Windows SDK',
        kind: 'sdk',
        version: newest,
        path: include,
        source: 'Windows Kits',
        detail: sdkVersions.length > 1 ? `${sdkVersions.length} versions installed` : undefined,
      });
    }
  }

  // Qt installed by the online installer: C:\Qt\6.7.2\msvc2019_64\...
  const qtRoots: string[] = [];
  if (env['QTDIR']) qtRoots.push(env['QTDIR']);
  for (const root of [...programRoots, 'C:\\']) {
    const candidate = path.join(root, 'Qt');
    if (await fs.exists(candidate)) qtRoots.push(candidate);
  }
  const seenQt = new Set<string>();
  for (const qtRoot of qtRoots) {
    const entries = await fs.readDir(qtRoot);
    const versions = entries.filter((name) => /^\d+(?:\.\d+)+$/.test(name)).sort(compareVersions).reverse().slice(0, 4);
    for (const version of versions) {
      if (seenQt.has(version)) continue;
      const versionDir = path.join(qtRoot, version);
      const kits = qtKitsOf(await fs.readDir(versionDir));
      if (kits.length === 0) continue;
      seenQt.add(version);
      tools.push({
        name: 'Qt',
        kind: 'framework',
        version,
        path: versionDir,
        source: 'Qt installer',
        detail: `kits: ${kits.join(', ')}`,
      });
    }
  }

  const vcpkgRoots = [env['VCPKG_ROOT'], 'C:\\vcpkg', 'C:\\dev\\vcpkg', 'C:\\tools\\vcpkg'].filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  for (const root of vcpkgRoots) {
    if (await fs.exists(path.join(root, 'vcpkg.exe'))) {
      tools.push({ name: 'vcpkg', kind: 'package-manager', path: root, source: 'vcpkg root' });
      break;
    }
  }

  return tools;
}

function dedupe(tools: ToolInfo[]): ToolInfo[] {
  const byKey = new Map<string, ToolInfo>();
  for (const tool of tools) {
    // Qt ships several versions side by side and each one matters; every other
    // name is a single tool, so a plain PATH hit replaces a bundled path only.
    const key = tool.name === 'Qt' ? `${tool.name}@${tool.version ?? ''}` : tool.name;
    const existing = byKey.get(key);
    if (!existing || (existing.version === undefined && tool.version !== undefined)) byKey.set(key, tool);
  }
  return [...byKey.values()].sort((a, b) => {
    const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (kind !== 0) return kind;
    return a.name.localeCompare(b.name);
  });
}

async function probeToolchain(options: DetectToolchainOptions): Promise<ToolchainInfo> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const fs = options.fs ?? DEFAULT_FS;
  const run = options.run ?? DEFAULT_RUN;

  // Both halves spawn processes, so they run together.
  const [pathTools, windowsTools] = await Promise.all([
    Promise.all(PATH_TOOLS.map((tool) => probePathTool(tool, { run, env, fs, platform }))),
    platform === 'win32'
      ? detectWindowsTools({ env, fs, run }).catch((): ToolInfo[] => {
          // System probing must never break the document.
          return [];
        })
      : Promise.resolve<ToolInfo[]>([]),
  ]);

  const tools = [...pathTools.filter((tool): tool is ToolInfo => tool !== undefined), ...windowsTools];

  return {
    platform,
    detectedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    tools: dedupe(tools),
  };
}

function isFresh(cached: ToolchainInfo, now: number): boolean {
  const detected = Date.parse(cached.detectedAt);
  if (Number.isNaN(detected)) return false;
  return now - detected >= 0 && now - detected < TOOLCHAIN_TTL_MS;
}

/**
 * Returns the tools installed on this machine.
 *
 * The cache keeps `check` and the watch loop from spawning dozens of processes
 * on every run; `refresh` forces a new probe.
 */
export async function detectToolchain(options: DetectToolchainOptions): Promise<ToolchainInfo> {
  const platform = options.platform ?? process.platform;
  const now = options.now?.() ?? Date.now();
  const cacheFile = path.join(options.root, TOOLCHAIN_CACHE_DIR, TOOLCHAIN_CACHE_FILE);

  if (!options.noCache && !options.refresh) {
    try {
      const cached = JSON.parse(await nodeFs.readFile(cacheFile, 'utf8')) as ToolchainInfo;
      if (cached && cached.platform === platform && Array.isArray(cached.tools) && isFresh(cached, now)) {
        return cached;
      }
    } catch {
      // Missing or unreadable cache: probe.
    }
  }

  const detected = await probeToolchain(options);

  if (!options.noCache) {
    try {
      await nodeFs.mkdir(path.join(options.root, TOOLCHAIN_CACHE_DIR), { recursive: true });
      await nodeFs.writeFile(cacheFile, `${JSON.stringify(detected, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only project must still produce a document.
    }
  }

  return detected;
}
