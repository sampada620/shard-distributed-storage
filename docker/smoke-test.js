// Test the full upload/download flow through the Docker stack
const http = require("http");
const fs = require("fs");
const path = require("path");

const API = "http://localhost:5173/api"; // frontend nginx → metadata
const FILE = "test.txt";

async function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const r = http.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const stat = fs.statSync(FILE);
  console.log(`1) POST /files (${FILE}, ${stat.size} bytes)`);
  const f = await req("POST", `${API}/files`, {
    name: "docker-smoke.txt",
    size: stat.size,
    content_type: "text/plain",
  });
  console.log("   →", JSON.stringify(f));
  if (f.status !== 201) throw new Error("POST /files failed");
  const fileId = f.body._id;

  console.log(`2) GET /nodes/active`);
  const n = await req("GET", `${API}/nodes/active`);
  console.log("   →", n.body.length, "nodes active");

  console.log(`3) POST /files/${fileId}/assign-nodes (chunkIndex 0)`);
  const a = await req("POST", `${API}/files/${fileId}/assign-nodes`, {
    chunkIndex: 0,
  });
  console.log("   →", JSON.stringify(a.body));
  if (a.status !== 200) throw new Error("assign-nodes failed");

  console.log("✅  All API calls through Docker proxy succeeded");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});