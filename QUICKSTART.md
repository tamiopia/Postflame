# 🔥 Postflame Quick Start Guide

## Installation

```bash
npm install -g postflame
```

## Setup (One-Time)

Create a `.env` file in your project root:

```bash
echo "POSTMAN_API_KEY=your_api_key_here" > .env
```

Get your API key from: https://go.postman.co/settings/me/api-keys

## Usage

### Super Simple (Recommended)

Just run this in your project directory:

```bash
postflame generate
```

That's it! 🎉

Postflame will:
1. 🔍 Auto-detect your app file (app.ts, index.ts, or main.ts)
2. 📦 Compile TypeScript automatically
3. 🔥 Generate `postman.json`
4. ☁️ Upload to Postman (if API key is in .env)

### With Options

```bash
# Specify input file
postflame generate --input src/server.ts

# Custom output
postflame gen -o my-collection.json

# Force push to Postman
postflame g -p

# All together
postflame gen -i src/app.ts -o api.json -p
```

## Your Hono App

Make sure your app exports a Hono instance:

```typescript
import { Hono } from 'hono';

export const app = new Hono();

// or

export default app;
```

## With OpenAPI (Recommended)

For better documentation with examples:

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono();

// Define your routes with OpenAPI specs
app.openapi(
  {
    method: 'get',
    path: '/users',
    tags: ['Users'],
    responses: {
      200: {
        description: 'List of users',
      },
    },
  },
  (c) => c.json({ users: [] })
);

// Important: Add the doc endpoint
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
});

export { app };
```

## Troubleshooting

### "Could not find app file"

Make sure you have one of these files:
- `app.ts` or `app.js` in root or `src/`
- `index.ts` or `index.js` in root or `src/`
- `main.ts` or `main.js` in root or `src/`

Or specify the file manually:
```bash
postflame generate --input path/to/your/app.ts
```

### "No app export found"

Your file must export a Hono instance:
```typescript
export const app = new Hono();
// or
export default app;
```

### "POSTMAN_API_KEY not found"

Create a `.env` file:
```bash
POSTMAN_API_KEY=your_key_here
```

Or use the `--push` flag only when you want to upload.

## Commands Cheat Sheet

```bash
postflame generate          # Full command
postflame gen              # Short version
postflame g                # Shortest
postflame run              # Alternative
postflame help             # Show help

# With options
-i, --input <file>         # Specify app file
-o, --output <file>        # Output file
-p, --push                 # Force upload to Postman
```

## Next Steps

1. ✅ Install postflame
2. ✅ Add POSTMAN_API_KEY to .env
3. ✅ Run `postflame generate`
4. 🎉 Check your Postman workspace!

---

Need help? Check the full [README.md](./README.md) or open an issue on GitHub.
