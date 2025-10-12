#!/usr/bin/env node
import { generateCommand, runCommand } from './commands.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
const getFlag = (flag: string) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
};

const hasFlag = (flag: string) => args.includes(flag);

// Show help
function showHelp() {
  console.log(`
🔥 Postflame - Generate Postman collections from Hono apps

Usage:
  postflame [command] [options]

Commands:
  generate, gen, g    Generate Postman collection (default)
  run, r              Alias for generate
  help, h             Show this help message

Options:
  --input, -i <file>  Path to app file (auto-detected if not provided)
  --output, -o <file> Output file path (default: postman.json)
  --push, -p          Upload to Postman (requires POSTMAN_API_KEY in .env)

Examples:
  # Auto-detect app file and generate collection
  postflame generate

  # Generate and push to Postman
  postflame generate --push

  # Specify input file
  postflame generate --input src/app.ts

  # Short form
  postflame gen -i src/app.ts -o api.json -p

Environment:
  POSTMAN_API_KEY     Your Postman API key (add to .env file)

Auto-detection:
  Postflame will automatically search for these files:
  - app.ts, index.ts, main.ts (in root directory)
  - src/app.ts, src/index.ts, src/main.ts
  `);
}

// Main CLI logic
async function main() {
  // No command or help
  if (!command || command === 'help' || command === 'h' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  // Parse options
  const options = {
    input: getFlag('--input') || getFlag('-i'),
    output: getFlag('--output') || getFlag('-o'),
    push: hasFlag('--push') || hasFlag('-p'),
  };

  // Handle commands
  switch (command) {
    case 'generate':
    case 'gen':
    case 'g':
      await generateCommand(options);
      break;

    case 'run':
    case 'r':
      await runCommand(options);
      break;

    default:
      // If first arg doesn't look like a command, treat it as a file path (backward compatibility)
      if (command.endsWith('.ts') || command.endsWith('.js') || command.includes('/') || command.includes('\\')) {
        await generateCommand({ ...options, input: command });
      } else {
        console.error(`❌ Unknown command: ${command}`);
        console.error('💡 Run "postflame help" for usage information');
        process.exit(1);
      }
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
