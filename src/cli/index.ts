#!/usr/bin/env node
import dotenv from 'dotenv';
import { program } from 'commander';
import { generateCommand, runCommand } from './commands.js';
import { initConfig } from '../core/init.js';
import { syncOnce } from '../core/sync.js';
import { watchMode } from '../core/watch.js';

dotenv.config();

program
  .name('postflame')
  .description('Generate and sync API collections from Hono, NestJS, and Express projects')
  .action(async () => {
    await syncOnce();
  });

program
  .command('generate')
  .aliases(['gen', 'g'])
  .description('Generate Postman collection from detected Hono app exports')
  .option('-i, --input <file>', 'Path to app file or directory')
  .option('-o, --output <file>', 'Output file path', 'postman.json')
  .option('-a, --all', 'Generate from all detected app files')
  .option('--base-url <url>', 'Base URL variable value')
  .option('--app-urls <value>', 'App URL map (app=url, comma-separated)')
  .option('-p, --push', 'Upload to Postman (requires POSTMAN_API_KEY)')
  .action(async (opts) => {
    await generateCommand({
      input: opts.input,
      output: opts.output,
      all: opts.all,
      baseUrl: opts.baseUrl,
      appUrls: opts.appUrls,
      push: opts.push
    });
  });

program
  .command('run')
  .alias('r')
  .description('Alias for generate')
  .option('-i, --input <file>', 'Path to app file or directory')
  .option('-o, --output <file>', 'Output file path', 'postman.json')
  .option('-a, --all', 'Generate from all detected app files')
  .option('--base-url <url>', 'Base URL variable value')
  .option('--app-urls <value>', 'App URL map (app=url, comma-separated)')
  .option('-p, --push', 'Upload to Postman (requires POSTMAN_API_KEY)')
  .action(async (opts) => {
    await runCommand({
      input: opts.input,
      output: opts.output,
      all: opts.all,
      baseUrl: opts.baseUrl,
      appUrls: opts.appUrls,
      push: opts.push
    });
  });

program
  .command('init')
  .description('Create postflame.config.js')
  .option('--cwd <path>', 'Project root for config')
  .action(async (opts) => {
    await initConfig({ baseDir: opts.cwd });
  });

program
  .command('sync')
  .description('One-time collection sync')
  .option('-c, --config <path>', 'Path to config file OR project directory')
  .option('--cwd <path>', 'Project root (used for config + globs)')
  .option('--postman-key <key>', 'Postman API key')
  .option('--postman-id <id>', 'Postman collection UID')
  .action(async (opts) => {
    await syncOnce({
      configPath: opts.config,
      baseDir: opts.cwd,
      postmanKey: opts.postmanKey,
      postmanId: opts.postmanId
    });
  });

program
  .command('watch')
  .description('Watch for changes and sync collections')
  .option('-c, --config <path>', 'Path to config file OR project directory')
  .option('--cwd <path>', 'Project root (used for config + globs)')
  .option('--postman-key <key>', 'Postman API key')
  .option('--postman-id <id>', 'Postman collection UID')
  .action(async (opts) => {
    await watchMode({
      configPath: opts.config,
      baseDir: opts.cwd,
      postmanKey: opts.postmanKey,
      postmanId: opts.postmanId
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`❌ ${err.message || err}`);
  process.exit(1);
});
