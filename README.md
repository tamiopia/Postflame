# Postflame

Postflame is a CLI for generating and syncing API collections from backend code.

It supports Hono, NestJS, and Express projects, including NestJS gRPC/microservice controller patterns.

## Features

- Framework-aware extraction: Hono, NestJS, Express
- gRPC/microservice endpoint extraction from NestJS decorators
- Multi-app and monorepo-friendly scanning (`src`, `apps`, `services`, `libs`)
- Postman and Insomnia collection generation
- App-specific base URLs for microservice environments
- Folder organization by app/module structure
- Configurable sync and watch workflows
- Optional Postman Cloud push

## Installation

```bash
npm install -g postflame
```

Or use via `npx`:

```bash
npx postflame --help
```

## Quick Start

1. Initialize config:

```bash
postflame init
```

2. Run a one-time sync:

```bash
postflame sync
```

3. Watch for file changes:

```bash
postflame watch
```

## CLI Commands

```bash
postflame init                 # Create postflame.config.js
postflame sync                 # Generate collections from configured sources
postflame watch                # Watch and auto-sync
postflame generate             # Hono app export-based generation
postflame run                  # Alias for generate
```

### Common Sync Options

```bash
postflame sync -c ./postflame.config.js
postflame sync --cwd /path/to/project
postflame sync --postman-key <KEY> --postman-id <COLLECTION_UID>
```

### Generate Command (Hono app export flow)

```bash
postflame generate --input src/app.ts
postflame generate --all
postflame generate --base-url http://localhost:3000/api
postflame generate --app-urls admin=http://localhost:8000/api,business=http://localhost:8001/api
postflame generate --push
```

## Configuration

Postflame uses `postflame.config.js` in your project root.

Example:

```js
module.exports = {
  framework: 'auto', // auto | nestjs | express | hono
  sources: {
    include: [
      'src/**/routes.{js,ts}',
      'src/**/*.routes.{js,ts}',
      'src/**/*.controller.ts',
      'src/**/*router.{js,ts}',
      'apps/**/src/**/routes.{js,ts}',
      'apps/**/src/**/*.routes.{js,ts}',
      'apps/**/src/**/*.controller.ts',
      'apps/**/src/**/*router.{js,ts}',
      'services/**/src/**/routes.{js,ts}',
      'services/**/src/**/*.routes.{js,ts}',
      'services/**/src/**/*.controller.ts',
      'services/**/src/**/*router.{js,ts}',
      'libs/**/src/**/routes.{js,ts}',
      'libs/**/src/**/*.routes.{js,ts}',
      'libs/**/src/**/*.controller.ts',
      'libs/**/src/**/*router.{js,ts}'
    ],
    exclude: ['**/*.spec.ts', '**/*.test.ts', 'node_modules/**', 'dist/**', 'build/**'],
    baseUrl: 'http://localhost:3000/api',
    appBaseUrls: {
      admin: 'http://localhost:8000/api',
      business: 'http://localhost:8001/api',
      core: 'http://localhost:8002/api',
      customer: 'http://localhost:8003/api'
    }
  },
  output: {
    postman: {
      enabled: true,
      outputPath: './collections/postman-collection.json'
    },
    insomnia: {
      enabled: true,
      outputPath: './collections/insomnia-collection.json'
    }
  },
  watch: {
    enabled: true,
    debounce: 300
  },
  merge: {
    markDeprecated: true
  },
  organization: {
    groupBy: 'folder' // folder | tags
  }
};
```

## Environment Variables

```bash
POSTMAN_API_KEY=your_api_key
POSTMAN_COLLECTION_ID=your_collection_uid
```

If both are present, `sync` will push updates to Postman Cloud.

## Programmatic Usage

```ts
import { syncOnce, generatePostmanCollection, saveCollectionToFile } from 'postflame';
import { app } from './app';

const collection = await generatePostmanCollection(app, 'My API');
saveCollectionToFile(collection, './postman.json');

await syncOnce({
  configPath: './postflame.config.js'
});
```

## Notes

- `sync` is the recommended workflow for mixed/large codebases.
- `generate` is best for direct Hono app export-based generation.

## License

MIT
