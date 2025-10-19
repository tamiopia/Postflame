#!/usr/bin/env node
import { generatePostmanCollection, saveCollectionToFile } from '../core/generator.js';
import { uploadToPostman } from '../core/uploader.js';
import { detectAppFile, getDisplayPath } from '../utils/appDetector.js';
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
  cwd?: string;
}


export async function generateCommand(options: GenerateOptions = {}) {
  const cwd = options.cwd || process.cwd();
  
  // Step 1: Find the app file
  let appFilePath: string;
  
  if (options.input) {
    appFilePath = path.resolve(cwd, options.input);
    if (!fs.existsSync(appFilePath)) {
      console.error(`❌ File not found: ${options.input}`);
      process.exit(1);
    }
  } else {
    console.log('🔍 Searching for app file...');
    const detected = detectAppFile(cwd, true);
    if (!detected) {
      console.error('\n❌ Could not find app file. Searched for: app.ts, index.ts, main.ts, server.ts in root and src/ directories');
      console.error('💡 Specify a file manually: postflame generate --input <path>');
      process.exit(1);
    }
    appFilePath = detected;
  }
  
  const displayPath = getDisplayPath(appFilePath, cwd);
  console.log(`🔍 Found app file: ${displayPath}`);
  
 
  const ext = path.extname(appFilePath);
  let importPath = appFilePath;
  
  if (ext === '.ts') {
    console.log('📦 Compiling TypeScript...');
    try {
      // Check if tsconfig.json exists
      const tsconfigPath = path.join(cwd, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        execSync('npx tsc --noEmit false', { cwd, stdio: 'inherit' });
        
        // Try to find the compiled output
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
        const outDir = tsconfig.compilerOptions?.outDir || 'dist';
        const rootDir = tsconfig.compilerOptions?.rootDir || 'src';
        
        // Calculate the compiled file path
        const relativePath = path.relative(path.join(cwd, rootDir), appFilePath);
        const compiledPath = path.join(cwd, outDir, relativePath.replace('.ts', '.js'));
        
        if (fs.existsSync(compiledPath)) {
          importPath = compiledPath;
          console.log(`✅ Compiled to: ${getDisplayPath(compiledPath, cwd)}`);
        } else {
          console.log('⚠️  Could not find compiled output, attempting direct import with tsx...');
          // Use tsx to run TypeScript directly
          importPath = appFilePath;
        }
      } else {
        console.log('⚠️  No tsconfig.json found, using tsx for direct import...');
      }
    } catch (error: any) {
      console.error('⚠️  Compilation warning:', error.message);
      console.log('Attempting to continue with tsx...');
    }
  }
  
  
  console.log(' Loading app...');
  let app: Hono;
  
  try {
    const fileUrl = pathToFileURL(importPath).href;
    const imported = await import(fileUrl);
    app = imported.app || imported.default;
    
    if (!app) {
      console.error('❌ The imported file must export a Hono app instance named "app" or as default export.');
      console.error('\n📄 File contents preview:');
      console.error(fs.readFileSync(importPath, 'utf-8').slice(0, 1000));
      process.exit(1);
    }
    
    // Check if it's a Hono-like object (has routes, fetch, etc.)
    if (!app.routes && !app.fetch) {
      console.error('❌ The exported value does not appear to be a Hono app instance.');
      console.error('   Expected an object with routes or fetch method.');
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Failed to import app file:', err.message);
    console.error('\n💡 Make sure your app exports a Hono instance:');
    console.error('   export const app = new Hono();');
    console.error('   // or');
    console.error('   export default app;');
    process.exit(1);
  }
  
  // Step 4: Generate collection
  console.log('🔥 Generating Postman collection...');
  const collectionName = path.basename(cwd) + ' API';
  const collection = await generatePostmanCollection(app, collectionName);
  
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
