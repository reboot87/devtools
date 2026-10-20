import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFrameworks } from '../src/detect/frameworks.ts';
import { deriveCommands } from '../src/detect/commands.ts';
import { pythonRequirementName } from '../src/detect/manifests.ts';
import type { ManifestBundle } from '../src/detect/manifests.ts';
import type { PackageManagerInfo } from '../src/core/types.ts';

function bundle(overrides: Partial<ManifestBundle> = {}): ManifestBundle {
  return {
    manifests: [],
    packageJson: undefined,
    python: undefined,
    rust: undefined,
    go: undefined,
    otherDependencies: [],
    has: () => false,
    ...overrides,
  };
}

test('detects frameworks from node dependencies', () => {
  const frameworks = detectFrameworks({
    dependencies: { next: '15.0.0', react: '19.0.0' },
    devDependencies: { vitest: '2.0.0', typescript: '5.8.0' },
    otherDependencies: [],
  });
  const names = frameworks.map((framework) => framework.name);
  assert.ok(names.includes('Next.js'));
  assert.ok(names.includes('React'));
  assert.ok(names.includes('Vitest'));
  assert.ok(names.includes('TypeScript'));
});

test('detects python frameworks from requirement strings', () => {
  const frameworks = detectFrameworks({
    dependencies: {},
    devDependencies: {},
    otherDependencies: [{ ecosystem: 'python', name: 'fastapi' }],
  });
  assert.ok(frameworks.some((framework) => framework.name === 'FastAPI'));
});

test('normalises python requirement names', () => {
  assert.equal(pythonRequirementName('fastapi>=0.110.0'), 'fastapi');
  assert.equal(pythonRequirementName('Django[argon2]==5.0'), 'django');
  assert.equal(pythonRequirementName('uvicorn'), 'uvicorn');
});

test('derives commands from package.json scripts', () => {
  const commands = deriveCommands(
    bundle({
      packageJson: {
        scripts: { dev: 'vite', build: 'vite build', test: 'vitest run', lint: 'eslint .' },
        dependencies: {},
        devDependencies: {},
      },
    }),
    { name: 'pnpm', installCommand: 'pnpm install --frozen-lockfile' } as PackageManagerInfo,
    [],
  );

  const byPurpose = Object.fromEntries(commands.map((command) => [command.purpose, command.command]));
  assert.equal(byPurpose.install, 'pnpm install --frozen-lockfile');
  assert.equal(byPurpose.dev, 'pnpm run dev');
  assert.equal(byPurpose.test, 'pnpm run test');
  assert.equal(byPurpose.lint, 'pnpm run lint');
});

test('falls back to ecosystem defaults when no script exists', () => {
  const commands = deriveCommands(
    bundle({ python: { dependencies: ['pytest'], packageManager: 'pip' } }),
    undefined,
    [{ name: 'pytest', role: 'test runner', source: 'pytest' }],
  );
  const byPurpose = Object.fromEntries(commands.map((command) => [command.purpose, command.command]));
  assert.equal(byPurpose.test, 'pytest');
});

test('never invents a test command when nothing indicates one', () => {
  const commands = deriveCommands(bundle(), undefined, []);
  assert.equal(commands.find((command) => command.purpose === 'test'), undefined);
});
