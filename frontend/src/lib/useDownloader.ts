// ─────────────────────────────────────────────────────────────────────────────
// useDownloader — browser equivalent of client/download.js
//
//   1. GET /api/chunks/file/:fileId        → chunk-to-node mapping
//   2. GET /api/files/:fileId              → file metadata (for filename)
//   3. GET /api/nodes/active               → nodeId → port map
//   4. For each chunkIndex in order:
//        try primary node first, then any replica
//   5. Concatenate buffers, save as a Blob, trigger browser download
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import {
  downloadChunkFromNode,
  getActiveNodes,
  getChunksForFile,
  getFile,
} from './api';
import type { ChunkMapping, StorageNode } from '../types';

export interface DownloadLog {
  chunkIndex: number;
  tried: { nodeId: string; ok: boolean; via: 'primary' | 'replica' | 'failed' }[];
}

export function useDownloader() {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (fileId: string) => {
    setBusy(true);
    setError(null);
    setLogs([]);

    try {
      const [chunks, fileMeta, activeNodes] = await Promise.all([
        getChunksForFile(fileId),
        getFile(fileId),
        getActiveNodes(),
      ]);

      if (chunks.length === 0) {
        throw new Error(`No chunks found for fileId ${fileId}`);
      }

      const nodeMap = new Map<string, StorageNode>(
        activeNodes.map((n) => [n.nodeId, n]),
      );

      // Group by chunkIndex (one entry per replica)
      const byIndex = new Map<number, ChunkMapping[]>();
      for (const c of chunks) {
        if (!byIndex.has(c.chunkIndex)) byIndex.set(c.chunkIndex, []);
        byIndex.get(c.chunkIndex)!.push(c);
      }
      const sortedIndices = [...byIndex.keys()].sort((a, b) => a - b);

      // Fetch each chunk with primary→replica fallback
      const buffers: ArrayBuffer[] = [];
      const newLogs: DownloadLog[] = [];

      for (const idx of sortedIndices) {
        const replicas = byIndex.get(idx)!;
        let downloaded = false;
        const log: DownloadLog = { chunkIndex: idx, tried: [] };

        for (let r = 0; r < replicas.length; r++) {
          const replica = replicas[r];
          const node = nodeMap.get(replica.nodeId);
          if (!node) {
            log.tried.push({ nodeId: replica.nodeId, ok: false, via: 'failed' });
            continue;
          }

          const chunkName = replica.chunkName || `${fileMeta.name}-chunk-${idx}`;
          try {
            const buf = await downloadChunkFromNode(node.port, chunkName);
            buffers[idx] = buf;
            log.tried.push({
              nodeId: replica.nodeId,
              ok: true,
              via: r === 0 ? 'primary' : 'replica',
            });
            downloaded = true;
            break;
          } catch (err) {
            log.tried.push({ nodeId: replica.nodeId, ok: false, via: 'failed' });
          }
        }

        if (!downloaded) {
          throw new Error(`All replicas failed for chunk ${idx}`);
        }
        newLogs.push(log);
        setLogs((l) => [...l, log]);
      }

      // Assemble + trigger download
      const merged = new Blob(buffers as ArrayBuffer[], {
        type: fileMeta.content_type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(merged);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileMeta.name || `file-${fileId}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  return { download, busy, logs, error };
}
