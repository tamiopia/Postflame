# Changelog

## [0.2.0] - Major Update 🔥

### ✨ New Features

#### 🎯 Auto-Detection
- **Smart App File Detection**: Automatically finds your app file without needing to specify it
  - Searches for `app.ts`, `index.ts`, `main.ts` in root, `src/`, and `test/` directories
  - Intelligently skips non-app files (like re-export files)
  - Also detects `.js` versions

#### 📦 Automatic TypeScript Compilation
- No need to manually compile TypeScript anymore
- Postflame automatically runs `tsc` if it finds a `tsconfig.json`
- Falls back to tsx for direct TypeScript execution

#### 🔐 .env File Support
- Read `POSTMAN_API_KEY` directly from `.env` file
- No need to set environment variables manually
- Automatic upload to Postman when API key is present

#### 🎨 New Command Structure
- `postflame generate` - Generate collection (default command)
- `postflame gen` - Short alias
- `postflame g` - Even shorter!
- `postflame run` - Alternative alias
- `postflame help` - Show help

#### 🚀 Simplified Workflow
**Before:**
```bash
tsc
postflame dist/app.js --output postman.json --push
export POSTMAN_API_KEY=xxx
```

**Now:**
```bash
# Just this! 🎉
postflame generate
```

### 🔧 New CLI Options

- `--input, -i <file>` - Specify app file (optional, auto-detected)
- `--output, -o <file>` - Output file path (default: postman.json)
- `--push, -p` - Force upload to Postman

### 📦 New Dependencies

- `dotenv` - For .env file support
- `tsx` - For direct TypeScript execution

### 📝 Files Added

- `src/cli/commands.ts` - New command system
- `src/utils/appDetector.ts` - Smart app file detection
- `src/utils/tsLoader.ts` - TypeScript loading utilities
- `.env.example` - Example environment file
- `tsconfig.test.json` - Test compilation config

### 🔄 Breaking Changes

None! The old syntax still works for backward compatibility:
```bash
postflame path/to/app.js
```

### 🎯 Migration Guide

**Old way:**
```bash
# 1. Compile
tsc

# 2. Set env var
export POSTMAN_API_KEY=your_key

# 3. Generate
postflame dist/app.js --push
```

**New way:**
```bash
# 1. Create .env file (one time)
echo "POSTMAN_API_KEY=your_key" > .env

# 2. Run postflame (that's it!)
postflame generate
```

---

## [0.1.0] - Initial Release

- Basic Postman collection generation
- OpenAPI support via `@hono/zod-openapi`
- Manual file specification
- Postman upload via API key
