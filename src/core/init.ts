// @ts-nocheck
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import fg from 'fast-glob';
import { DEFAULT_CONFIG, resolveConfigPath } from '../config.js';
import { info, warn, success } from '../log.js';

const APP_ROOTS = ['src', 'apps/**/src', 'services/**/src', 'libs/**/src'];

function buildPatterns(templates) {
  const out = [];
  for (const root of APP_ROOTS) {
    for (const tpl of templates) {
      out.push(`${root}/${tpl}`);
    }
  }
  return Array.from(new Set(out));
}

const FRAMEWORK_PRESETS = {
  auto: buildPatterns(['**/routes.{js,ts}', '**/*.routes.{js,ts}', '**/*.controller.ts', '**/*router.{js,ts}']),
  nestjs: buildPatterns(['**/*.controller.ts', '**/routes.ts', '**/*.routes.ts']),
  express: buildPatterns(['**/routes.{js,ts}', '**/*.routes.{js,ts}', '**/*router.{js,ts}']),
  hono: buildPatterns(['**/routes.{js,ts}', '**/*.routes.{js,ts}', '**/*.route.{js,ts}'])
};

function getPrompt() {
  return inquirer.prompt || (inquirer.default && inquirer.default.prompt);
}

function parseCsv(input) {
  return String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAppBaseUrls(input) {
  const entries = parseCsv(input);
  const map = {};
  for (const entry of entries) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    const app = entry.slice(0, idx).trim();
    const url = entry.slice(idx + 1).trim();
    if (!app || !url) continue;
    map[app] = url;
  }
  return map;
}

function stringifyAppBaseUrls(appMap) {
  return Object.entries(appMap || {})
    .map(([app, url]) => `${app}=${url}`)
    .join(',');
}

function normalizeAppName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultAppBaseUrls(appNames, startPort = 8000) {
  const map = {};
  appNames.forEach((appName, idx) => {
    map[appName] = `http://localhost:${startPort + idx}/api`;
  });
  return map;
}

async function detectAppNames(projectDir) {
  const files = await fg(
    [
      'apps/*/src/**/*.{ts,js}',
      'services/*/src/**/*.{ts,js}',
      'src/apps/*/**/*.{ts,js}',
      'src/services/*/**/*.{ts,js}'
    ],
    {
      cwd: projectDir,
      dot: false,
      absolute: false,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    }
  );

  const names = new Set();
  for (const file of files) {
    const match = file.match(/(?:^|\/)(?:apps|services)\/([^/]+)\//i);
    if (!match || !match[1]) continue;
    const normalized = normalizeAppName(match[1]);
    if (normalized) names.add(normalized);
  }

  return Array.from(names).sort();
}

function prettyFramework(framework) {
  if (framework === 'nestjs') return 'NestJS';
  if (framework === 'express') return 'Express';
  if (framework === 'hono') return 'Hono';
  return 'Auto-detect';
}

function getIncludePreset(framework) {
  return FRAMEWORK_PRESETS[framework] || FRAMEWORK_PRESETS.auto;
}

async function readPackageJson(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!await fs.pathExists(pkgPath)) return null;
  try {
    return await fs.readJson(pkgPath);
  } catch {
    return null;
  }
}

function hasAnyDependency(pkg, names) {
  const all = {
    ...(pkg && pkg.dependencies ? pkg.dependencies : {}),
    ...(pkg && pkg.devDependencies ? pkg.devDependencies : {}),
    ...(pkg && pkg.peerDependencies ? pkg.peerDependencies : {})
  };
  return names.some((name) => !!all[name]);
}

async function detectFramework(projectDir) {
  const scores = { nestjs: 0, express: 0, hono: 0 };
  let grpcDetected = false;

  const pkg = await readPackageJson(projectDir);
  if (pkg) {
    if (hasAnyDependency(pkg, ['@nestjs/common', '@nestjs/core', '@nestjs/microservices'])) {
      scores.nestjs += 6;
    }
    if (hasAnyDependency(pkg, ['hono', '@hono/node-server', '@hono/zod-openapi'])) {
      scores.hono += 6;
    }
    if (hasAnyDependency(pkg, ['express'])) {
      scores.express += 6;
    }
    if (hasAnyDependency(pkg, ['@grpc/grpc-js', '@grpc/proto-loader'])) {
      scores.nestjs += 2;
      grpcDetected = true;
    }
  }

  const files = await fg(
    [
      '**/*.controller.ts',
      '**/*.routes.{js,ts}',
      '**/routes.{js,ts}',
      '**/*router.{js,ts}',
      '**/*hono*.{js,ts}',
      '**/*grpc*.controller.ts',
      '**/*.proto'
    ],
    {
      cwd: projectDir,
      dot: false,
      absolute: false,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/.nuxt/**', '**/.git/**']
    }
  );

  if (files.some((f) => /\.controller\.ts$/i.test(f))) scores.nestjs += 2;
  if (files.some((f) => /routes\.ts$/i.test(f) || /\.routes\.ts$/i.test(f))) {
    scores.nestjs += 1;
    scores.hono += 2;
    scores.express += 2;
  }
  if (files.some((f) => /router\.(js|ts)$/i.test(f))) scores.express += 3;
  if (files.some((f) => /hono/i.test(f))) scores.hono += 3;

  if (files.some((f) => /grpc.*\.controller\.ts$/i.test(f) || /\.grpc\./i.test(f))) {
    scores.nestjs += 3;
    grpcDetected = true;
  }
  if (files.some((f) => /\.proto$/i.test(f))) {
    scores.nestjs += 2;
    grpcDetected = true;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1] === 0) {
    return { framework: 'auto', grpcDetected: false, reason: 'No strong framework signal found.' };
  }

  if (second && second[1] === top[1]) {
    return { framework: 'auto', grpcDetected, reason: 'Multiple framework signals detected.' };
  }

  return {
    framework: top[0],
    grpcDetected,
    reason: 'Detected from package dependencies and source files.'
  };
}

async function initConfig({ baseDir } = {}) {
  const prompt = getPrompt();
  if (!prompt) {
    throw new Error('Inquirer prompt not available. Please use Node 18+ and reinstall dependencies.');
  }

  const resolved = await resolveConfigPath(undefined, baseDir);
  const targetPath = resolved.path;
  const projectDir = resolved.baseDir || process.cwd();

  if (await fs.pathExists(targetPath)) {
    warn(`Config already exists at ${targetPath}`);
    const { overwrite } = await prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Overwrite existing config?',
        default: false
      }
    ]);
    if (!overwrite) return;
  }

  const detected = await detectFramework(projectDir);
  const detectedApps = await detectAppNames(projectDir);
  if (detected.framework !== 'auto') {
    const grpcNote = detected.grpcDetected ? ' + gRPC/microservice controllers' : '';
    info(`Detected framework: ${prettyFramework(detected.framework)}${grpcNote}`);
  } else {
    info(detected.reason);
  }
  if (detectedApps.length > 1) {
    info(`Detected multi-app layout: ${detectedApps.join(', ')}`);
  }

  const frameworkChoices = [
    { name: 'Auto-detect', value: 'auto' },
    { name: 'NestJS (HTTP + gRPC)', value: 'nestjs' },
    { name: 'Express', value: 'express' },
    { name: 'Hono', value: 'hono' }
  ];

  const defaultBaseUrlMode = (detectedApps.length > 1 || detected.grpcDetected) ? 'multi' : 'single';
  const suggestedApps = detectedApps.length ? detectedApps : ['app1', 'app2'];
  const suggestedMultiBaseUrls = stringifyAppBaseUrls(defaultAppBaseUrls(suggestedApps));

  const answers = await prompt([
    {
      type: 'list',
      name: 'framework',
      message: 'Which framework do you use?',
      choices: frameworkChoices,
      default: detected.framework
    },
    {
      type: 'confirm',
      name: 'advanced',
      message: 'Customize file glob patterns manually?',
      default: false
    },
    {
      type: 'input',
      name: 'include',
      message: 'Glob(s) for route/controller files (comma-separated):',
      default: (a) => getIncludePreset(a.framework).join(','),
      when: (a) => a.advanced
    },
    {
      type: 'input',
      name: 'exclude',
      message: 'Glob(s) to exclude (comma-separated):',
      default: DEFAULT_CONFIG.sources.exclude.join(','),
      when: (a) => a.advanced
    },
    {
      type: 'list',
      name: 'baseUrlMode',
      message: 'How should base URLs be configured?',
      choices: [
        { name: 'Single base URL (one app)', value: 'single' },
        { name: 'Multiple app URLs (microservices)', value: 'multi' }
      ],
      default: defaultBaseUrlMode
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL for collections:',
      default: DEFAULT_CONFIG.sources.baseUrl,
      when: (a) => a.baseUrlMode === 'single'
    },
    {
      type: 'input',
      name: 'appBaseUrls',
      message: 'App base URLs (app=url, comma-separated):',
      default: suggestedMultiBaseUrls,
      when: (a) => a.baseUrlMode === 'multi',
      validate: (value) => {
        const parsed = parseAppBaseUrls(value);
        return Object.keys(parsed).length > 0
          ? true
          : 'Provide at least one pair like auth=http://localhost:8000/api';
      }
    },
    {
      type: 'confirm',
      name: 'postmanEnabled',
      message: 'Generate Postman collection?',
      default: true
    },
    {
      type: 'input',
      name: 'postmanPath',
      message: 'Postman output path:',
      default: DEFAULT_CONFIG.output.postman.outputPath,
      when: (a) => a.postmanEnabled
    },
    {
      type: 'confirm',
      name: 'insomniaEnabled',
      message: 'Generate Insomnia collection?',
      default: true
    },
    {
      type: 'input',
      name: 'insomniaPath',
      message: 'Insomnia output path:',
      default: DEFAULT_CONFIG.output.insomnia.outputPath,
      when: (a) => a.insomniaEnabled
    }
  ]);

  const include = answers.advanced
    ? parseCsv(answers.include)
    : getIncludePreset(answers.framework);
  const exclude = answers.advanced
    ? parseCsv(answers.exclude)
    : DEFAULT_CONFIG.sources.exclude;
  const appBaseUrls = answers.baseUrlMode === 'multi'
    ? parseAppBaseUrls(answers.appBaseUrls)
    : undefined;
  const baseUrl = answers.baseUrlMode === 'multi'
    ? (Object.values(appBaseUrls)[0] || DEFAULT_CONFIG.sources.baseUrl)
    : answers.baseUrl;

  const config = {
    framework: answers.framework,
    sources: {
      include,
      exclude,
      baseUrl,
      ...(appBaseUrls ? { appBaseUrls } : {})
    },
    output: {
      postman: {
        enabled: !!answers.postmanEnabled,
        outputPath: answers.postmanPath
      },
      insomnia: {
        enabled: !!answers.insomniaEnabled,
        outputPath: answers.insomniaPath
      }
    },
    watch: {
      enabled: true,
      debounce: DEFAULT_CONFIG.watch.debounce
    },
    merge: {
      markDeprecated: true
    },
    organization: {
      groupBy: 'folder'
    }
  };

  const contents = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
  await fs.outputFile(targetPath, contents);
  info(`Saved config to ${targetPath}`);
  success('Done');
}

export { initConfig };
