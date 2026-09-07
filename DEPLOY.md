# Render Deployment Plan

## Overview

Deploy the distributed file storage system to Render.com using Docker. Each service becomes its own Web Service with a public URL. Cross-service communication is driven by environment variables (no more hardcoded `localhost` or Docker service names).

**Storage is ephemeral on Render's free tier** — files are lost on redeploy/restart. This is acceptable for a portfolio/demo deployment. For production, attach a Render Persistent Disk to each storage node.

## Architecture

| Component | Render Service Type | Runtime | Source |
|-----------|---------------------|---------|--------|
| `metadata` | Web Service | Docker | `src/Dockerfile` |
| `storage-1..4` | Web Service | Docker | `storage-node/Dockerfile` |
| `frontend` | Web Service | Docker | `frontend/Dockerfile` |
| `mongo` | (none — Atlas) | — | External MongoDB Atlas |

**Six Render services total.** No MongoDB service needed; we already use Atlas.

## Required Changes (7 files)

### 1. `frontend/nginx.conf` → renamed to `frontend/nginx.conf.template`

Replace hardcoded Docker service names with env-var placeholders. The `envsubst` step at container startup substitutes real URLs.

```nginx
events {}
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        # Metadata server API
        location /api/ {
            proxy_pass ${METADATA_URL}/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Storage node proxy — URLs injected at startup via envsubst
        location /node/5001/ { proxy_pass ${STORAGE_1_URL}/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
        location /node/5002/ { proxy_pass ${STORAGE_2_URL}/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
        location /node/5003/ { proxy_pass ${STORAGE_3_URL}/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
        location /node/5004/ { proxy_pass ${STORAGE_4_URL}/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### 2. `frontend/docker-entrypoint.sh` (new file)

Runs `envsubst` to template the nginx config, then starts nginx.

```sh
#!/bin/sh
set -e

envsubst '${METADATA_URL} ${STORAGE_1_URL} ${STORAGE_2_URL} ${STORAGE_3_URL} ${STORAGE_4_URL}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
```

Make it executable: `chmod +x frontend/docker-entrypoint.sh` (or rely on `RUN chmod` in the Dockerfile).

### 3. `frontend/Dockerfile` (modified)

Update to use the template + entrypoint:

```dockerfile
# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM nginx:alpine

# envsubst is provided by busybox in the nginx alpine image
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html

# Template (gets envsubst'd at startup) + entrypoint script
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
```

### 4. `src/server.js` (modified)

Add CORS so the frontend on a different origin can call the API:

```js
// At the top, after express import:
const cors = require('cors');

// After app.use(express.json()):
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
```

### 5. `package.json` (project root — used by `src/Dockerfile`)

Add `cors` to dependencies:

```json
"dependencies": {
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "form-data": "^4.0.6",
  "mongoose": "^8.5.1",
  "node-fetch": "^2.7.0",
  "uuid": "^14.0.2"
}
```

After editing, run `npm install` locally to update `package-lock.json`, then commit both.

### 6. `docker/register-nodes.js` (modified)

Read node URLs from env vars so the same script works in Docker (using service names) and on Render (using public URLs):

```js
"use strict";

const http = require("http");

const NODES = [
  { nodeId: "node-5001", port: 5001, url: process.env.STORAGE_1_URL || "http://storage-1:5001", status: "active" },
  { nodeId: "node-5002", port: 5002, url: process.env.STORAGE_2_URL || "http://storage-2:5002", status: "active" },
  { nodeId: "node-5003", port: 5003, url: process.env.STORAGE_3_URL || "http://storage-3:5003", status: "active" },
  { nodeId: "node-5004", port: 5004, url: process.env.STORAGE_4_URL || "http://storage-4:5004", status: "active" },
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
```

### 7. `render.yaml` (new file at project root)

Blueprint that declares all 6 services. Render auto-detects this file when you connect the repo.

```yaml
services:
  - type: web
    name: dfs-metadata
    runtime: docker
    dockerfilePath: ./src/Dockerfile
    envVars:
      - key: MONGODB_URI
        sync: false   # set manually in Render dashboard
      - key: PORT
        value: 3000
      - key: CORS_ORIGIN
        value: https://dfs-frontend.onrender.com
    healthCheckPath: /health

  - type: web
    name: dfs-storage-1
    runtime: docker
    dockerfilePath: ./storage-node/Dockerfile
    envVars:
      - key: PORT
        value: 5001
      - key: STORAGE_DIR
        value: /app/storage
      - key: PUBLIC_URL
        value: https://dfs-storage-1.onrender.com
    healthCheckPath: /health

  - type: web
    name: dfs-storage-2
    runtime: docker
    dockerfilePath: ./storage-node/Dockerfile
    envVars:
      - key: PORT
        value: 5002
      - key: STORAGE_DIR
        value: /app/storage
      - key: PUBLIC_URL
        value: https://dfs-storage-2.onrender.com
    healthCheckPath: /health

  - type: web
    name: dfs-storage-3
    runtime: docker
    dockerfilePath: ./storage-node/Dockerfile
    envVars:
      - key: PORT
        value: 5003
      - key: STORAGE_DIR
        value: /app/storage
      - key: PUBLIC_URL
        value: https://dfs-storage-3.onrender.com
    healthCheckPath: /health

  - type: web
    name: dfs-storage-4
    runtime: docker
    dockerfilePath: ./storage-node/Dockerfile
    envVars:
      - key: PORT
        value: 5004
      - key: STORAGE_DIR
        value: /app/storage
      - key: PUBLIC_URL
        value: https://dfs-storage-4.onrender.com
    healthCheckPath: /health

  - type: web
    name: dfs-frontend
    runtime: docker
    dockerfilePath: ./frontend/Dockerfile
    envVars:
      - key: METADATA_URL
        value: https://dfs-metadata.onrender.com
      - key: STORAGE_1_URL
        value: https://dfs-storage-1.onrender.com
      - key: STORAGE_2_URL
        value: https://dfs-storage-2.onrender.com
      - key: STORAGE_3_URL
        value: https://dfs-storage-3.onrender.com
      - key: STORAGE_4_URL
        value: https://dfs-storage-4.onrender.com
```

## Environment Variables Summary

### `metadata` service
| Key | Value | Notes |
|-----|-------|-------|
| `MONGODB_URI` | `<Atlas connection string>` | **Set manually in dashboard — `sync: false`** |
| `PORT` | `3000` | |
| `CORS_ORIGIN` | `https://dfs-frontend.onrender.com` | Update if you rename service |

### `storage-1` through `storage-4` services
Each has identical config except `PORT`:
| Key | Value |
|-----|-------|
| `PORT` | `5001` / `5002` / `5003` / `5004` |
| `STORAGE_DIR` | `/app/storage` |
| `PUBLIC_URL` | `https://dfs-storage-N.onrender.com` |

### `frontend` service
| Key | Value |
|-----|-------|
| `METADATA_URL` | `https://dfs-metadata.onrender.com` |
| `STORAGE_1_URL` | `https://dfs-storage-1.onrender.com` |
| `STORAGE_2_URL` | `https://dfs-storage-2.onrender.com` |
| `STORAGE_3_URL` | `https://dfs-storage-3.onrender.com` |
| `STORAGE_4_URL` | `https://dfs-storage-4.onrender.com` |

## Deployment Order

1. **Create Render account** + connect GitHub repo `sampada620/shard-distributed-storage`
2. **Apply all 7 code changes** listed above (commit + push)
3. **Create Blueprint** in Render pointing to the repo → Render reads `render.yaml` and creates all 6 services
4. **Set `MONGODB_URI`** in the metadata service dashboard (sync: false secret)
5. **Wait for all services to deploy** and become healthy
6. **Trigger node registration** — render.yaml doesn't have a one-shot job like Docker Compose does. Options:
   - Run `register-nodes.js` locally with `METADATA_URL=https://dfs-metadata.onrender.com` and `STORAGE_N_URL=https://dfs-storage-N.onrender.com`
   - Or POST to each storage node's `/health` from a manual `curl`, then call the metadata API directly
   - Or add a Cron Job service in render.yaml that runs registration on a schedule
7. **Test end-to-end** via the frontend URL

## Important Notes

- **Render free tier** spins down Web Services after 15 minutes of inactivity. First request after a long idle period will be slow (cold start).
- **Ephemeral storage** on free tier: `/app/storage` is wiped on every redeploy. Acceptable for demo; not for production.
- **No persistent disk** on free tier. Upgrade to a paid plan to attach disks to each storage node.
- **The `register` one-shot job from Docker Compose doesn't exist in render.yaml** — you'll need to run registration manually (see step 6 above), or add a Cron Job.

## Cost (Free Tier)

| Service | Cost |
|---------|------|
| 6 Web Services | $0 (free tier) |
| MongoDB Atlas | $0 (M0 free cluster) |
| Persistent Disk | Not available on free tier |
| **Total** | **$0/month** |

## Resuming Tomorrow

When you come back to this, start by:
1. Reading this file top-to-bottom
2. Applying changes 1–7 in order (file by file)
3. Committing with a message like `chore: prepare for Render deployment`
4. Pushing to GitHub
5. Creating the Render Blueprint from the dashboard

The plan is complete and ready to execute.
