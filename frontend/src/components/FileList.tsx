// ─────────────────────────────────────────────────────────────────────────────
// FileList — shows all uploaded files with download buttons
// Auto-refreshes after an upload is completed (caller triggers refresh).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFileList } from '../lib/api';
import { useDownloader } from '../lib/useDownloader';
import type { FileMetadata } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface Props {
  /** Set to true after an upload completes to trigger a refresh. */
  refreshTrigger: number;
}

export function FileList({ refreshTrigger }: Props) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { download, busy: downloading, logs, error: downloadError } = useDownloader();
  const prevTrigger = useRef(refreshTrigger);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getFileList();
      setFiles(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and whenever refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== prevTrigger.current) {
      prevTrigger.current = refreshTrigger;
      load();
    }
  }, [refreshTrigger, load]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  return (
    <section className="w-full max-w-2xl mx-auto mt-16 px-4" id="files">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Uploaded Files</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-30"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
      {downloadError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          Download failed: {downloadError}
        </div>
      )}

      {/* File rows */}
      {loading && files.length === 0 ? (
        <p className="text-center text-white/40 py-12">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="text-center text-white/30 py-12">
          No files yet. Upload one above!
        </p>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence>
            {files.map((file) => (
              <motion.li
                key={file._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/10 px-5 py-4"
              >
                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {formatBytes(file.size)} · {formatDate(file.created_at)}
                  </p>
                </div>

                {/* ID chip */}
                <code className="hidden sm:inline-block text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                  {file._id.slice(-8)}
                </code>

                {/* Download button */}
                <button
                  onClick={() => download(file._id)}
                  disabled={downloading}
                  className={`
                    flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all
                    ${downloading
                      ? 'bg-violet-500/20 text-violet-400/50 cursor-not-allowed'
                      : 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95'
                    }
                  `}
                >
                  {downloading ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      Downloading…
                    </>
                  ) : (
                    <>⬇ Download</>
                  )}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Download log (fault-tolerance trace) */}
      {logs.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-white/50">
          {logs.map((l) =>
            l.tried.map((t, i) => (
              <div key={`${l.chunkIndex}-${i}`}>
                Chunk {l.chunkIndex}:{' '}
                {t.ok
                  ? t.via === 'primary'
                    ? `✅ ${t.nodeId} (primary)`
                    : `✅ ${t.nodeId} (replica fallback)`
                  : `❌ ${t.nodeId}`}
              </div>
            )),
          )}
        </div>
      )}
    </section>
  );
}
