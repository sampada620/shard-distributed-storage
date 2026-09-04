'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const METADATA_BASE = 'http://localhost:3000';
const DEFAULT_DOWNLOAD_DIR = './downloads';

async function main() {
  // ----- 1. Parse CLI arguments ------------------------------------------------
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node client/download.js <fileId> [outputPath]');
    process.exit(1);
  }

  const fileId = args[0];
  const outputPath = args[1] || path.join(DEFAULT_DOWNLOAD_DIR, `file-${fileId}`);

  // ----- 2. Fetch chunk metadata ----------------------------------------------
  const chunksResp = await fetch(`${METADATA_BASE}/chunks/file/${fileId}`);
  if (!chunksResp.ok) {
    throw new Error(`Failed to fetch chunk metadata: ${await chunksResp.text()}`);
  }
  const chunks = await chunksResp.json();
  if (chunks.length === 0) {
    console.error(`❌ No chunks found for fileId ${fileId}`);
    process.exit(1);
  }

  // ----- 2a. Also fetch file metadata for original filename (to infer chunkName if missing)
  const fileResp = await fetch(`${METADATA_BASE}/files/${fileId}`);
  const fileMeta = await fileResp.json();
  const originalName = fileMeta?.name || `file-${fileId}`;

  // ----- 3. Build nodeId → URL mapping ----------------------------------------
  // Query all active nodes so we know where to fetch each chunk from
  const nodesResp = await fetch(`${METADATA_BASE}/nodes/active`);
  if (!nodesResp.ok) {
    throw new Error(`Failed to fetch active nodes: ${await nodesResp.text()}`);
  }
  const activeNodes = await nodesResp.json();
  const nodeMap = new Map(activeNodes.map(n => [n.nodeId, `http://localhost:${n.port}`]));

  // ----- 4. Group chunks by chunkIndex (primary + replica) --------------------
  const byIndex = new Map();
  for (const chunk of chunks) {
    if (!byIndex.has(chunk.chunkIndex)) {
      byIndex.set(chunk.chunkIndex, []);
    }
    byIndex.get(chunk.chunkIndex).push(chunk);
  }
  // Sort indices numerically
  const sortedIndices = [...byIndex.keys()].sort((a, b) => a - b);

  // ----- 5. Download each chunk (try primary, fallback to replica) ------------
  const buffers = [];
  for (const index of sortedIndices) {
    const replicas = byIndex.get(index);
    let downloaded = false;

    for (const chunk of replicas) {
      const nodeUrl = nodeMap.get(chunk.nodeId);
      if (!nodeUrl) {
        console.log(`   ⚠ Node ${chunk.nodeId} not found in active nodes, skipping`);
        continue;
      }

      // Use stored chunkName, or infer from original filename if not stored (backward compat)
      const chunkName = chunk.chunkName || `${originalName}-chunk-${chunk.chunkIndex}`;

      try {
        console.log(`   📥 Chunk ${index}: trying ${nodeUrl} (${chunkName})`);
        const resp = await fetch(`${nodeUrl}/chunk/${chunkName}`);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const buf = await resp.buffer();
        buffers[index] = buf;
        console.log(`   ✓ Chunk ${index}: ${buf.length} bytes from ${nodeUrl}`);
        downloaded = true;
        break;
      } catch (err) {
        console.log(`   ✗ Chunk ${index}: ${nodeUrl} failed (${err.message})`);
        // Try next replica
      }
    }

    if (!downloaded) {
      throw new Error(`All replicas failed for chunk ${index}`);
    }
  }

  // ----- 6. Concatenate in chunkIndex order and save --------------------------
  const merged = Buffer.concat(buffers);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, merged);

  console.log(`\n✅ Download complete!`);
  console.log(`   File ID: ${fileId}`);
  console.log(`   Chunks: ${sortedIndices.length}`);
  console.log(`   Output: ${outputPath} (${merged.length} bytes)`);
}

// Run the script when executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Download failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
