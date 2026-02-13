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

    const pmKey = postmanKey || process.env.POSTMAN_API_KEY || (config.output && config.output.postman && config.output.postman.apiKey);
    const pmId = postmanId || process.env.POSTMAN_COLLECTION_ID || (config.output && config.output.postman && config.output.postman.collectionId);

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

      if (pmKey && pmId) {
        info(`Pushing to Postman Cloud (ID: ${pmId})...`);
        try {
          await pushToPostman(merged, pmKey, pmId);
          success('Successfully synced to Postman Cloud!');
        } catch (err) {
          error(`Failed to sync to Postman Cloud: ${err.message}`);
        }
      } else if (pmKey || pmId) {
        warn('Skipping Postman Cloud sync: Missing API Key or Collection ID.');
        if (!pmKey) warn('  -> POSTMAN_API_KEY is missing');
        if (!pmId) warn('  -> POSTMAN_COLLECTION_ID is missing');
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

export { syncOnce };
