// ============================================================
// chunker/chunker.js
// Stage 2: Split a file into 4 MB chunks → upload to a storage
// node; fetch chunks from a storage node → merge back to a file.
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");

// 4 MB in bytes — matches the project spec
const CHUNK_SIZE = 4 * 1024 * 1024;

// ------------------------------------------------------------
// chunkAndUpload
//
// Reads `filePath` into memory, slices it into CHUNK_SIZE
// pieces, and POSTs each piece to `nodeUrl/upload`.
//
// Chunk filename format: "<originalName>-chunk-<index>"
//   e.g.  "video.mp4-chunk-0", "video.mp4-chunk-1", …
//
// Returns: Promise<string[]>  — ordered list of chunk filenames
//          as saved on the node.
// ------------------------------------------------------------
async function chunkAndUpload(filePath, nodeUrl) {
  const fileBuffer = fs.readFileSync(filePath);
  const originalName = path.basename(filePath);
  const totalSize = fileBuffer.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  console.log(`[CHUNKER] File: ${originalName}`);
  console.log(`[CHUNKER] Size: ${totalSize} bytes`);
  console.log(`[CHUNKER] Splitting into ${totalChunks} chunk(s) of up to ${CHUNK_SIZE} bytes each`);

  const chunkNames = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunkBuffer = fileBuffer.slice(start, end);
    const chunkName = `${originalName}-chunk-${i}`;

    // Build a multipart form — same shape the storage node expects
    const form = new FormData();
    form.append("file", chunkBuffer, {
      filename: chunkName,
      contentType: "application/octet-stream",
      knownLength: chunkBuffer.length,
    });

    console.log(`[CHUNKER] Uploading chunk ${i + 1}/${totalChunks}: ${chunkName} (${chunkBuffer.length} bytes)`);

    const response = await fetch(`${nodeUrl}/upload`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upload failed for chunk ${i} (HTTP ${response.status}): ${errText}`);
    }

    const json = await response.json();
    // json.filename is whatever the storage node saved it as
    chunkNames.push(json.filename);
    console.log(`[CHUNKER]   ✓ Saved as: ${json.filename}`);
  }

  console.log(`[CHUNKER] All ${totalChunks} chunk(s) uploaded.`);
  return chunkNames;
}

// ------------------------------------------------------------
// downloadAndMerge
//
// GETs each chunk in `chunkNames` (in order) from `nodeUrl`,
// concatenates the response bodies, and writes the result to
// `outputPath`.
//
// Returns: Promise<string>  — the outputPath that was written.
// ------------------------------------------------------------
async function downloadAndMerge(chunkNames, nodeUrl, outputPath) {
  console.log(`[MERGER] Downloading ${chunkNames.length} chunk(s) from ${nodeUrl}`);

  const buffers = [];

  for (let i = 0; i < chunkNames.length; i++) {
    const chunkName = chunkNames[i];
    console.log(`[MERGER] Fetching chunk ${i + 1}/${chunkNames.length}: ${chunkName}`);

    const response = await fetch(`${nodeUrl}/chunk/${chunkName}`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Download failed for chunk ${chunkName} (HTTP ${response.status}): ${errText}`);
    }

    // response.buffer() is node-fetch v2's way to get the raw bytes
    const buf = await response.buffer();
    buffers.push(buf);
    console.log(`[MERGER]   ✓ Received ${buf.length} bytes`);
  }

  // Concatenate all chunk buffers into a single file
  const merged = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, merged);

  console.log(`[MERGER] Wrote ${merged.length} bytes → ${outputPath}`);
  return outputPath;
}

module.exports = { chunkAndUpload, downloadAndMerge, CHUNK_SIZE };
