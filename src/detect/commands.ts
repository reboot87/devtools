import type { CommandInfo, CommandPurpose, ConfigInfo, FrameworkInfo, PackageManagerInfo } from '../core/types.ts';
import type { ManifestBundle } from './manifests.ts';

const SCRIPT_ALIASES: Record<CommandPurpose, string[]> = {
  install: [],
  dev: ['dev', 'start:dev', 'develop', 'serve', 'watch', 'start'],
  build: ['build', 'compile', 'build:prod'],
  start: ['start', 'serve', 'preview'],
  test: ['test', 'test:unit', 'test:ci'],
  lint: ['lint', 'lint:check'],
  typecheck: ['typecheck', 'type-check', 'types', 'tsc'],
  format: ['format', 'fmt', 'format:check'],
  release: ['release', 'publish'],
  clean: ['clean'],
};

function hasFramework(frameworks: FrameworkInfo[], name: string): boolean {
  return frameworks.some((f) => f.name === name);
}

/** The command that runs a package.json script through the package manager. */
function scriptRunner(manager: string | undefined): string {
  switch (manager) {
    case 'pnpm':
      return 'pnpm run';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun run';
    default:
      return 'npm run';
  }
}

export function deriveCommands(
  bundle: ManifestBundle,
  packageManager: PackageManagerInfo | undefined,
  frameworks: FrameworkInfo[],
  configs: ConfigInfo[] = [],
): CommandInfo[] {
  const commands: CommandInfo[] = [];
  const managerName = packageManager?.name;
  const runner = scriptRunner(managerName);
  const scripts = bundle.packageJson?.scripts ?? {};
  const hasConfig = (needle: string) => configs.some((config) => config.path.includes(needle));

  const pushScript = (purpose: CommandPurpose, scriptNames: string[]) => {
    for (const scriptName of scriptNames) {
      const script = scripts[scriptName];
      if (script) {
        commands.push({
          purpose,
          command: `${runner} ${scriptName}`,
          source: 'script',
          note: `package.json script "${scriptName}"`,
        });
        return true;
      }
    }
    return false;
  };

  // ---- install ------------------------------------------------------------
  if (packageManager?.installCommand) {
    commands.push({
      purpose: 'install',
      command: packageManager.installCommand,
      source: 'inferred',
      note: packageManager.lockfile ? `lockfile ${packageManager.lockfile}` : 'detected package manager',
    });
  }

  // ---- node scripts -------------------------------------------------------
  pushScript('dev', SCRIPT_ALIASES.dev);
  pushScript('build', SCRIPT_ALIASES.build);
  pushScript('start', SCRIPT_ALIASES.start);
  pushScript('test', SCRIPT_ALIASES.test);
  pushScript('lint', SCRIPT_ALIASES.lint);
  pushScript('typecheck', SCRIPT_ALIASES.typecheck);
  pushScript('format', SCRIPT_ALIASES.format);
  pushScript('release', SCRIPT_ALIASES.release);
  pushScript('clean', SCRIPT_ALIASES.clean);

  // ---- ecosystem defaults -------------------------------------------------
  if (!commands.some((c) => c.purpose === 'test')) {
    if (hasFramework(frameworks, 'pytest')) {
      commands.push({ purpose: 'test', command: 'pytest', source: 'inferred', note: 'pytest detected' });
    } else if (bundle.has('manage.py') || hasFramework(frameworks, 'Django')) {
      commands.push({ purpose: 'test', command: 'python manage.py test', source: 'inferred', note: 'Django project' });
    } else if (bundle.rust) {
      commands.push({ purpose: 'test', command: 'cargo test', source: 'inferred', note: 'Cargo project' });
    } else if (bundle.go) {
      commands.push({ purpose: 'test', command: 'go test ./...', source: 'inferred', note: 'Go module' });
    } else if (hasFramework(frameworks, 'PHPUnit')) {
      commands.push({ purpose: 'test', command: 'composer test', source: 'inferred', note: 'Composer project' });
    } else if (bundle.has('Gemfile')) {
      commands.push({ purpose: 'test', command: 'bundle exec rspec', source: 'inferred', note: 'Bundler project' });
    } else if (hasFramework(frameworks, 'Vitest')) {
      commands.push({ purpose: 'test', command: 'npx vitest run', source: 'inferred', note: 'Vitest detected' });
    } else if (hasFramework(frameworks, 'Jest')) {
      commands.push({ purpose: 'test', command: 'npx jest', source: 'inferred', note: 'Jest detected' });
    } else if (hasFramework(frameworks, 'Playwright')) {
      commands.push({ purpose: 'test', command: 'npx playwright test', source: 'inferred', note: 'Playwright detected' });
    }
  }

  if (!commands.some((c) => c.purpose === 'build')) {
    if (bundle.rust) {
      commands.push({ purpose: 'build', command: 'cargo build --release', source: 'inferred', note: 'Cargo project' });
    } else if (bundle.go) {
      commands.push({ purpose: 'build', command: 'go build ./...', source: 'inferred', note: 'Go module' });
    } else if (hasFramework(frameworks, 'Django')) {
      commands.push({ purpose: 'build', command: 'python manage.py migrate', source: 'inferred', note: 'Django migrations' });
    } else {
      const solution = bundle.manifests.find((manifest) => manifest.type === 'Visual Studio solution');
      if (solution) {
        commands.push({
          purpose: 'build',
          command: `msbuild "${solution.path}"`,
          source: 'inferred',
          note: 'Visual Studio solution detected',
        });
      } else if (bundle.has('CMakeLists.txt')) {
        commands.push({
          purpose: 'build',
          command: 'cmake -S . -B build && cmake --build build',
          source: 'inferred',
          note: 'CMakeLists.txt detected',
        });
      } else if (bundle.has('Makefile')) {
        commands.push({ purpose: 'build', command: 'make', source: 'inferred', note: 'Makefile detected' });
      }
    }
  }

  if (!commands.some((c) => c.purpose === 'lint')) {
    if (hasFramework(frameworks, 'Biome')) {
      commands.push({ purpose: 'lint', command: 'npx biome check .', source: 'inferred', note: 'Biome detected' });
    } else if (hasFramework(frameworks, 'ESLint')) {
      commands.push({ purpose: 'lint', command: 'npx eslint .', source: 'inferred', note: 'ESLint detected' });
    } else if (hasFramework(frameworks, 'Ruff') || hasConfig('ruff')) {
      commands.push({ purpose: 'lint', command: 'ruff check .', source: 'inferred', note: 'Ruff detected' });
    } else if (bundle.rust) {
      commands.push({ purpose: 'lint', command: 'cargo clippy -- -D warnings', source: 'inferred', note: 'Cargo project' });
    } else if (bundle.go) {
      commands.push({ purpose: 'lint', command: 'go vet ./...', source: 'inferred', note: 'Go module' });
    }
  }

  if (!commands.some((c) => c.purpose === 'typecheck')) {
    if (hasFramework(frameworks, 'TypeScript')) {
      commands.push({ purpose: 'typecheck', command: 'npx tsc --noEmit', source: 'inferred', note: 'TypeScript detected' });
    } else if (hasConfig('mypy')) {
      commands.push({ purpose: 'typecheck', command: 'mypy .', source: 'inferred', note: 'mypy configuration found' });
    }
  }

  if (!commands.some((c) => c.purpose === 'format')) {
    if (hasFramework(frameworks, 'Prettier')) {
      commands.push({ purpose: 'format', command: 'npx prettier --write .', source: 'inferred', note: 'Prettier detected' });
    } else if (hasFramework(frameworks, 'Biome')) {
      commands.push({ purpose: 'format', command: 'npx biome format --write .', source: 'inferred', note: 'Biome detected' });
    } else if (hasFramework(frameworks, 'Ruff') || hasConfig('ruff')) {
      commands.push({ purpose: 'format', command: 'ruff format .', source: 'inferred', note: 'Ruff detected' });
    } else if (hasConfig('black')) {
      commands.push({ purpose: 'format', command: 'black .', source: 'inferred', note: 'Black configuration found' });
    } else if (bundle.rust) {
      commands.push({ purpose: 'format', command: 'cargo fmt', source: 'inferred', note: 'Cargo project' });
    }
  }

  return commands;
}
