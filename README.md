# 🔥 Postflame

**Postflame** is a powerful CLI tool that automatically generates Postman collections from your Hono applications with Zod schema validation. Transform your API routes into ready-to-use Postman collections in seconds!

## ✨ Features

- 🚀 **Automatic Generation** - Converts Hono routes to Postman collections instantly
- 📝 **OpenAPI Support** - Reads from `@hono/zod-openapi` endpoints for rich documentation
- 🔄 **Fallback Parsing** - Works even without OpenAPI by parsing routes directly
- ☁️ **Direct Upload** - Push collections to Postman workspace via API
- 🎯 **Zod Integration** - Leverages Zod schemas for request/response examples
- 📦 **Multiple Content Types** - Supports JSON, form-data, and URL-encoded bodies
- 🏷️ **Smart Organization** - Groups endpoints by tags into folders

## 📦 Installation

```bash
npm install -g postflame
```

Or use with npx:

```bash
npx postflame <path-to-app.ts>
```

## 🚀 Quick Start

### Super Simple Usage

Just run postflame in your project directory - it will auto-detect your app file!

```bash
# Auto-detect and generate
postflame generate
```

That's it! Postflame will:
1. 🔍 Find your app file (app.ts, index.ts, or main.ts)
2. 📦 Compile TypeScript automatically
3. 🔥 Generate `postman.json`
4. ☁️ Auto-upload to Postman if `POSTMAN_API_KEY` is in your `.env`

### With Auto-Upload to Postman

Create a `.env` file in your project root:

```env
POSTMAN_API_KEY=your_api_key_here
```

Then run:

```bash
postflame generate
```

Or force push with the `--push` flag:

```bash
postflame generate --push
```

### Custom Options

```bash
# Specify input file
postflame generate --input src/app.ts

# Custom output path
postflame generate --output my-api.json

# Short form
postflame gen -i src/app.ts -o api.json -p
```

## 📖 Usage Examples

### Example Hono App

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  description: z.string().optional(),
});

app.get('/products', (c) => {
  return c.json({ products: [] });
});

app.post('/products', zValidator('json', ProductSchema), (c) => {
  const data = c.req.valid('json');
  return c.json({ success: true, product: data });
});

export { app };
```

### Generate Collection

```bash
# Just run postflame - it handles everything!
postflame generate
```

### With OpenAPI (Recommended)

For richer documentation with examples and descriptions:

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

const app = new OpenAPIHono();

app.openapi(
  {
    method: 'post',
    path: '/products',
    tags: ['Products'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().openapi({ example: 'iPhone 15' }),
              price: z.number().openapi({ example: 999 }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Product created successfully',
      },
    },
  },
  (c) => {
    return c.json({ success: true });
  }
);

// Important: Add the doc endpoint
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
});

export { app };
```

## 🔧 CLI Commands & Options

### Commands

```bash
postflame generate    # Generate collection (default)
postflame gen         # Short alias
postflame g           # Even shorter!
postflame run         # Alternative alias
postflame help        # Show help
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input <file>` | `-i` | Path to app file | Auto-detected |
| `--output <file>` | `-o` | Output file path | `postman.json` |
| `--push` | `-p` | Force upload to Postman | Auto if API key in .env |

### Auto-Detection

Postflame searches for these files in order:
1. `app.ts` in root directory
2. `index.ts` in root directory  
3. `main.ts` in root directory
4. `src/app.ts`
5. `src/index.ts`
6. `src/main.ts`

Also checks for `.js` versions of these files.

## 🔑 Postman API Key Setup

### Recommended: Use .env file

Create a `.env` file in your project root:

```env
POSTMAN_API_KEY=your_api_key_here
```

Postflame will automatically read this and upload your collection!

### Alternative: Environment Variable

```bash
# Linux/Mac
export POSTMAN_API_KEY=your_key_here

# Windows (PowerShell)
$env:POSTMAN_API_KEY="your_key_here"
```

### Get Your API Key

1. Go to [Postman API Keys](https://go.postman.co/settings/me/api-keys)
2. Click "Generate API Key"
3. Copy and add to your `.env` file

## 🛠️ Programmatic Usage

You can also use Postflame as a library:

```typescript
import { generatePostmanCollection, saveCollectionToFile } from 'postflame';
import { app } from './app';

const collection = await generatePostmanCollection(app, 'My API');
saveCollectionToFile(collection, 'output.json');
```

## 📋 Requirements

- Node.js 16+
- A Hono application
- TypeScript (recommended)

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit PRs.

## 📄 License

MIT

## 🔗 Links

- [Hono Framework](https://hono.dev)
- [Zod](https://zod.dev)
- [Postman](https://postman.com)

---

Made with 🔥 by Tamiopia
