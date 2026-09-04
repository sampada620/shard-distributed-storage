// ============================================================
// start-nodes.js  (project root)
// Stage 3: Spawn 4 independent storage node instances on ports
// 5001–5004, each with its own isolated storage directory.
//
// Usage:  node start-nodes.js
// Stop :  Ctrl+C  (gracefully kills all child processes)
// ============================================================

"use strict";

const { spawn } = require("child_process");
const path = require("path");

// -----------------------------------------------------------------
// Node configuration — add or remove entries here to change the
// number of instances or the ports they listen on.
// -----------------------------------------------------------------
const NODE_CONFIGS = [
  { port: 5001, storageDir: "storage-5001" },
  { port: 5002, storageDir: "storage-5002" },
  { port: 5003, storageDir: "storage-5003" },
  { port: 5004, storageDir: "storage-5004" },
];

const SERVER_SCRIPT = path.join(__dirname, "storage-node", "server.js");
const STORAGE_BASE  = path.join(__dirname, "storage-node");

// -----------------------------------------------------------------
// Spawn all instances
// -----------------------------------------------------------------
const children = [];

for (const cfg of NODE_CONFIGS) {
  const label      = `[node-${cfg.port}]`;
  const storageDir = path.join(STORAGE_BASE, cfg.storageDir);

  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    env: {
      ...process.env,
      PORT:        String(cfg.port),
      STORAGE_DIR: storageDir,
    },
    // Don't inherit stdio — we'll pipe and prefix each line ourselves
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Prefix every stdout line with [node-PORT]
  child.stdout.on("data", (data) => {
    String(data)
      .split("\n")
      .filter(Boolean)
      .forEach((line) => console.log(`${label} ${line}`));
  });

  // Prefix every stderr line too
  child.stderr.on("data", (data) => {
    String(data)
      .split("\n")
      .filter(Boolean)
      .forEach((line) => console.error(`${label} [ERR] ${line}`));
  });

  child.on("exit", (code) => {
    console.log(`${label} exited with code ${code}`);
  });

  children.push(child);
  console.log(`Spawned ${label}  (storageDir: ${storageDir})`);
}

console.log(`\nAll ${children.length} nodes started. Press Ctrl+C to stop.\n`);

// -----------------------------------------------------------------
// Graceful shutdown — kill all children when the launcher exits
// -----------------------------------------------------------------
function shutdown() {
  console.log("\nShutting down all storage nodes…");
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
