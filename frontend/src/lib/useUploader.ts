// ─────────────────────────────────────────────────────────────────────────────
// useUploader — reactive upload hook
//
// Mirrors the logic in client/upload.js, adapted for the browser:
//   1. POST /api/files      → create FileMetadata → get fileId
//   2. Split file into 4 MB chunks
//   3. For each chunk:
//        POST /api/files/:fileId/assign-nodes  → get 2 node ports
//        POST /node/<port>/upload  (chunk blob) to both nodes in parallel
//        POST /api/chunks  → record chunk → node mapping
//   4. Returns progress and resolves with { fileId, totalChunks }
//
// The hook is non-blocking — callers receive incremental updates via the
// returned `state` object so UI can reflect per-chunk replica status.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import {
  assignNodes,
  createFile,
  recordChunk,
  uploadChunkToNode,
} from './api';
import type { ChunkProgress, UploadState } from '../types';

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

// ── helpers ─────────────────────────────────────────────────────────────────

function* chunkIndices(total: number) {
  for (let i = 0; i < total; i++) yield i;
}

async function uploadChunk(
  port: number,
  blob: Blob,
  filename: string,
): Promise<{ port: number; ok: boolean; error?: string }> {
  try {
    const result = await uploadChunkToNode(port, blob, filename);
    if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.text}`);
    return { port, ok: true };
  } catch (err) {
    return { port, ok: false, error: String(err) };
  }
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useUploader() {
  const [state, setState] = useState<UploadState>({
    totalChunks: 0,
    completedChunks: 0,
    chunks: [],
    status: 'idle',
  });

  const upload = useCallback(async (file: File): Promise<{ fileId: string; totalChunks: number }> => {
    const fileBuffer = await file.arrayBuffer();
    const total = Math.ceil(fileBuffer.byteLength / CHUNK_SIZE);

    // 1. Create file metadata
    setState({
      fileId: undefined,
      fileName: file.name,
      totalChunks: total,
      completedChunks: 0,
      chunks: Array.from({ length: total }, (_, i) => ({
        chunkIndex: i,
        total,
        nodeStatuses: new Map(),
      })),
      status: 'uploading',
    });

    let fileId: string;

    try {
      const meta = await createFile({
        name: file.name,
        size: file.size,
        content_type: file.type || 'application/octet-stream',
      });
      fileId = meta._id;

      setState((s) => ({ ...s, fileId }));

      // 2. Process each chunk
      for (const i of chunkIndices(total)) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);
        const chunkBuffer = fileBuffer.slice(start, end);
        const chunkName = `${file.name}-chunk-${i}`;

        // 2a. Assign 2 storage nodes (round-robin)
        const { nodes } = await assignNodes(fileId, i);

        // 2b. Upload to both nodes in parallel
        const results = await Promise.all(
          nodes.map((n) => uploadChunk(n.port, new Blob([chunkBuffer]), chunkName)),
        );

        // 2c. Record each node mapping in MongoDB
        await Promise.all(
          nodes.map((n) =>
            recordChunk({ fileId, chunkIndex: i, nodeId: n.nodeId, chunkName }),
          ),
        );

        // 2d. Update per-chunk progress
        const nodeStatuses = new Map<string, ChunkProgress['nodeStatuses'] extends Map<string, infer V> ? V : never>();
        for (const r of results) {
          nodeStatuses.set(String(r.port), r.ok ? 'done' : 'failed');
        }

        setState((s) => ({
          ...s,
          completedChunks: s.completedChunks + 1,
          chunks: s.chunks.map((c) =>
            c.chunkIndex === i ? { ...c, nodeStatuses: nodeStatuses as ChunkProgress['nodeStatuses'] } : c,
          ),
        }));
      }

      setState((s) => ({ ...s, status: 'done' }));
      return { fileId, totalChunks: total };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, status: 'error', error: msg }));
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ totalChunks: 0, completedChunks: 0, chunks: [], status: 'idle' });
  }, []);

  return { state, upload, reset };
}
