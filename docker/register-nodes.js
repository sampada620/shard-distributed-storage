// ============================================================
// docker/register-nodes.js
// Registers all 4 storage nodes with the metadata server.
// Runs once after all containers are healthy.
//
// Usage:  node register-nodes.js
// Env:    METADATA_URL  (default: http://localhost:3000)
// ============================================================

"use strict";

const http = require("http");

const NODES = [
  { nodeId: "node-5001", port: 5001, status: "active" },
  { nodeId: "node-5002", port: 5002, status: "active" },
  { nodeId: "node-5003", port: 5003, status: "active" },
  { nodeId: "node-5004", port: 5004, status: "active" },
];

const METADATA_URL = process.env.METADATA_URL || "http://metadata:3000";

function registerNode(node) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(node);
    const url = new URL(`${METADATA_URL}/nodes`);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Registered ${node.nodeId} (port ${node.port})`);
            resolve();
          } else {
            reject(
              new Error(
                `Failed to register ${node.nodeId}: ${res.statusCode} ${body}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  for (const node of NODES) {
    try {
      await registerNode(node);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log("All nodes registered successfully");
}

main();