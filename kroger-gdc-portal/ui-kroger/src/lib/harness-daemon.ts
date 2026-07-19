import { runFullStackTestHarness } from './test-harness';
import fs from 'fs';
import path from 'path';

// Read config from command line argument
const configArg = process.argv[2];
if (!configArg) {
  console.error("Missing config JSON argument");
  process.exit(1);
}

let config: any = {};
try {
  config = JSON.parse(configArg);
} catch (e: any) {
  console.error("Failed to parse config JSON:", e.message);
  process.exit(1);
}

// Write PID file so we can abort/kill the daemon later
const pidFile = path.join('/tmp', 'gdc_harness_daemon.pid');
fs.writeFileSync(pidFile, process.pid.toString(), 'utf-8');

console.log(`🚀 Starting GDC E2E Test Harness Daemon (PID: ${process.pid})...`);

runFullStackTestHarness(config)
  .then(() => {
    console.log("✅ GDC E2E Test Harness Daemon execution complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ GDC E2E Test Harness Daemon execution failed:", err);
    process.exit(1);
  });
