// @ts-nocheck
import fs from 'fs-extra';
import fg from 'fast-glob';
import path from 'path';
import {
  loadConfig,
  ensureAbsolute,
  normalizeIncludePatterns,
  normalizeExcludePatterns,
  ALWAYS_EXCLUDE,
  DEFAULT_INCLUDE
} from '../config.js';
import { extractAllEndpoints } from '../extractors/index.js';
import { mergePostmanCollection } from '../merge/postman.js';
import { mergeInsomniaCollection } from '../merge/insomnia.js';
import { pushToPostman } from '../sync/postman-cloud.js';
import { info, warn, success, error } from '../log.js';
import { isJsOrTs } from '../lib/utils.js';

async function syncOnce({ configPath, baseDir, postmanKey, postmanId } = {}) {
  try {
    const { config, baseDir: resolvedBase } = await loadConfig(configPath, baseDir);
    const cwd = resolvedBase || process.cwd();
    const postmanTargets = resolvePostmanTargets({ config, postmanKey, postmanId });

    const include = normalizeIncludePatterns(config.sources.include || [], cwd);
    const exclude = Array.from(new Set([
      ...normalizeExcludePatterns(config.sources.exclude || [], cwd),
      ...ALWAYS_EXCLUDE
    ]));

    let files = await fg(include, { ignore: exclude, dot: false, cwd, absolute: true });
    let jsTsFiles = files.filter(isJsOrTs);

    if (jsTsFiles.length === 0) {
      const fallbackInclude = normalizeIncludePatterns(DEFAULT_INCLUDE, cwd);
      files = await fg(fallbackInclude, { ignore: exclude, dot: false, cwd, absolute: true });
      jsTsFiles = files.filter(isJsOrTs);
      if (jsTsFiles.length > 0) {
        warn('No files matched configured include patterns. Falling back to default route/controller presets.');
      }
    }

    if (jsTsFiles.length === 0) {
      jsTsFiles = await autoDiscoverEndpointFiles(cwd, exclude);
      if (jsTsFiles.length > 0) {
        warn(`No files matched configured globs. Auto-discovered ${jsTsFiles.length} route/controller candidate file(s).`);
      }
    }

    info(`Scanning ${jsTsFiles.length} file(s)...`);
    if (jsTsFiles.length === 0) {
      warn(`No files matched. cwd=${cwd}`);
      warn(`include=${include.join(', ')}`);
      warn(`exclude=${exclude.join(', ')}`);
    }

    let extracted = [];
    try {
      extracted = await extractAllEndpoints(jsTsFiles, config.framework);
      if (extracted.length === 0 && config.framework && config.framework !== 'auto') {
        const fallback = await extractAllEndpoints(jsTsFiles, 'auto');
        if (fallback.length) {
          warn(`No endpoints found for framework=${config.framework}. Falling back to auto-detect.`);
          extracted = fallback;
        }
      }
    } catch (err) {
      warn(`Extraction failed: ${err.message || err}`);
    }

    const unique = new Map();
    for (const endpoint of extracted) {
      unique.set(endpoint.key, endpoint);
    }

    const finalEndpoints = Array.from(unique.values());
    info(`Found ${finalEndpoints.length} endpoint(s)`);

    if (config.output && config.output.postman && config.output.postman.enabled) {
      const outPath = ensureAbsolute(config.output.postman.outputPath, cwd);
      const existing = await readJsonIfExists(outPath);
      const merged = mergePostmanCollection(finalEndpoints, config, existing);
      await fs.outputJson(outPath, merged, { spaces: 2 });
      success(`Postman collection written to ${path.relative(process.cwd(), outPath)}`);

      if (postmanTargets.length > 0) {
        const validTargets = postmanTargets.filter((target) => target.apiKey && target.collectionId);
        const invalidTargets = postmanTargets.filter((target) => !target.apiKey || !target.collectionId);

        for (const invalid of invalidTargets) {
          warn(`Skipping Postman target "${invalid.label}": Missing API Key or Collection ID.`);
          if (!invalid.apiKey) warn('  -> API key is missing');
          if (!invalid.collectionId) warn('  -> Collection ID is missing');
        }

        for (const target of validTargets) {
          info(`Pushing to Postman Cloud (${target.label}, ID: ${target.collectionId})...`);
          try {
            await pushToPostman(merged, target.apiKey, target.collectionId);
            success(`Successfully synced "${target.label}" to Postman Cloud!`);
          } catch (err) {
            error(`Failed to sync "${target.label}" to Postman Cloud: ${err.message}`);
          }
        }
      }
    }

    if (config.output && config.output.insomnia && config.output.insomnia.enabled) {
      const outPath = ensureAbsolute(config.output.insomnia.outputPath, cwd);
      const existing = await readJsonIfExists(outPath);
      const merged = mergeInsomniaCollection(finalEndpoints, config, existing);
      await fs.outputJson(outPath, merged, { spaces: 2 });
      success(`Insomnia collection written to ${path.relative(process.cwd(), outPath)}`);
    }
  } catch (err) {
    error(err.stack || err.message || String(err));
    process.exitCode = 1;
  }
}

async function autoDiscoverEndpointFiles(cwd, exclude) {
  const discovered = await fg(['**/*.{ts,js,tsx,jsx}'], {
    cwd,
    absolute: true,
    dot: false,
    ignore: exclude
  });

  const candidates = discovered.filter((file) => {
    const normalized = file.replace(/\\/g, '/').toLowerCase();
    const base = path.basename(normalized);

    if (!isJsOrTs(file)) return false;
    if (base.endsWith('.d.ts') || base.endsWith('.d.tsx')) return false;

    if (/(^|\.)(routes?|router|controller)\.(t|j)sx?$/.test(base)) return true;
    if (/grpc.*controller\.(t|j)sx?$/.test(base)) return true;
    if (/\/routes?\//.test(normalized) && /\.(t|j)sx?$/.test(base)) return true;
    if (/\/controllers?\//.test(normalized) && /\.(t|j)sx?$/.test(base)) return true;

    return false;
  });

  return Array.from(new Set(candidates)).sort();
}

async function readJsonIfExists(filePath) {
  if (await fs.pathExists(filePath)) {
    try {
      return await fs.readJson(filePath);
    } catch (err) {
      warn(`Failed to read existing collection at ${filePath}: ${err.message || err}`);
      return null;
    }
  }
  return null;
}

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function envValue(name) {
  const key = cleanValue(name);
  if (!key) return '';
  return cleanValue(process.env[key]);
}

function normalizeTarget(input, fallbackLabel) {
  const label = cleanValue(input && input.label) || fallbackLabel;
  const apiKey = cleanValue(input && input.apiKey) || envValue(input && input.apiKeyEnv);
  const collectionId = cleanValue(input && input.collectionId) || envValue(input && input.collectionIdEnv);
  return { label, apiKey, collectionId };
}

function dedupeTargets(targets) {
  const seen = new Set();
  const out = [];

  for (const target of targets) {
    const key = `${target.apiKey || ''}::${target.collectionId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }

  return out;
}

function resolvePostmanTargets({ config, postmanKey, postmanId } = {}) {
  const outputPostman = config && config.output && config.output.postman ? config.output.postman : {};
  const targets = [];

  if (postmanKey || postmanId) {
    targets.push(normalizeTarget({
      label: 'cli',
      apiKey: postmanKey,
      collectionId: postmanId
    }, 'cli'));
  }

  if (process.env.POSTMAN_API_KEY || process.env.POSTMAN_COLLECTION_ID) {
    targets.push(normalizeTarget({
      label: 'env',
      apiKey: process.env.POSTMAN_API_KEY,
      collectionId: process.env.POSTMAN_COLLECTION_ID
    }, 'env'));
  }

  if (outputPostman.apiKey || outputPostman.collectionId) {
    targets.push(normalizeTarget({
      label: 'config',
      apiKey: outputPostman.apiKey,
      collectionId: outputPostman.collectionId
    }, 'config'));
  }

  if (Array.isArray(outputPostman.targets)) {
    outputPostman.targets.forEach((target, idx) => {
      targets.push(normalizeTarget(target || {}, `target-${idx + 1}`));
    });
  }

  return dedupeTargets(targets);
}

export { syncOnce };
