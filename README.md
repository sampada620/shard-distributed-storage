# Shard — Distributed File Storage System

> **A fault-tolerant distributed file storage system with automatic replication and node-failure recovery.**

---

![Project Status](https://img.shields.io/badge/status-complete-brightgreen)
![Tech Stack](https://img.shields.io/badge/tech-nodejs%20%7C%20express%20%7C%20mongodb%20%7C%20react%20%7C%20docker-blue)
![License](https://img.shields.io/badge/license-MIT-gray)

---

## ✨ Key Features

- **File chunking** — Files split into 4 MB chunks for parallel upload/download
- **Replication factor of 2** — Every chunk stored on 2 independent storage nodes
- **Automatic failover** — If a node crashes mid-download, the system silently retries from the replica
- **Real-time React frontend** — Drag-and-drop upload with per-chunk replica status indicators
- **Fully containerized** — Every service runs in Docker; one command to spin up the entire system

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express |
| **Database** | MongoDB (Mongoose ODM) |
| **Frontend** | React + TypeScript + Framer Motion |
| **Styling** | Tailwind CSS v4 |
| **Containerization** | Docker + Docker Compose |
| **Infrastructure** | Docker Compose (local) / Render (cloud) |

---

## 🏗 Architecture

The system consists of three core components:

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                        │
│   Upload ──► POST /files (metadata)                           │
│              │                                                 │
│              ▼                                                 │
│        GET /files/:id/assign-nodes ──► 2 nodes selected       │
│              │                                                 │
│              ▼                                                 │
│        Parallel upload to 2 storage nodes (replication)       │
│              │                                                 │
│              ▼                                                 │
│        Download: fetch chunks, primary→replica fallback       │
└───────────────────────┬──────────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌─────────────────────┐  ┌─────────────────────────────────────┐
│   METADATA SERVER   │  │       STORAGE NODES (×4)             │
│   ────────────────  │  │   ─────────────────────────────      │
│   • Node registry    │  │   • Receives chunk uploads          │
│   • File metadata    │  │   • Serves chunks by filename       │
│   • Chunk→node map   │  │   • Health endpoint (/health)       │
│   • Replication log  │  │   • Port: 5001, 5002, 5003, 5004     │
│   • GET /files       │  │   • Directory: /app/storage         │
│   • GET /nodes/active│  │                                   │
│   • POST /nodes      │  │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│   • POST /chunks     │  │   │5001 │ │5002 │ │5003 │ │5004 │ │
│   ────────────────  │  │   └─────┘ └─────┘ └─────┘ └─────┘ │
│   MongoDB Atlas      │  └─────────────────────────────────────┘
└─────────────────────┘
```

### How they interact

1. **Client → Metadata**: Registers files, requests node assignments, fetches chunk-to-node mappings
2. **Client → Storage Nodes**: Uploads/downloads chunks directly (parallel, with replica fallback)
3. **Metadata → Storage Nodes**: Keeps node registry in sync via `POST /nodes`; replication logs track which chunks live where

---

## ▶️ Running Locally

All services are containerized. One command starts everything:

```bash
# Clone the repo
git clone https://github.com/sampada620/shard-distributed-storage.git
cd shard-distributed-storage

# Start all 7 containers (metadata, 4 storage nodes, frontend, register)
docker compose up -d

# Verify all nodes are healthy
node verify-nodes.js
```

**Services:**

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Metadata API | `http://localhost:3000` |
| Storage Node 1 | `http://localhost:5001` |
| Storage Node 2 | `http://localhost:5002` |
| Storage Node 3 | `http://localhost:5003` |
| Storage Node 4 | `http://localhost:5004` |

**Environment setup:**

```bash
# Copy .env template and add your MongoDB Atlas URI
cp .env.example .env
# Edit .env with your MONGODB_URI
docker compose up -d
```

**Stop everything:**

```bash
docker compose down
```

**Clean start (remove all data):**

```bash
docker compose down -v
```

---

## 🎬 Demo

Full system running locally via Docker — watch the demo video showing upload, replication across 4 nodes, and live fault-tolerance recovery (killing a node mid-operation and successful failover):

📹 [Watch Demo Video](https://drive.google.com/file/d/10W9pZHT1kHEAgNg1AKSnI1U7kcoAHPWM/view?usp=sharing)

---

## 🧩 Technical Challenges & Solved

| Challenge | Solution |
|---|---|
| **Node failure during download** | Implemented primary→replica fallback; tested by killing `node-5001` mid-download — system automatically retried from replica, verified SHA-256 hash matched |
| **Docker networking (nginx proxy)** | Replaced dynamic `map` + regex with 4 explicit `location` blocks pointing to Docker service names — eliminated variable interpolation bugs causing 502 errors |
| **MongoDB Atlas integration** | Connected metadata server to Atlas free-tier cluster; injected `MONGODB_URI` via `.env` and Docker secrets |
| **Cross-origin API calls** | Added `cors` middleware to metadata server with configurable `CORS_ORIGIN` |
| **MIME type rejection** | Added `include /etc/nginx/mime.types;` so Vite `.js` bundles served as `application/javascript` instead of `text/plain` |
| **Node registration in Docker** | Created `register-nodes.js` launcher that POSTs all 4 nodes to metadata after health checks pass |

---

## 📄 License

MIT — see `LICENSE` for details.