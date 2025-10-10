import fs from 'fs';
import path from 'path';

export function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function writeJSON(filePath: string, data: any) {
  ensureDirExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
