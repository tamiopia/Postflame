# 📦 Publishing Postflame to npm

## Pre-Publish Checklist

### ✅ Completed
- [x] Package name: `postflame`
- [x] Version: `0.1.0`
- [x] LICENSE file (MIT)
- [x] README.md with comprehensive docs
- [x] CHANGELOG.md
- [x] QUICKSTART.md
- [x] TypeScript declaration files (.d.ts)
- [x] .npmignore configured
- [x] package.json metadata (repository, keywords, etc.)
- [x] Build script works
- [x] prepublishOnly script added

### 📋 Before Publishing

1. **Login to npm** (if not already logged in):
   ```bash
   npm login
   ```

2. **Check what will be published**:
   ```bash
   npm pack --dry-run
   ```
   This shows which files will be included.

3. **Test the package locally**:
   ```bash
   npm pack
   npm install -g postflame-0.1.0.tgz
   postflame help
   ```

4. **Verify the build**:
   ```bash
   npm run build
   ```

5. **Check for issues**:
   ```bash
   npm publish --dry-run
   ```

## Publishing Steps

### First Time Publishing

```bash
# 1. Make sure you're logged in
npm whoami

# 2. Dry run to check everything
npm publish --dry-run

# 3. Publish!
npm publish
```

### For Updates

```bash
# 1. Update version
npm version patch   # 0.1.0 -> 0.1.1
# or
npm version minor   # 0.1.0 -> 0.2.0
# or
npm version major   # 0.2.0 -> 1.0.0

# 2. Build (happens automatically via prepublishOnly)
# 3. Publish
npm publish

# 4. Push git tags
git push --tags
```

## Post-Publishing

1. **Test installation**:
   ```bash
   npm install -g postflame
   postflame --version
   ```

2. **Verify on npm**:
   - Visit: https://www.npmjs.com/package/postflame
   - Check README renders correctly
   - Verify version number

3. **Create GitHub release** (optional):
   - Tag: `v0.1.0`
   - Release notes from CHANGELOG.md

## Package Info

- **Package Name**: `postflame`
- **Current Version**: `0.1.0`
- **Registry**: https://registry.npmjs.org
- **Package URL**: https://www.npmjs.com/package/postflame

## Files Included in Package

Based on `package.json` "files" field:
- `dist/` - Compiled JavaScript + TypeScript declarations
- `bin/` - CLI executable
- `README.md` - Documentation
- `LICENSE` - MIT License
- `CHANGELOG.md` - Version history
- `QUICKSTART.md` - Quick start guide

## Troubleshooting

### "Package name already exists"
If `postflame` is taken, you'll need to:
1. Choose a different name (e.g., `@tamiopia/postflame`)
2. Update `package.json` name field
3. Update README with new install command

### "You must be logged in"
```bash
npm login
```
Enter your npm credentials.

### "Version already published"
You can't republish the same version. Bump the version:
```bash
npm version patch
```

## Quick Publish Command

```bash
# All in one (after testing)
npm run build && npm publish
```

---

**Ready to publish?** Run:
```bash
npm publish
```
