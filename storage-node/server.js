// ============================================================
// storage-node/server.js
// Stage 1: Single storage node — upload & download endpoints
// Stage 3: PORT and STORAGE_DIR configurable via env vars so
//          multiple instances can run side-by-side.
// ============================================================

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5001;

// -----------------------------------------------------------------
// 1. Make sure the storage folder exists.
//    STORAGE_DIR can be overridden via env var so each instance
//    (5001, 5002, …) keeps its chunks in its own folder.
//    Falls back to "storage/" for single-node / Stage 1 usage.
// -----------------------------------------------------------------
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, "storage");

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  console.log(`Created storage directory at: ${STORAGE_DIR}`);
}

// -----------------------------------------------------------------
// 2. Configure multer — the middleware that handles file uploads.
//    diskStorage lets us control where and under what name the file
//    is saved.
// -----------------------------------------------------------------
const storage = multer.diskStorage({
  // destination: the folder where the file will be written
  destination: (req, file, cb) => {
    cb(null, STORAGE_DIR);
  },

  // filename: keep the original name so we can retrieve it later.
  // In later stages we'll rename chunks to something like
  // "<fileId>-chunk-<index>" but for now simple names work fine.
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

// -----------------------------------------------------------------
// 3. POST /upload
//    Accepts a single file in the "file" form field, saves it to
//    the storage directory, and returns the saved filename as JSON.
// -----------------------------------------------------------------
app.post("/upload", upload.single("file"), (req, res) => {
  // If multer didn't attach a file, something went wrong
  if (!req.file) {
    return res.status(400).json({ error: "No file received. Make sure you send a field named 'file'." });
  }

  console.log(`[UPLOAD] Saved file: ${req.file.filename}`);

  // Return the saved filename so the client knows what to request later
  res.status(200).json({
    message: "File uploaded successfully",
    filename: req.file.filename,
  });
});

// -----------------------------------------------------------------
// 4. GET /health
//    Lightweight liveness check used by verify-nodes.js and,
//    later, by the metadata server when polling node availability.
// -----------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", port: PORT, storageDir: STORAGE_DIR });
});

// -----------------------------------------------------------------
// 5. GET /chunk/:filename
//    Looks up the file in the storage directory and streams it
//    back to the client.  Returns 404 if the file isn't found.
// -----------------------------------------------------------------
app.get("/chunk/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(STORAGE_DIR, filename);

  // Check whether the file actually exists before trying to send it
  if (!fs.existsSync(filePath)) {
    console.log(`[DOWNLOAD] File not found: ${filename}`);
    return res.status(404).json({ error: `File not found: ${filename}` });
  }

  console.log(`[DOWNLOAD] Serving file: ${filename}`);

  // res.sendFile streams the file and sets Content-Type automatically
  res.sendFile(filePath);
});

// -----------------------------------------------------------------
// 6. Start the server
// -----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Storage node running on http://localhost:${PORT}`);
  console.log(`  Storage dir: ${STORAGE_DIR}`);
  console.log(`  POST /upload          — upload a file`);
  console.log(`  GET  /chunk/:filename — download a file`);
  console.log(`  GET  /health          — liveness check`);
});
