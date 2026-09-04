'use strict';

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Import the shared chunking and upload helpers from the project's chunker module
const { chunkAndUpload, downloadAndMerge } = require('../chunker/chunker');

const METADATA_BASE = 'http://localhost:3000';

async function main() {
  // ----- 1. Parse CLI arguments ------------------------------------------------
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node client/upload.js <path-to-file>');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const fileName = path.basename(filePath);

  // ----- 2. Validate file existence -------------------------------------------
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (e) {
    console.error(`❌ File not accessible: ${filePath}`);
    process.exit(1);
  }

  // ----- 2a. Create file metadata (optional, depends on your backend) ----------
  // For simplicity we assume a fileId is already known or we create one here.
  // In this example we create a new file entry to obtain a fileId.
  const fileCreateResp = await fetch(`${METADATA_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: fileName,
      size: fs.statSync(filePath).size,
      content_type: 'application/octet-stream',
    }),
  });
  if (!fileCreateResp.ok) {
    throw new Error(`Failed to create file metadata: ${await fileCreateResp.text()}`);
  }
  const fileMeta = await fileCreateResp.json();
  const fileId = fileMeta._id; // MongoDB ObjectId returned by the server
  console.log(`🗂 Created file metadata, fileId = ${fileId}`);

  // ----- 3. Read file content --------------------------------------------------
  const fileBuffer = await fs.promises.readFile(filePath);
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB, matching the server‑side constant
  const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
  console.log(`📦 File size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MiB → ${totalChunks} chunk(s)`);

  // ----- 3. Upload each chunk --------------------------------------------------
  for (let i = 0; i < totalChunks; ++i) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
    const chunkBuffer = fileBuffer.slice(start, end);
    const chunkName = `${fileName}-chunk-${i}`;

    console.log(`\n   📦 Processing chunk ${i + 1}/${totalChunks}: ${chunkName}`);

    // ----- 3a. Determine which storage nodes should store this chunk -----------
    const assignResp = await fetch(`${METADATA_BASE}/files/${fileId}/assign-nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkIndex: i })
    });
    if (!assignResp.ok) {
      throw new Error(`Failed to assign nodes: ${await assignResp.text()}`);
    }
    const { nodes } = await assignResp.json(); // {nodeId, port, url}
    console.log(`   → Assigned nodes: ${nodes.map(n => n.url).join(', ')}`);

    // ----- 3b. Upload the chunk to both assigned nodes -------------------------
    // Re‑use the shared `chunkAndUpload` helper which already knows how to
    // build a multipart request and handle the server response.
    // Note: `chunkAndUpload` expects a file path, but we already have the buffer.
    // To keep the API simple we call the underlying upload logic directly:
    for (const node of nodes) {
      console.log(`   ⇢ Uploading to ${node.url}`);
      const form = new FormData();
      form.append('file', chunkBuffer, {
        filename: chunkName,
        contentType: 'application/octet-stream',
      });

      const uploadResp = await fetch(`${node.url}/upload`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      });

      if (!uploadResp.ok) {
        const err = await uploadResp.text();
        throw new Error(`Upload to ${node.url} failed: ${uploadResp.status} ${err}`);
      }
      console.log(`   ✓ Uploaded to ${node.url}`);

      // Optional: Persist chunk metadata on the server
      await fetch(`${METADATA_BASE}/chunks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          chunkIndex: i,
          nodeId: node.nodeId,
          chunkName,
        }),
      });
    }
  }

  // ----- 4. Verify integrity (optional) ----------------------------------------
  console.log('\n✅ Upload complete! File replicated with replication factor 2.');
  console.log(`   File ID: ${fileId}`);
  console.log(`   Total chunks: ${totalChunks}`);
}

// Run the script when executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Upload failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };