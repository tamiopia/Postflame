export function logInfo(msg: string) {
    console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);
  }
  
  export function logSuccess(msg: string) {
    console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
  }
  
  export function logError(msg: string) {
    console.error(`\x1b[31m❌ ${msg}\x1b[0m`);
  }
  