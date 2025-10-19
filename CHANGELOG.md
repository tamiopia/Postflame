# Changelog

## [1.0.3] - 2025-10-19

### 🔧 Improvements
- **Enhanced debug logging**: Added detailed debug output showing search paths and file checks
- **Improved auto-detection feedback**: Better visibility into which files are being checked during auto-detection
- **Updated help text**: CLI help now correctly lists `server.ts` in auto-detection files

### 🐛 Bug Fixes
- Fixed auto-detection not showing detailed progress when searching for app files
- Improved error messages to help users understand why auto-detection might fail

---

## [1.0.1] - 2025-10-19

### 🔧 Improvements
- **Added `server.ts`/`server.js` detection**: Auto-detection now includes server files
- **Fixed OpenAPIHono support**: Improved instance checking to work with `OpenAPIHono` and other Hono subclasses
- **Better error messages**: More helpful debugging output when app export is not found

### 🐛 Bug Fixes
- Fixed `instanceof Hono` check that was failing for `OpenAPIHono`
- Now checks for Hono-like properties (`routes`, `fetch`) instead of strict instance checking

---

## [1.0.0] - First Major Release 🔥🎉

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
