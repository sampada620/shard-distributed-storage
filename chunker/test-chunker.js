// ============================================================
// chunker/test-chunker.js
// Stage 2: End-to-end test — chunk, upload, download, merge,
// verify integrity with SHA-256 hash comparison.
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chunkAndUpload, downloadAndMerge, CHUNK_SIZE } = require("./chunker");

// ---- Config ------------------------------------------------
const NODE_URL = "http://localhost:5001";   // storage node address
const TEST_FILE = path.join(__dirname, "test-input.bin");
const MERGED_FILE = path.join(__dirname, "test-output.bin");

// Generate a file slightly larger than 2 chunks so we exercise
// multi-chunk logic without being slow. 10 MB → 3 chunks.
const TEST_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
// ------------------------------------------------------------

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function run() {
  console.log("=".repeat(60));
  console.log("Stage 2 — Chunker End-to-End Test");
  console.log("=".repeat(60));
  console.log(`Chunk size : ${CHUNK_SIZE / 1024 / 1024} MB`);
  console.log(`Test file  : ${TEST_SIZE_BYTES / 1024 / 1024} MB  →  ${Math.ceil(TEST_SIZE_BYTES / CHUNK_SIZE)} chunks expected`);
  console.log(`Storage node: ${NODE_URL}`);
  console.log("");

  // ── Step 1: Create a random test file ──────────────────────
  console.log("── Step 1: Generating test file ──────────────────────────");
  const randomData = crypto.randomBytes(TEST_SIZE_BYTES);
  fs.writeFileSync(TEST_FILE, randomData);
  const originalHash = sha256(TEST_FILE);
  console.log(`Created: ${TEST_FILE}`);
  console.log(`SHA-256: ${originalHash}`);
  console.log("");

  // ── Step 2: Chunk + upload ──────────────────────────────────
  console.log("── Step 2: Chunk & Upload ────────────────────────────────");
  let chunkNames;
  try {
    chunkNames = await chunkAndUpload(TEST_FILE, NODE_URL);
  } catch (err) {
    console.error(`\n❌ UPLOAD FAILED: ${err.message}`);
    console.error("   Make sure the storage node is running:  node storage-node/server.js");
    cleanup();
    process.exit(1);
  }

  const expectedChunks = Math.ceil(TEST_SIZE_BYTES / CHUNK_SIZE);
  if (chunkNames.length !== expectedChunks) {
    console.error(`\n❌ CHUNK COUNT MISMATCH: expected ${expectedChunks}, got ${chunkNames.length}`);
    cleanup();
    process.exit(1);
  }
  console.log(`\nChunk names: ${JSON.stringify(chunkNames)}`);
  console.log(`Chunk count: ${chunkNames.length} ✓`);
  console.log("");

  // ── Step 3: Download + merge ────────────────────────────────
  console.log("── Step 3: Download & Merge ──────────────────────────────");
  try {
    await downloadAndMerge(chunkNames, NODE_URL, MERGED_FILE);
  } catch (err) {
    console.error(`\n❌ DOWNLOAD FAILED: ${err.message}`);
    cleanup();
    process.exit(1);
  }
  console.log("");

  // ── Step 4: Verify integrity ────────────────────────────────
  console.log("── Step 4: Integrity Check ───────────────────────────────");
  const mergedHash = sha256(MERGED_FILE);
  console.log(`Original SHA-256 : ${originalHash}`);
  console.log(`Merged   SHA-256 : ${mergedHash}`);
  console.log("");

  if (originalHash === mergedHash) {
    console.log("✅  PASS — hashes match, file reconstructed perfectly.");
  } else {
    console.error("❌  FAIL — hashes do NOT match. Data was corrupted during chunking/merging.");
    cleanup();
    process.exit(1);
  }

  cleanup();
}

function cleanup() {
  // Remove temp files so the test is repeatable
  for (const f of [TEST_FILE, MERGED_FILE]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
