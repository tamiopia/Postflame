// @ts-nocheck
import fs from 'fs-extra';
import * as parser from '@babel/parser';

async function parseFile(filePath) {
  const code = await fs.readFile(filePath, 'utf8');
  const base = {
    sourceType: 'module',
    plugins: [
      'typescript',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'jsx',
      'dynamicImport'
    ]
  };

  try {
    return parser.parse(code, {
      ...base,
      plugins: ['decorators-legacy', ...base.plugins]
    });
  } catch (err) {
    // Fallback to stage-3 decorators if legacy parsing fails
    return parser.parse(code, {
      ...base,
      plugins: [['decorators', { decoratorsBeforeExport: true }], ...base.plugins]
    });
  }
}

export { parseFile };
