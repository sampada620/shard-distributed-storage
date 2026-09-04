// End-to-end test: upload a chunk via the frontend nginx proxy and
// then download it back. This exercises the full request flow that
// the React frontend uses.
const http = require("http");
const fs = require("fs");

const API = "http://localhost:5173/api";
const NODE = "http://localhost:5173/node";

function req(method, url, body, contentType) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method,
      headers: {},
    };
    if (data) {
      opts.headers["Content-Type"] = contentType || "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 1. Register a new file
  const fileContent = "hello from docker end-to-end test!";
  const f = await req("POST", `${API}/files`, {
    name: "e2e-test.txt",
    size: Buffer.byteLength(fileContent),
    content_type: "text/plain",
  });
  const fileId = JSON.parse(f.body.toString())._id;
  console.log(`✅ Created file: ${fileId}`);

  // 2. Assign two nodes for chunk 0
  const a = await req("POST", `${API}/files/${fileId}/assign-nodes`, { chunkIndex: 0 });
  const assigned = JSON.parse(a.body.toString());
  console.log(`✅ Assigned nodes: ${assigned.nodes.map(n => n.nodeId).join(", ")}`);

  // 3. Upload chunk to first node via proxy
  const node1 = assigned.nodes[0];
  const boundary = "----test" + Date.now();
  const formData = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="e2e-test.txt-chunk-0"`,
    "Content-Type: application/octet-stream",
    "",
    fileContent,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const up = await req("POST", `${NODE}/${node1.port}/upload`, formData, `multipart/form-data; boundary=${boundary}`);
  console.log(`✅ Upload to ${node1.nodeId}: HTTP ${up.status} — ${up.body.toString().trim()}`);

  // 4. Record chunk mapping
  await req("POST", `${API}/chunks`, {
    fileId,
    chunkIndex: 0,
    nodeId: node1.nodeId,
    chunkName: "e2e-test.txt-chunk-0",
  });
  console.log(`✅ Recorded chunk mapping`);

  // 5. Download via proxy
  const dl = await req("GET", `${NODE}/${node1.port}/chunk/e2e-test.txt-chunk-0`);
  const downloaded = dl.body.toString();
  console.log(`✅ Downloaded from ${node1.nodeId}: HTTP ${dl.status}`);
  console.log(`   Content: "${downloaded}"`);

  if (downloaded === fileContent) {
    console.log(`\n🎉 End-to-end test PASSED — content matches byte-for-byte`);
  } else {
    console.log(`\n❌ End-to-end test FAILED — content mismatch`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
