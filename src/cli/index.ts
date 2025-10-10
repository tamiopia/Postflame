#!/usr/bin/env node
import { generatePostmanCollection, saveCollectionToFile } from '../core/generator.js';
import { uploadToPostman } from '../core/uploader.js';
import { Hono } from 'hono';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';

const args = process.argv.slice(2);
const inputFile = args[0];
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'postman.json';
const pushToPostman = args.includes('--push');

if (!inputFile) {
  console.error('❌ Usage: hono-postman-gen <path-to-app.ts> [--output postman.json] [--push]');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputFile);
const fileUrl = pathToFileURL(resolvedPath).href;

try {
  const imported = await import(fileUrl);
  const app = imported.app || imported.default;

  if (!(app instanceof Hono)) {
    console.error('❌ The imported file must export a Hono app instance named "app" or as default export.');
    process.exit(1);
  }

  const collection = generatePostmanCollection(app);
  saveCollectionToFile(collection, outputFile);

  if (pushToPostman) {
    const apiKey = process.env.POSTMAN_API_KEY;
    if (!apiKey) {
      console.error('❌ Missing POSTMAN_API_KEY in environment variables.');
      process.exit(1);
    }
    await uploadToPostman(collection, apiKey);
  }
} catch (err) {
  console.error('❌ Failed to import app file:', err);
  process.exit(1);
}
