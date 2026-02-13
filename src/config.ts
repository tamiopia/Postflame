// @ts-nocheck
import path from 'path';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';

const ALWAYS_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts'];
const CONFIG_FILE_NAME = 'postflame.config.js';

const DEFAULT_INCLUDE = [
  'src/**/routes.{js,ts}',
  'src/**/*.routes.{js,ts}',
  'src/**/*.controller.ts',
  'src/**/*router.{js,ts}',
  'apps/**/src/**/routes.{js,ts}',
  'apps/**/src/**/*.routes.{js,ts}',
  'apps/**/src/**/*.controller.ts',
  'apps/**/src/**/*router.{js,ts}',
  'services/**/src/**/routes.{js,ts}',
  'services/**/src/**/*.routes.{js,ts}',
  'services/**/src/**/*.controller.ts',
  'services/**/src/**/*router.{js,ts}',
  'libs/**/src/**/routes.{js,ts}',
  'libs/**/src/**/*.routes.{js,ts}',
  'libs/**/src/**/*.controller.ts',
  'libs/**/src/**/*router.{js,ts}'
];

const DEFAULT_CONFIG = {
  framework: 'auto',
  sources: {
    include: DEFAULT_INCLUDE,
    exclude: ['**/*.spec.ts', '**/*.test.ts', 'node_modules/**', 'dist/**', 'build/**'],
    baseUrl: 'http://localhost:3000/api'
  },
  output: {
    postman: {
      enabled: true,
      outputPath: './collections/postman-collection.json'
    },
    insomnia: {
      enabled: true,
      outputPath: './collections/insomnia-collection.json'
    }
  },
  watch: {
    enabled: true,
    debounce: 300
  },
  merge: {
    markDeprecated: true
  },
  organization: {
    groupBy: 'folder'
  }
};

async function resolveConfigPath(configPath, baseDir) {
  let cwd = baseDir ? path.resolve(baseDir) : process.cwd();

  if (configPath) {
    const abs = path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
    if (await fs.pathExists(abs)) {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        cwd = abs;
        return { path: path.resolve(cwd, CONFIG_FILE_NAME), baseDir: cwd };
      }
      return { path: abs, baseDir: path.dirname(abs) };
    }
    if (!path.extname(abs)) {
      cwd = abs;
      return { path: path.resolve(cwd, CONFIG_FILE_NAME), baseDir: cwd };
    }
    return { path: abs, baseDir: cwd };
  }

  return { path: path.resolve(cwd, CONFIG_FILE_NAME), baseDir: cwd };
}

async function importUserConfig(configFilePath) {
  const fileUrl = pathToFileURL(configFilePath).href;
  const imported = await import(fileUrl);
  return imported?.default || imported;
}

async function loadConfig(configPath, baseDir) {
  const resolved = await resolveConfigPath(configPath, baseDir);
  if (await fs.pathExists(resolved.path)) {
    const userConfig = await importUserConfig(resolved.path);
    return {
      config: mergeDeep(DEFAULT_CONFIG, userConfig),
      path: resolved.path,
      baseDir: resolved.baseDir
    };
  }
  return { config: DEFAULT_CONFIG, path: resolved.path, baseDir: resolved.baseDir };
}

function mergeDeep(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  if (typeof base === 'object' && base && typeof override === 'object' && override) {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = mergeDeep(base[key], override[key]);
    }
    return out;
  }
  return override === undefined ? base : override;
}

function ensureAbsolute(pathLike, baseDir) {
  if (!pathLike) return pathLike;
  if (path.isAbsolute(pathLike)) return pathLike;
  const cwd = baseDir ? path.resolve(baseDir) : process.cwd();
  return path.resolve(cwd, pathLike);
}

const GLOB_CHARS = /[*?[\]{}!]/;

function looksLikeGlob(pattern) {
  return GLOB_CHARS.test(pattern);
}

function normalizePattern(entry, baseDir, isInclude) {
  if (!entry) return [];
  const trimmed = entry.trim();
  if (!trimmed) return [];

  if (looksLikeGlob(trimmed)) return [trimmed];

  const cwd = baseDir ? path.resolve(baseDir) : process.cwd();
  const abs = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);

  if (fs.existsSync(abs)) {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      return [path.join(trimmed, isInclude ? '**/*.{ts,js,tsx,jsx}' : '**')];
    }
    return [trimmed];
  }

  if (!trimmed.includes('/') && !trimmed.includes('\\')) {
    const ext = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
    if (ext) return [isInclude ? `**/*.${ext}` : `**/*.${ext}`];
  }

  return [trimmed];
}

function normalizeIncludePatterns(patterns, baseDir) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.flatMap((p) => normalizePattern(p, baseDir, true));
}

function normalizeExcludePatterns(patterns, baseDir) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const normalized = list.flatMap((p) => normalizePattern(p, baseDir, false));
  return Array.from(new Set([...normalized, ...ALWAYS_EXCLUDE]));
}

export {
  DEFAULT_INCLUDE,
  DEFAULT_CONFIG,
  resolveConfigPath,
  loadConfig,
  ensureAbsolute,
  normalizeIncludePatterns,
  normalizeExcludePatterns,
  ALWAYS_EXCLUDE
};
