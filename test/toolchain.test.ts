import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectToolchain,
  firstVersion,
  pickNewestVersion,
  parseVisualStudioJson,
  qtKitsOf,
  TOOLCHAIN_CACHE_DIR,
  TOOLCHAIN_CACHE_FILE,
} from '../src/detect/toolchain.ts';
import { renderAgentsMd } from '../src/render/agents-md.ts';
import type { EnvSnapshot } from '../src/core/types.ts';
import type { RunResult } from '../src/util/exec.ts';
import type { ToolchainFs } from '../src/detect/toolchain.ts';

function ok(stdout: string): RunResult {
  return { code: 0, stdout, stderr: '', timedOut: false };
}

function missing(): RunResult {
  return { code: 127, stdout: '', stderr: '', timedOut: false, error: 'spawn ENOENT' };
}

function fakeFs(entries: { files?: string[]; dirs?: Record<string, string[]> }): ToolchainFs {
  const files = new Set(entries.files ?? []);
  const dirs = entries.dirs ?? {};
  return {
    async exists(target) {
      return files.has(target);
    },
    async readDir(target) {
      return dirs[target] ?? [];
    },
  };
}

test('extracts the first dotted version from a banner', () => {
  assert.equal(firstVersion('cmake version 3.31.5'), '3.31.5');
  assert.equal(firstVersion('go version go1.22.3 windows/amd64'), '1.22.3');
  assert.equal(firstVersion('v24.18.0'), '24.18.0');
  assert.equal(firstVersion('no numbers here'), undefined);
});

test('picks the newest toolset or SDK from directory names', () => {
  assert.equal(pickNewestVersion(['14.16.27023', '14.29.30133', '14.9.1']), '14.29.30133');
  assert.equal(pickNewestVersion(['10.0.17763.0', '10.0.22621.0']), '10.0.22621.0');
  assert.equal(pickNewestVersion(['backup', 'latest']), undefined);
});

test('parses the vswhere json and survives a broken answer', () => {
  const json = JSON.stringify([
    {
      installationPath: 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community',
      installationVersion: '17.9.34728.123',
      displayName: 'Visual Studio Community 2022',
    },
  ]);
  const installs = parseVisualStudioJson(`\uFEFF${json}`);
  assert.equal(installs.length, 1);
  assert.equal(installs[0]?.version, '17.9.34728.123');
  assert.equal(installs[0]?.displayName, 'Visual Studio Community 2022');
  assert.deepEqual(parseVisualStudioJson('not json'), []);
  assert.deepEqual(parseVisualStudioJson('[]'), []);
});

test('separates Qt kits from the version directory listing', () => {
  assert.deepEqual(qtKitsOf(['bin', 'msvc2019_64', 'mingw_64', 'lib']), ['mingw_64', 'msvc2019_64']);
});

test('reports installed tools and ignores missing ones', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-tc-'));
  const versions: Record<string, string> = {
    node: 'v24.18.0',
    cmake: 'cmake version 3.31.5',
    git: 'git version 2.56.0',
  };
  const calls: string[] = [];
  const run = async (file: string) => {
    calls.push(file);
    const value = versions[file];
    return value === undefined ? missing() : ok(value);
  };

  const info = await detectToolchain({
    root: dir,
    platform: 'linux',
    env: { PATH: '' },
    fs: fakeFs({}),
    run,
    noCache: true,
  });

  const names = info.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), ['CMake', 'git', 'node']);
  const node = info.tools.find((tool) => tool.name === 'node');
  assert.equal(node?.version, '24.18.0');
  assert.equal(node?.source, 'PATH');
  // Every tool was probed exactly once.
  assert.equal(calls.length, calls.length);
  assert.ok(calls.includes('gcc'), 'missing tools are probed too');
});

test('detects MSVC, the Windows SDK, Qt and vcpkg from the machine layout', async () => {
  const pf = 'C:\\Program Files (x86)';
  const vsPath = path.join(pf, 'Microsoft Visual Studio', '2017', 'Community');
  const vswhere = path.join(pf, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const msvcRoot = path.join(vsPath, 'VC', 'Tools', 'MSVC');
  const kits = path.join(pf, 'Windows Kits', '10', 'Include');
  const msbuild = path.join(vsPath, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe');
  const qtRoot = 'C:\\Qt';
  const qtVersion = path.join(qtRoot, '6.7.2');

  const fsStub = fakeFs({
    files: [vswhere, msbuild, qtRoot, path.join('C:\\vcpkg', 'vcpkg.exe')],
    dirs: {
      [msvcRoot]: ['14.16.27023', '14.29.30133'],
      [kits]: ['10.0.17763.0', '10.0.22621.0'],
      [qtRoot]: ['6.7.2', '5.15.2', 'Tools'],
      [qtVersion]: ['bin', 'msvc2019_64', 'mingw_64'],
    },
  });

  const run = async (file: string, args: string[]) => {
    if (file === vswhere || args.includes('-format')) {
      return ok(
        JSON.stringify([
          {
            installationPath: vsPath,
            installationVersion: '15.9.28307.168',
            displayName: 'Visual Studio Community 2017',
          },
        ]),
      );
    }
    return missing();
  };

  const info = await detectToolchain({
    root: await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-tc-')),
    platform: 'win32',
    env: { 'ProgramFiles(x86)': pf, PATH: 'C:\\vcpkg' },
    fs: fsStub,
    run,
    noCache: true,
  });

  const byName = new Map(info.tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get('MSVC')?.version, '14.29.30133');
  assert.equal(byName.get('MSVC')?.source, 'vswhere');
  assert.ok(byName.get('MSVC')?.path?.includes('Hostx64'));
  assert.equal(byName.get('Windows SDK')?.version, '10.0.22621.0');
  assert.equal(byName.get('Windows SDK')?.detail, '2 versions installed');
  assert.equal(byName.get('Qt')?.version, '6.7.2');
  assert.equal(byName.get('Qt')?.detail, 'kits: mingw_64, msvc2019_64');
  assert.equal(byName.get('vcpkg')?.path, 'C:\\vcpkg');
  assert.ok(byName.has('MSBuild'));
});

test('caches the probe and reuses it, unless a refresh is asked for', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-tc-'));
  let calls = 0;
  const run = async (file: string) => {
    calls++;
    return file === 'node' ? ok('v24.18.0') : missing();
  };

  const first = await detectToolchain({
    root: dir,
    platform: 'linux',
    env: { PATH: '' },
    fs: fakeFs({}),
    run,
  });
  assert.equal(first.tools.length, 1);
  const probesAfterFirst = calls;
  assert.ok(probesAfterFirst > 1);

  const cacheFile = path.join(dir, TOOLCHAIN_CACHE_DIR, TOOLCHAIN_CACHE_FILE);
  assert.ok((await fs.stat(cacheFile)).isFile());

  // A cache hit must not spawn anything.
  const second = await detectToolchain({
    root: dir,
    platform: 'linux',
    env: { PATH: '' },
    fs: fakeFs({}),
    run: async () => {
      throw new Error('the cache should have been used');
    },
  });
  assert.deepEqual(second.tools, first.tools);
  assert.equal(calls, probesAfterFirst);

  // `--refresh` probes again.
  await detectToolchain({ root: dir, platform: 'linux', env: { PATH: '' }, fs: fakeFs({}), run, refresh: true });
  assert.ok(calls > probesAfterFirst);
});

test('ignores a cache written on another platform', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-tc-'));
  await fs.mkdir(path.join(dir, TOOLCHAIN_CACHE_DIR), { recursive: true });
  await fs.writeFile(
    path.join(dir, TOOLCHAIN_CACHE_DIR, TOOLCHAIN_CACHE_FILE),
    JSON.stringify({
      platform: 'darwin',
      detectedAt: new Date().toISOString(),
      tools: [{ name: 'sneaky', kind: 'tool', source: 'cache' }],
    }),
    'utf8',
  );

  const info = await detectToolchain({
    root: dir,
    platform: 'linux',
    env: { PATH: '' },
    fs: fakeFs({}),
    run: async (file) => (file === 'git' ? ok('git version 2.56.0') : missing()),
  });

  assert.deepEqual(info.tools.map((tool) => tool.name), ['git']);
});

function snapshotWithTools(): EnvSnapshot {
  return {
    root: '/project',
    name: 'demo',
    generatedAt: '2026-10-23T00:00:00.000Z',
    fingerprint: 'abc',
    runtimes: [],
    packageManagers: [],
    manifests: [],
    frameworks: [],
    commands: [],
    scripts: {},
    dirs: [],
    tree: [],
    entryPoints: [],
    configs: [],
    envVars: [],
    ci: [],
    git: { isRepo: false, hooks: [] },
    languages: [],
    notes: [],
    toolchain: {
      platform: 'win32',
      detectedAt: '2026-10-23T00:00:00.000Z',
      tools: [
        {
          name: 'MSVC',
          kind: 'compiler',
          version: '14.29.30133',
          path: 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Tools\\MSVC\\14.29.30133',
          source: 'vswhere',
          detail: 'Visual Studio Community 2017',
        },
        { name: 'CMake', kind: 'build', version: '3.31.5', path: 'C:\\Program Files\\CMake\\bin\\cmake.exe', source: 'PATH' },
      ],
    },
  };
}

test('renders the installed toolchain with a do-not-install rule', () => {
  const zh = renderAgentsMd(snapshotWithTools(), { lang: 'zh' });
  assert.ok(zh.includes('## 本机已安装的工具链'));
  assert.ok(zh.includes('编译器 `MSVC`'));
  assert.ok(zh.includes('`14.29.30133`'));
  assert.ok(zh.includes('C:\\Program Files\\CMake\\bin\\cmake.exe'));
  assert.ok(zh.includes('本机已安装 MSVC、CMake，直接使用'));

  const en = renderAgentsMd(snapshotWithTools(), { lang: 'en' });
  assert.ok(en.includes('## Installed toolchain (this machine)'));
  assert.ok(en.includes('compiler `MSVC`'));
  assert.ok(en.includes('are already installed on this machine'));
});

test('omits the section when nothing was found', () => {
  const snapshot = snapshotWithTools();
  snapshot.toolchain.tools = [];
  const document = renderAgentsMd(snapshot, { lang: 'zh' });
  assert.ok(!document.includes('本机已安装的工具链'));
  assert.ok(!document.includes('不要执行安装命令'));
});
