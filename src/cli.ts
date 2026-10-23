import { pathToFileURL } from 'node:url';
import { parseArgs, flagBoolean } from './core/args.ts';
import { parseInitOptions, runInit } from './commands/init.ts';
import { parseCheckOptions, runCheck } from './commands/check.ts';
import { parsePrintOptions, runPrint } from './commands/print.ts';
import { parseInstallOptions, runInstallCommand } from './commands/install.ts';
import { parseWatchOptions, runWatch } from './commands/watch.ts';
import { hookActionName, parseHookOptions, runHookCommand } from './commands/hook.ts';

const VERSION = '0.1.0';

const HELP = `devtools ${VERSION} - read the current development environment and keep AGENTS.md accurate

Usage:
  devtools agents init [options]     Generate or refresh AGENTS.md (and install dependencies)
  devtools agents check [options]     Verify that AGENTS.md still matches the environment
  devtools agents print [options]     Print the generated document to stdout
  devtools agents install [options]   Install dependencies with the detected package manager
  devtools agents watch [options]     Keep AGENTS.md in sync while the project changes
  devtools agents hook [install|uninstall] [options]
                        Install or remove a pre-commit hook that refreshes AGENTS.md

Options:
  --root <path>        Project root (default: detected from the current directory)
  --lang <zh|en>       Language of the generated document (default: zh)
  --out <file>         Output file name (default: AGENTS.md)
  --no-install         Do not install dependencies during init
  --dry-run            Print what would happen without changing anything
  --force              Overwrite the target completely (init: AGENTS.md, hook: the hook file)
  --mirror <list>      Also write the content to other agent conventions
                        (claude, gemini, copilot, cursor - comma separated)
  --self-install       Install devtools-agents into the project as a dev dependency
  --json               Machine readable output (print, check)
  --fix                Repair the document when check finds it out of date
  --command <cmd>      Command the installed hook runs (default: npx --no-install devtools-agents)
  --quiet              Only print errors
  --timeout <seconds>  Timeout for a single install command
  -h, --help           Show this help
  -v, --version        Show the version
`;

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (flagBoolean(args.flags, 'version', false) || args.positionals[0] === 'version') {
    console.log(VERSION);
    return;
  }

  if (flagBoolean(args.flags, 'help', false) || args.positionals.length === 0) {
    console.log(HELP);
    return;
  }

  const [group, action] = args.positionals;

  if (group !== 'agents') {
    console.error(`unknown command: ${group ?? '(none)'}`);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  switch (action) {
    case 'init': {
      process.exitCode = await runInit(parseInitOptions(args));
      return;
    }
    case 'check': {
      process.exitCode = await runCheck(parseCheckOptions(args));
      return;
    }
    case 'print': {
      process.exitCode = await runPrint(parsePrintOptions(args));
      return;
    }
    case 'install': {
      process.exitCode = await runInstallCommand(parseInstallOptions(args));
      return;
    }
    case 'watch': {
      process.exitCode = await runWatch(parseWatchOptions(args));
      return;
    }
    case 'hook': {
      const action = args.positionals[2];
      if (action !== undefined && hookActionName(action) === undefined) {
        console.error(`unknown hook command: ${action}`);
        console.log('  use `devtools agents hook install` or `devtools agents hook uninstall`');
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runHookCommand(parseHookOptions(args));
      return;
    }
    default: {
      console.error(`unknown agents command: ${action ?? '(none)'}`);
      console.log(HELP);
      process.exitCode = 1;
    }
  }
}

// Allow `node src/cli.ts ...` in development as well as the installed binary.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main(process.argv.slice(2));
}
