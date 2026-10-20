#!/usr/bin/env node
// Entry point for the `devtools` command.
// Prefers the compiled build (dist/cli.js) so a global install works everywhere,
// and falls back to the TypeScript sources (Node >= 22.18 strips types natively).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist', 'cli.js');
const src = join(here, '..', 'src', 'cli.ts');

const target = existsSync(dist) ? dist : src;
const { main } = await import(pathToFileURL(target).href);
await main(process.argv.slice(2));
