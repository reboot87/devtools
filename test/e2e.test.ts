import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectEnvironment } from '../src/core/env.ts';
import { renderAgentsMd } from '../src/render/agents-md.ts';
import { runCheck } from '../src/commands/check.ts';
import { runInit } from '../src/commands/init.ts';

async function fixtureProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-fixture-'));
  const write = async (relative: string, content: string) => {
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  };

  await write(
    'package.json',
    JSON.stringify(
      {
        name: 'fixture-app',
        version: '2.1.0',
        private: true,
        scripts: {
          dev: 'vite --port 5173',
          build: 'tsc -p tsconfig.build.json',
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
        },
        dependencies: { express: '^4.19.2', zod: '^3.23.8' },
        devDependencies: { typescript: '^5.8.3', vitest: '^2.1.0', eslint: '^9.5.0' },
        engines: { node: '>=20' },
      },
      null,
      2,
    ),
  );
  await write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  await write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022' } }, null, 2));
  await write('.eslintrc.json', JSON.stringify({ extends: 'eslint:recommended' }));
  await write('.env.example', '# database url\nDATABASE_URL=\n# api key for the upstream service\nAPI_KEY=changeme\n');
  await write('src/index.ts', "import express from 'express';\nexport const app = express();\n");
  await write('src/utils/format.ts', 'export const format = (v: string) => v.trim();\n');
  await write('tests/app.test.ts', "test('app', () => {});\n");
  await write('.github/workflows/ci.yml', 'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n');
  await write('README.md', '# fixture\n');

  return dir;
}

test('detects the environment of a node project', async () => {
  const dir = await fixtureProject();
  const snapshot = await collectEnvironment({ root: dir });

  assert.equal(snapshot.name, 'fixture-app');
  assert.equal(snapshot.packageManagers[0]?.name, 'pnpm');
  assert.equal(snapshot.packageManagers[0]?.lockfile, 'pnpm-lock.yaml');

  const commands = Object.fromEntries(snapshot.commands.map((command) => [command.purpose, command.command]));
  assert.equal(commands.install, 'pnpm install --frozen-lockfile');
  assert.equal(commands.dev, 'pnpm run dev');
  assert.equal(commands.test, 'pnpm run test');

  const frameworkNames = snapshot.frameworks.map((framework) => framework.name);
  assert.ok(frameworkNames.includes('Express'));
  assert.ok(frameworkNames.includes('Vitest'));
  assert.ok(frameworkNames.includes('TypeScript'));

  assert.ok(snapshot.configs.some((config) => config.path === 'tsconfig.json' && config.details.includes('strict mode on')));
  assert.ok(snapshot.ci.some((pipeline) => pipeline.provider === 'GitHub Actions'));

  const envNames = snapshot.envVars.map((variable) => variable.name);
  assert.ok(envNames.includes('DATABASE_URL'));
  assert.ok(envNames.includes('API_KEY'));

  const purposes = Object.fromEntries(snapshot.dirs.map((dir) => [dir.path, dir.purpose]));
  assert.equal(purposes['src'], 'source');
  assert.equal(purposes['tests'], 'tests');
  assert.equal(purposes['.github'], 'ci');
});

test('generates a document that states the facts an agent needs', async () => {
  const dir = await fixtureProject();
  const snapshot = await collectEnvironment({ root: dir });
  const document = renderAgentsMd(snapshot, { lang: 'en' });

  assert.ok(document.includes('pnpm install --frozen-lockfile'));
  assert.ok(document.includes('pnpm run test'));
  assert.ok(document.includes('`src/`'));
  assert.ok(document.includes('DATABASE_URL'));
  assert.ok(document.includes('Express'));
  assert.ok(!document.includes('undefined'));
});

test('the document does not embed the head commit, which would make it stale on every commit', async () => {
  const dir = await fixtureProject();
  const snapshot = await collectEnvironment({ root: dir });
  const document = renderAgentsMd(snapshot, { lang: 'en' });
  assert.ok(!document.includes(snapshot.git.lastCommit ?? '__no_commit__'));
});

test('init writes the file and check confirms it is current', async () => {
  const dir = await fixtureProject();
  const code = await runInit({
    root: dir,
    lang: 'en',
    install: false,
    dryRun: false,
    force: false,
    mirrors: [],
    outFile: 'AGENTS.md',
    selfInstall: false,
    quiet: true,
  });
  assert.equal(code, 0);

  const content = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(content.includes('pnpm install --frozen-lockfile'));

  const checkCode = await runCheck({
    root: dir,
    lang: 'en',
    outFile: 'AGENTS.md',
    json: false,
    quiet: true,
  });
  assert.equal(checkCode, 0);
});

test('check reports drift when the environment changes', async () => {
  const dir = await fixtureProject();
  await runInit({
    root: dir,
    lang: 'en',
    install: false,
    dryRun: false,
    force: false,
    mirrors: [],
    outFile: 'AGENTS.md',
    selfInstall: false,
    quiet: true,
  });

  const packageJsonPath = path.join(dir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as Record<string, unknown>;
  packageJson['scripts'] = { ...(packageJson['scripts'] as object), e2e: 'playwright test' };
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

  const checkCode = await runCheck({
    root: dir,
    lang: 'en',
    outFile: 'AGENTS.md',
    json: false,
    quiet: true,
  });
  assert.equal(checkCode, 1);
});
