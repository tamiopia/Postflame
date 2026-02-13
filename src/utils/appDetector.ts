import fs from 'fs';
import path from 'path';

const APP_FILE_NAMES = ['app.ts', 'app.js', 'index.ts', 'index.js', 'main.ts', 'main.js', 'server.ts', 'server.js'];
const SEARCH_DIRS = ['', 'src', 'test'];
const MONOREPO_ROOT_HINTS = ['apps', 'services', 'packages', 'libs'];
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.nuxt', 'coverage']);

export interface DetectedAppFile {
  filePath: string;
  appName: string;
}

function toTitleCase(value: string): string {
  return String(value || '')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || 'App';
}

function deriveAppName(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  const segments = relative.split('/').filter(Boolean);

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i].toLowerCase();
    if (MONOREPO_ROOT_HINTS.includes(segment) && segments[i + 1]) {
      return toTitleCase(segments[i + 1]);
    }
  }

  // src/<app>/... pattern fallback
  const srcIdx = segments.findIndex((s) => s.toLowerCase() === 'src');
  if (srcIdx >= 0 && segments[srcIdx + 1]) {
    const candidate = segments[srcIdx + 1];
    const lower = candidate.toLowerCase();
    if (!['routes', 'route', 'controllers', 'controller', 'api', 'http', 'grpc'].includes(lower)) {
      return toTitleCase(candidate);
    }
  }

  const parentDir = path.basename(path.dirname(filePath));
  if (parentDir && !['src', 'test'].includes(parentDir.toLowerCase())) {
    return toTitleCase(parentDir);
  }

  return toTitleCase(path.basename(cwd));
}

function listCandidateRoots(cwd: string): string[] {
  const out: string[] = [];
  const pushIfExists = (dirPath: string) => {
    if (fs.existsSync(dirPath)) out.push(dirPath);
  };

  pushIfExists(cwd);
  pushIfExists(path.join(cwd, 'src'));
  pushIfExists(path.join(cwd, 'test'));

  for (const hint of MONOREPO_ROOT_HINTS) {
    const hintDir = path.join(cwd, hint);
    if (!fs.existsSync(hintDir)) continue;
    pushIfExists(hintDir);
    for (const child of fs.readdirSync(hintDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const childPath = path.join(hintDir, child.name);
      pushIfExists(path.join(childPath, 'src'));
      pushIfExists(childPath);
    }
  }

  return Array.from(new Set(out));
}

function walkDir(root: string, maxDepth = 6): string[] {
  const files: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return files;
}

function isCandidateAppFilename(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (APP_FILE_NAMES.includes(lower)) return true;
  return /(^|\.)(app|server)\.(t|j)s$/.test(lower);
}

function dedupeDetectedApps(apps: DetectedAppFile[]): DetectedAppFile[] {
  const map = new Map<string, DetectedAppFile>();
  for (const app of apps) {
    map.set(path.resolve(app.filePath), app);
  }
  return Array.from(map.values());
}

/**
 * Detect all app files in single-app and monorepo layouts.
 */
export function detectAppFiles(cwd: string = process.cwd(), debug = false): DetectedAppFile[] {
  const roots = listCandidateRoots(cwd);
  const detected: DetectedAppFile[] = [];

  if (debug) {
    console.log(`  Candidate roots: ${roots.map((r) => path.relative(cwd, r) || '.').join(', ')}`);
  }

  // First pass: quick lookup for known app file names in common dirs
  for (const dir of SEARCH_DIRS) {
    const searchPath = path.join(cwd, dir);
    if (!fs.existsSync(searchPath)) continue;

    for (const fileName of APP_FILE_NAMES) {
      const filePath = path.join(searchPath, fileName);
      if (!fs.existsSync(filePath)) continue;
      const isValid = isLikelyAppFile(filePath);
      if (!isValid) continue;
      detected.push({ filePath, appName: deriveAppName(filePath, cwd) });
    }
  }

  // Second pass: recursive scan for app-like files
  for (const root of roots) {
    const files = walkDir(root, 6);
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      if (!isCandidateAppFilename(fileName)) continue;
      if (!isLikelyAppFile(filePath)) continue;
      detected.push({ filePath, appName: deriveAppName(filePath, cwd) });
    }
  }

  const deduped = dedupeDetectedApps(detected);
  deduped.sort((a, b) => a.appName.localeCompare(b.appName) || a.filePath.localeCompare(b.filePath));
  return deduped;
}

/**
 * Auto-detect the main app file in the project
 * Searches for app.ts, index.ts, main.ts, or server.ts in root, src/, and test/ directories
 */
export function detectAppFile(cwd: string = process.cwd(), debug = false): string | null {
  const files = detectAppFiles(cwd, debug);
  if (files.length === 0) return null;

  // Prefer canonical app filenames in root/src first for backward compatibility.
  const preferred = files.find((entry) => {
    const rel = path.relative(cwd, entry.filePath).replace(/\\/g, '/').toLowerCase();
    return APP_FILE_NAMES.includes(path.basename(rel)) && (rel.indexOf('/') === -1 || rel.startsWith('src/'));
  });

  if (preferred) {
    return preferred.filePath;
  }

  return files[0].filePath;
}

/**
 * Check if a file likely contains a Hono app export
 */
function isLikelyAppFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Look for Hono-related patterns
    const hasHonoImport = /from ['"]hono['"]/.test(content) || 
                          /from ['"]@hono/.test(content) ||
                          /import.*Hono/.test(content);
    
    const hasAppExport = /export.*app/.test(content) || 
                         /export default/.test(content);
    
    // Skip files that are ONLY re-exports (entire file is just export statements)
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('//'));
    const isReExportOnly = lines.length > 0 && lines.every(line => /^\s*export\s+\*\s+from/.test(line));
    
    return hasHonoImport && hasAppExport && !isReExportOnly;
  } catch {
    return true; // If we can't read it, let the import attempt handle it
  }
}

/**
 * Get a user-friendly relative path for display
 */
export function getDisplayPath(filePath: string, cwd: string = process.cwd()): string {
  return path.relative(cwd, filePath) || filePath;
}
