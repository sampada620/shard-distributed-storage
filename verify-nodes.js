// ============================================================
// verify-nodes.js  (project root)
// Stage 3: Ping GET /health on all 4 storage nodes and print
// a status table. Exits with code 1 if any node is unreachable.
//
// Usage:  node verify-nodes.js
// ============================================================

"use strict";

const http = require("http");

const NODES = [
  "http://localhost:5001",
  "http://localhost:5002",
  "http://localhost:5003",
  "http://localhost:5004",
];

// -----------------------------------------------------------------
// healthCheck — returns a Promise that resolves to the parsed JSON
// body or rejects with an error message.
// -----------------------------------------------------------------
function healthCheck(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${url}/health`, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(`HTTP ${res.statusCode}`);
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(`Invalid JSON: ${raw}`);
        }
      });
    });

    req.on("error", (err) => reject(err.message));

    // Give each node 3 seconds to respond
    req.setTimeout(3000, () => {
      req.destroy();
      reject("Timeout (3 s)");
    });
  });
}

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------
async function run() {
  console.log(`Checking ${NODES.length} storage nodes…\n`);

  let allHealthy = true;

  for (const url of NODES) {
    try {
      const body = await healthCheck(url);
      const dir  = require("path").basename(body.storageDir);
      console.log(`  ${url}  ✅  ${body.status}  (storageDir: ${dir})`);
    } catch (err) {
      console.log(`  ${url}  ❌  UNREACHABLE — ${err}`);
      allHealthy = false;
    }
  }

  console.log("");

  if (allHealthy) {
    console.log(`All ${NODES.length} nodes healthy. ✅`);
    process.exit(0);
  } else {
    console.error("One or more nodes are down. Make sure start-nodes.js is running.");
    process.exit(1);
  }
}

run();
