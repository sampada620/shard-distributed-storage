// ─────────────────────────────────────────────────────────────────────────────
// API wrapper
// All requests are routed through the Vite dev server proxy:
//   - /api/*  -> http://localhost:3000 (metadata server)
//   - /node/<port>/* -> http://localhost:<port> (storage node)
//
// In production you'd point these at real URLs. Keeping them as relative
// paths means no CORS work on the backend.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AssignedNode,
  AssignNodesResponse,
  ChunkMapping,
  FileMetadata,
  StorageNode,
} from '../types';

const API_BASE = '/api';
const NODE_PREFIX = '/node';

// ── Metadata server ──────────────────────────────────────────────────────────

export async function createFile(meta: {
  name: string;
  size: number;
  content_type: string;
}): Promise<FileMetadata> {
  const r = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!r.ok) throw new Error(`createFile: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getFileList(): Promise<FileMetadata[]> {
  const r = await fetch(`${API_BASE}/files`);
  if (!r.ok) throw new Error(`getFileList: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getFile(fileId: string): Promise<FileMetadata> {
  const r = await fetch(`${API_BASE}/files/${fileId}`);
  if (!r.ok) throw new Error(`getFile: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getActiveNodes(): Promise<StorageNode[]> {
  const r = await fetch(`${API_BASE}/nodes/active`);
  if (!r.ok) throw new Error(`getActiveNodes: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function assignNodes(
  fileId: string,
  chunkIndex: number,
): Promise<AssignNodesResponse> {
  const r = await fetch(`${API_BASE}/files/${fileId}/assign-nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunkIndex }),
  });
  if (!r.ok)
    throw new Error(`assignNodes(${chunkIndex}): ${r.status} ${await r.text()}`);
  return r.json();
}

export async function recordChunk(chunk: {
  fileId: string;
  chunkIndex: number;
  nodeId: string;
  chunkName: string;
}): Promise<ChunkMapping> {
  const r = await fetch(`${API_BASE}/chunks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chunk),
  });
  if (!r.ok) throw new Error(`recordChunk: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getChunksForFile(fileId: string): Promise<ChunkMapping[]> {
  const r = await fetch(`${API_BASE}/chunks/file/${fileId}`);
  if (!r.ok) throw new Error(`getChunksForFile: ${r.status} ${await r.text()}`);
  return r.json();
}

// ── Storage node ─────────────────────────────────────────────────────────────

/** Upload a chunk blob to a specific storage node via the dev proxy. */
export async function uploadChunkToNode(
  port: number,
  blob: Blob,
  filename: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const form = new FormData();
  form.append('file', blob, filename);
  const r = await fetch(`${NODE_PREFIX}/${port}/upload`, {
    method: 'POST',
    body: form,
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

/** Download a chunk from a specific storage node (returns ArrayBuffer). */
export async function downloadChunkFromNode(
  port: number,
  chunkName: string,
): Promise<ArrayBuffer> {
  const r = await fetch(`${NODE_PREFIX}/${port}/chunk/${encodeURIComponent(chunkName)}`);
  if (!r.ok)
    throw new Error(`download ${chunkName} from :${port} failed: HTTP ${r.status}`);
  return r.arrayBuffer();
}

/** Convenience: turn a node entry into the proxy URL. */
export function nodeProxyUrl(n: AssignedNode | StorageNode, path = ''): string {
  return `${NODE_PREFIX}/${n.port}${path}`;
}
