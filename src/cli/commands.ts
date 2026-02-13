#!/usr/bin/env node
import { generatePostmanCollection, saveCollectionToFile } from '../core/generator.js';
import { uploadToPostman } from '../core/uploader.js';
import { detectAppFiles, getDisplayPath, type DetectedAppFile } from '../utils/appDetector.js';
import { Hono } from 'hono';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { execSync } from 'child_process';


dotenv.config();

interface GenerateOptions {
  input?: string;
  output?: string;
  push?: boolean;
  all?: boolean;
  baseUrl?: string;
  appUrls?: string;
  cwd?: string;
}

interface LoadedApp {
  app: Hono;
  appName: string;
  filePath: string;
}

function normalizeAppKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseAppUrls(value?: string): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  const parts = value.split(',').map((v) => v.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const app = part.slice(0, idx).trim();
    const url = part.slice(idx + 1).trim();
    if (!app || !url) continue;
    out[normalizeAppKey(app)] = url;
  }
  return out;
}

function mapDetectedApp(filePath: string, cwd: string): DetectedAppFile {
  const detected = detectAppFiles(cwd, false);
  const absPath = path.resolve(filePath);
  const exact = detected.find((entry) => path.resolve(entry.filePath) === absPath);
  if (exact) return exact;

  const parentName = path.basename(path.dirname(absPath)) || 'App';
  return { filePath: absPath, appName: parentName.charAt(0).toUpperCase() + parentName.slice(1) };
}

function resolveTargetApps(options: GenerateOptions, cwd: string): DetectedAppFile[] {
  if (options.input) {
    const inputPath = path.resolve(cwd, options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ File or directory not found: ${options.input}`);
      process.exit(1);
    }

    const stat = fs.statSync(inputPath);
    if (stat.isFile()) {
      return [mapDetectedApp(inputPath, cwd)];
    }

    const nested = detectAppFiles(inputPath, true);
    if (nested.length === 0) {
      console.error(`❌ No app files found in directory: ${options.input}`);
      process.exit(1);
    }
    return nested;
  }

  console.log('🔍 Searching for app file(s)...');
  const detected = detectAppFiles(cwd, true);
  if (detected.length === 0) {
    console.error('\n❌ Could not find app files.');
    console.error('💡 Tried scanning root, src, apps, services, packages, and libs directories.');
    console.error('💡 Specify input manually: postflame generate --input <path>');
    process.exit(1);
  }

  if (!options.all && detected.length > 1) {
    console.log(`📦 Found ${detected.length} apps. Using the first detected app. Pass --all to include all apps.`);
    return [detected[0]];
  }
  return detected;
}

export async function generateCommand(options: GenerateOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const targets = resolveTargetApps(options, cwd);
  const loadedApps: LoadedApp[] = [];

  // Compile TypeScript once when possible.
  const hasTsInput = targets.some((entry) => path.extname(entry.filePath) === '.ts');
  let tsconfig: any = null;
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (hasTsInput && fs.existsSync(tsconfigPath)) {
    console.log('📦 Compiling TypeScript...');
    try {
      execSync('npx tsc --noEmit false', { cwd, stdio: 'inherit' });
      tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    } catch (error: any) {
      console.error('⚠️  Compilation warning:', error.message);
      console.log('Attempting to continue with direct imports...');
    }
  }

  for (const target of targets) {
    const appFilePath = path.resolve(target.filePath);
    const displayPath = getDisplayPath(appFilePath, cwd);
    console.log(`🔍 Found app file: ${displayPath} (${target.appName})`);

    const ext = path.extname(appFilePath);
    let importPath = appFilePath;
    if (ext === '.ts' && tsconfig) {
      const outDir = tsconfig.compilerOptions?.outDir || 'dist';
      const rootDir = tsconfig.compilerOptions?.rootDir || 'src';
      const relativePath = path.relative(path.join(cwd, rootDir), appFilePath);
      const compiledPath = path.join(cwd, outDir, relativePath.replace('.ts', '.js'));
      if (fs.existsSync(compiledPath)) {
        importPath = compiledPath;
      }
    }

    try {
      const fileUrl = pathToFileURL(importPath).href;
      const imported = await import(fileUrl);
      const app = imported.app || imported.default;

      if (!app) {
        console.error(`❌ ${displayPath} does not export "app" or default app export.`);
        continue;
      }
      if (!app.routes && !app.fetch) {
        console.error(`❌ ${displayPath} export is not a Hono app instance.`);
        continue;
      }

      loadedApps.push({ app, appName: target.appName, filePath: appFilePath });
    } catch (err: any) {
      console.error(`❌ Failed to import ${displayPath}:`, err.message);
    }
  }

  if (loadedApps.length === 0) {
    console.error('❌ No valid Hono app exports were loaded.');
    process.exit(1);
  }

  console.log('🔥 Generating Postman collection...');
  const collectionName = path.basename(cwd) + ' API';
  const appUrls = {
    ...parseAppUrls(process.env.POSTFLAME_APP_URLS),
    ...parseAppUrls(options.appUrls)
  };
  const baseUrl = options.baseUrl || process.env.POSTFLAME_BASE_URL || 'http://localhost:3000/api';
  const collection = await generatePostmanCollection(loadedApps, collectionName, {
    baseUrl,
    appBaseUrls: appUrls
  });
  
  // Step 5: Save to file
  const outputFile = options.output || 'postman.json';
  const outputPath = path.resolve(cwd, outputFile);
  saveCollectionToFile(collection, outputPath);
  
  // Step 6: Push to Postman if API key is available
  const apiKey = process.env.POSTMAN_API_KEY;
  
  if (options.push || apiKey) {
    if (!apiKey) {
      console.error('❌ POSTMAN_API_KEY not found in environment or .env file');
      console.error('💡 Add it to your .env file:');
      console.error('   POSTMAN_API_KEY=your_api_key_here');
      process.exit(1);
    }
    
    console.log('☁️  Uploading to Postman...');
    try {
      await uploadToPostman(collection, apiKey);
    } catch (error: any) {
      console.error('❌ Failed to upload to Postman:', error.message);
      process.exit(1);
    }
  } else {
    console.log('\n💡 To auto-upload to Postman, add POSTMAN_API_KEY to your .env file');
  }
  
  console.log('\n✨ Done!');
}

/**
 * Alias for generate command
 */
export async function runCommand(options: GenerateOptions = {}) {
  return generateCommand(options);
}
