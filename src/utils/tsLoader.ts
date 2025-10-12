import { pathToFileURL } from 'url';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';


export async function loadTypeScriptApp(filePath: string): Promise<any> {
  const ext = path.extname(filePath);
  
  // If it's already a .js file, just import it
  if (ext === '.js' || ext === '.mjs') {
    const fileUrl = pathToFileURL(filePath).href;
    const imported = await import(fileUrl);
    return imported.app || imported.default;
  }
  
  // For .ts files, use tsx to load them
  if (ext === '.ts') {
    return await loadWithTsx(filePath);
  }
  
  throw new Error(`Unsupported file extension: ${ext}`);
}

/**
 * Use tsx to dynamically import TypeScript files
 */
async function loadWithTsx(filePath: string): Promise<any> {
  try {
    // Create a temporary loader script
    const loaderScript = `
import('${filePath.replace(/\\/g, '/')}')
  .then(mod => {
    const app = mod.app || mod.default;
    if (!app) {
      console.error('ERROR: No app export found');
      process.exit(1);
    }
    // Serialize the app routes for inspection
    console.log(JSON.stringify({
      success: true,
      routes: app.routes || []
    }));
  })
  .catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
`;
    
    const tempFile = path.join(process.cwd(), '.postflame-loader.mjs');
    fs.writeFileSync(tempFile, loaderScript);
    
    // Execute with tsx
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('npx', ['tsx', tempFile], {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        fs.unlinkSync(tempFile);
        
        if (code !== 0) {
          reject(new Error(stderr || `Process exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });
    });
    
    // For now, we need to directly import with tsx
    // This is a workaround - we'll use dynamic import with tsx register
    const fileUrl = pathToFileURL(filePath).href;
    const imported = await import(fileUrl);
    return imported.app || imported.default;
    
  } catch (error: any) {
    throw new Error(`Failed to load TypeScript file: ${error.message}`);
  }
}
