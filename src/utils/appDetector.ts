import fs from 'fs';
import path from 'path';

const APP_FILE_NAMES = ['app.ts', 'app.js', 'index.ts', 'index.js', 'main.ts', 'main.js'];
const SEARCH_DIRS = ['', 'src', 'test'];

/**
 * Auto-detect the main app file in the project
 * Searches for app.ts, index.ts, or main.ts in root, src/, and test/ directories
 */
export function detectAppFile(cwd: string = process.cwd()): string | null {
  for (const dir of SEARCH_DIRS) {
    const searchPath = path.join(cwd, dir);
    
    if (!fs.existsSync(searchPath)) continue;
    
    for (const fileName of APP_FILE_NAMES) {
      const filePath = path.join(searchPath, fileName);
      
      if (fs.existsSync(filePath)) {
        // Quick check: does the file likely contain a Hono app?
        if (isLikelyAppFile(filePath)) {
          return filePath;
        }
      }
    }
  }
  
  return null;
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
    
    // Skip files that are just re-exports
    const isReExportOnly = /^(\s*export \* from|\/\/|\/\*|\s*$)/gm.test(content.trim());
    
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
