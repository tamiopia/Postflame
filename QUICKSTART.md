# Postflame Quick Start

## Install

```bash
npm install -g postflame
```

Or use with `npx`:

```bash
npx postflame --help
```

## Recommended Setup (Any Framework)

Run inside your project:

```bash
postflame init
```

This creates `postflame.config.js` with framework and source settings.

Then generate collections:

```bash
postflame sync
```

Watch changes continuously:

```bash
postflame watch
```

## Microservices / Multi-App Base URLs

When prompted in `postflame init`, choose multiple app URLs and provide values like:

```text
admin=http://localhost:8000/api,business=http://localhost:8001/api,core=http://localhost:8002/api,customer=http://localhost:8003/api
```

## Hono Direct Generate Mode

If your project exports a Hono app directly, you can use:

```bash
postflame generate --input src/app.ts
```

Useful options:

```bash
postflame generate --all
postflame generate --app-urls admin=http://localhost:8000/api,business=http://localhost:8001/api
postflame generate --push
```

## Postman Cloud Push

Set these in `.env` or your shell:

```bash
POSTMAN_API_KEY=your_api_key
POSTMAN_COLLECTION_ID=your_collection_uid
```

With both set, `postflame sync` pushes updates automatically.

For multiple users/collections, configure `output.postman.targets` in `postflame.config.js`:

```js
module.exports = {
  output: {
    postman: {
      enabled: true,
      outputPath: './collections/postman-collection.json',
      targets: [
        { label: 'alice', apiKeyEnv: 'POSTMAN_API_KEY_ALICE', collectionIdEnv: 'POSTMAN_COLLECTION_ID_ALICE' },
        { label: 'bob', apiKeyEnv: 'POSTMAN_API_KEY_BOB', collectionIdEnv: 'POSTMAN_COLLECTION_ID_BOB' }
      ]
    }
  }
};
```

## Minimal Config Example

```js
module.exports = {
  framework: 'auto',
  sources: {
    include: ['src/**/*.controller.ts', 'src/**/routes.ts', 'src/**/*.routes.ts'],
    exclude: ['**/*.spec.ts', '**/*.test.ts', 'node_modules/**', 'dist/**', 'build/**'],
    baseUrl: 'http://localhost:3000/api'
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
  }
};
```

## Troubleshooting

### No files matched

- Confirm your `sources.include` patterns in `postflame.config.js`
- Run with a project root explicitly:

```bash
postflame sync --cwd /absolute/path/to/project
```

### Endpoint count looks wrong

- Switch `framework` to `auto` or the specific framework
- Verify controller/route files are under included directories
- Check excluded patterns are not too broad

### No Postman push

- Ensure both `POSTMAN_API_KEY` and `POSTMAN_COLLECTION_ID` are set
