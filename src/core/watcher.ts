import chokidar from 'chokidar';
import { generatePostmanCollection, saveCollectionToFile } from './generator.js';
import { uploadToPostman } from './uploader.js';

export function watchAppFile(appPath: string, apiKey?: string) {
  chokidar.watch(appPath).on('change', async () => {
    console.log('♻️ Route file changed, regenerating...');
    const { app } = await import(appPath + '?v=' + Date.now());
    const collection = generatePostmanCollection(app);
    saveCollectionToFile(collection, 'postman.json');
    if (apiKey) await uploadToPostman(collection, apiKey);
  });
}
