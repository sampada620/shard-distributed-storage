# Distributed File Storage System
## Goal
Build a distributed file storage system that splits files into chunks, replicates them across multiple storage nodes for fault tolerance, and provides a unified API for upload, download, and file management.

## Tech Stack
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Frontend: React + Framer Motion (animations)
- Containerization: Docker + Docker Compose

## Core Rules
- Chunk size: 4MB
- Replication factor: 2 (every chunk stored on 2 different nodes)
- If a node fails during download, automatically retry from the replica

## Build Order
1. Single storage node (upload/download endpoints)
2. Chunking + merging logic
3. Run multiple storage node instances
4. **Metadata server + MongoDB schema**
5. Connect upload flow end-to-end
6. Connect download flow end-to-end
7. Add replication + fault tolerance
8. Build React frontend with animations
9. Dockerize everything

## Current Status
- [x] Stage 1
- [x] Stage 2
- [x] Stage 3
- **[x] Stage 4**
- [x] Stage 5
- [x] Stage 6
- [x] Stage 7
- [x] Stage 8
- [x] Stage 9

## Notes
### Stage 1 — Single Storage Node
- Built `storage-node/server.js` using Node.js + Express + Multer
- `POST /upload` — accepts a file via multipart form, saves it to `storage-node/storage/`, returns the saved filename
- `GET /chunk/:filename` — serves the file back by name, returns 404 JSON if not found
- Auto-creates the `storage/` directory on startup if it doesn't exist
- Tested with `curl.exe` on Windows (note: `curl` in PowerShell is an alias for `Invoke-WebRequest` — always use `curl.exe`)
- Upload, download, and 404 handling all confirmed working

### Stage 2 — Chunking + Merging Logic
- Built `chunker/chunker.js` — standalone utility module (CommonJS)
- `chunkAndUpload(filePath, nodeUrl)` — reads file, splits into 4 MB slices, POSTs each to `/upload`
- Chunk naming: `<originalName>-chunk-<index>` (e.g. `video.mp4-chunk-0`)
- Returns ordered array of chunk filenames saved on the node
- `downloadAndMerge(chunkNames, nodeUrl, outputPath)` — fetches each chunk via `/chunk/:filename`, concatenates in order, writes to `outputPath`
- `CHUNK_SIZE = 4 * 1024 * 1024` (4 MB) — matches project spec
- Uses `node-fetch` v2 + `form-data` for multipart POSTs (CommonJS compatible)
- `chunker/test-chunker.js` — end-to-end test: generates 10 MB random file (3 chunks), uploads, downloads, merges, verifies SHA-256 hash integrity
- Storage node (`server.js`) required **zero changes** — chunk filenames work as-is
- Run test: start `storage-node/server.js`, then `node chunker/test-chunker.js`

### Stage 3 — Multiple Storage Node Instances
- Added `STORAGE_DIR` env var to `storage-node/server.js` (falls back to `storage/` — fully backwards-compatible)
- Added `GET /health` endpoint → returns `{ status, port, storageDir }` (used by verify script + future metadata server)
- `start-nodes.js` (project root) — pure Node.js launcher, spawns 4 instances:
  - port 5001 → `storage-node/storage-5001/`
  - port 5002 → `storage-node/storage-5002/`
  - port 5003 → `storage-node/storage-5003/`
  - port 5004 → `storage-node/storage-5004/`
- Prefixes each child's logs with `[node-500X]`; Ctrl+C kills all children cleanly
- `verify-nodes.js` (project root) — pings `/health` on all 4 ports, prints status table, exits non-zero if any node is down
- Confirmed: all 4 nodes started, auto-created their storage dirs, passed `/health` checks
- Start: `node start-nodes.js` | Verify: `node verify-nodes.js`

### Stage 4 — Metadata Server
- ✅ MongoDB Atlas connection established
- ✅ Metadata server built with File, Chunk, Node, ReplicationLog schemas
- ✅ Fixed 4 bugs during testing:
  - Auth placeholder in .env file
  - File naming conflict with JS built-in (File -> FileMetadata)
  - "exports" vs "module.exports" bug in schema.js
  - Forced _id validation error (removed explicit _id field)
- ✅ POST /files tested successfully with auto-generated _id:
  ```json
  {
    "name": "test.txt",
    "size": 1024,
    "content_type": "text/plain",
    "_id": "6a8acc20ce2772924e27aef6",
    "created_at": "2026-08-23T10:32:00.382Z",
    "__v": 0
  }
  ```### Stage 5 — Connect Upload Flow End-to-End
- ✅ Built client/upload.js — full upload flow: chunking, node assignment via round-robin, parallel upload to 2 nodes (replication factor 2), chunk-to-node mapping saved in MongoDB
- ✅ Tested successfully with test.txt — File ID: 6a8f4b02c6e5879401dfc05d
- ✅ Fixed issue: storage nodes needed to be registered with metadata server via POST /nodes before assign-nodes would work

### Stage 6 — Connect Download Flow End-to-End
- ✅ Confirmed `GET /chunks/file/:fileId` endpoint already exists in metadata server — returns chunks sorted by chunkIndex
- ✅ Added `chunkName` field to Chunk schema (was missing — existing chunks inferred from filename pattern)
- ✅ Built client/download.js — full download flow: fetches chunk-to-node mapping, builds nodeId→URL map from GET /nodes/active, downloads each chunk with primary→replica fallback, reassembles in chunkIndex order
- ✅ Tested successfully with fileId 6a8f4b02c6e5879401dfc05d (test.txt, 394 bytes)
- ✅ Verified downloaded content matches original file byte-for-byte

### Stage 7 — Replication + Fault Tolerance
- ✅ Uploaded test file — chunk replicated to nodes 5001 and 5002
- ✅ Killed node-5001 process to simulate a crash
- ✅ Download automatically failed over to node-5002 and succeeded
- ✅ SHA-256 hash confirmed byte-identical to original file
- ✅ Restarted node-5001, all 4 nodes healthy again

### Stage 8 — React Frontend with Animations
- ✅ Scaffolding: Vite + React + TypeScript in `frontend/` folder
- ✅ Tailwind CSS v4 (CSS-first config, no tailwind.config.js)
- ✅ Tailwind Vite plugin: `@tailwindcss/vite`
- ✅ Installed: `framer-motion`, `simplex-noise`
- ✅ `GET /files` endpoint added to metadata server (`src/server.js`) for file listing
- ✅ Vite proxy configured:
  - `/api/*` → `http://localhost:3000` (metadata server)
  - `/node/<port>/*` → `http://localhost:<port>` (dynamic, per storage node)
- ✅ `src/types/index.ts` — TypeScript interfaces mirroring MongoDB schemas
- ✅ `src/lib/api.ts` — API wrapper with typed fetch helpers
- ✅ `src/lib/useUploader.ts` — reactive upload hook (mirrors `client/upload.js`, browser-native)
- ✅ `src/lib/useDownloader.ts` — reactive download hook (mirrors `client/download.js`)
- ✅ `src/components/DropZone.tsx` — drag-and-drop + per-chunk replica status
- ✅ `src/components/FileList.tsx` — file list from `GET /files`, auto-refresh, download with fallback trace
- ✅ `src/components/ui/vortex.tsx` — real Aceternity Vortex canvas particle animation (from user-provided source)
- ✅ `@/` path alias configured in `tsconfig.app.json` + `vite.config.ts`
- ✅ `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- ✅ Dev server: `http://localhost:5173`
- ✅ Both proxies verified: `GET /api/nodes/active` (200) and `GET /node/5001/health` (200)
- ✅ Production build: clean, 0 warnings, 360 KB JS + 20 KB CSS (gzipped: 115 KB + 4.6 KB)

### Stage 9 — Dockerize Everything
- ✅ All 6 services containerized and running via `docker compose`:
  - **mongo** — `mongo:7` official image, persistent `mongo-data` volume
  - **metadata** — `node:20-alpine` from `src/Dockerfile`, exposes port 3000
  - **storage-1..4** — single reusable image from `storage-node/Dockerfile`, differentiated by `PORT` and `STORAGE_DIR` env vars
  - **register** — one-shot job that POSTs all 4 nodes to `metadata/nodes` after they pass health checks
  - **frontend** — multi-stage build (Vite → nginx) from `frontend/Dockerfile`
- ✅ Healthchecks on every long-running service (mongosh, `/health` endpoints)
- ✅ Dependency ordering enforced with `condition: service_healthy`
- ✅ `MONGODB_URI` injected from `.env` (Atlas connection preserved)
- ✅ nginx proxies `/api/*` → metadata and `/node/<port>/*` → storage nodes (mirrors the Vite dev proxy)
- ✅ `frontend/nginx.conf` maps ports 5001–5004 to `storage-1..4` Docker service names
- ✅ `.dockerignore` files in each build context to keep images lean
- ✅ End-to-end verified via `docker/smoke-test.js`: POST `/files`, GET `/nodes/active`, POST `/files/:id/assign-nodes` all succeed through the frontend nginx (port 5173)
- ✅ `docker compose ps` shows all 7 containers healthy

#### nginx proxy fix (Docker download bug)
- **Symptom**: Browser download failed with "All replicas failed for chunk 0" — `GET /node/5001/health` returned `502 Bad Gateway` through the nginx proxy
- **Root cause**: Original `nginx.conf` used a `map` directive keyed on `$request_uri` to dynamically pick the upstream. The regex `~^/node/5001/` matched against the full request URI, but the resulting `$storage_upstream` was not being applied to `proxy_pass` correctly (the variable resolved to an empty string at request time, so nginx tried `proxy_pass http://;` and 502'd)
- **Fix**: Replaced the dynamic `map` with **4 explicit `location` blocks** — one per port — each statically pointing to the correct Docker service name (`http://storage-1:5001/`, etc.). No variable interpolation, no regex, no surprises
- **Also added**: `include /etc/nginx/mime.types;` so the Vite `.js` bundle is served as `application/javascript` (without it, modules were served as `text/plain` and browsers rejected them with a strict-MIME error)
- **Verified**: `docker exec dfs-frontend curl -sI http://localhost:80/node/5001/health` → `200 OK`; full upload + download via `docker/e2e-test.js` returns content byte-for-byte; manual browser upload + download through `http://localhost:5173` works end-to-end with replication indicators visible

