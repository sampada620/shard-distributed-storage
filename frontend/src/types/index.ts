// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript interfaces mirroring the MongoDB schemas in src/db/schema.js
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageNode {
  _id: string;
  nodeId: string;
  status: 'active' | 'inactive';
  port: number;
  __v?: number;
}

export interface ChunkMapping {
  _id: string;
  fileId: string;
  chunkIndex: number;
  nodeId: string;
  chunkName: string;
  replicated?: boolean;
  replicationCount?: number;
  lastReplicatedAt?: string;
  __v?: number;
}

export interface FileMetadata {
  _id: string;
  name: string;
  size: number;
  content_type: string;
  created_at: string;
  __v?: number;
}

export interface AssignedNode {
  nodeId: string;
  port: number;
  url: string;
}

export interface AssignNodesResponse {
  chunkIndex: number;
  nodes: AssignedNode[];
}

// Upload progress tracking
export interface ChunkProgress {
  chunkIndex: number;
  total: number;
  nodeStatuses: Map<string, 'pending' | 'uploading' | 'done' | 'failed'>;
  error?: string;
}

export interface UploadState {
  fileId?: string;
  fileName?: string;
  totalChunks: number;
  completedChunks: number;
  chunks: ChunkProgress[];
  status: 'idle' | 'uploading' | 'done' | 'error';
  error?: string;
}
