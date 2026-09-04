// ─────────────────────────────────────────────────────────────────────────────
// DropZone — drag-and-drop + file picker, wired to useUploader
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UploadState } from '../types';

interface Props {
  onUpload: (file: File) => Promise<void>;
  uploadState: UploadState;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DropZone({ onUpload, uploadState }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setSelectedFile(file);
      await onUpload(file);
    },
    [onUpload],
  );

  return (
    <div className="w-full max-w-md mx-auto">
      {/* File picker */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        aria-label="Select a file to upload"
      />

      {/* Drop area */}
      <motion.div
        className={`
          relative flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10
          transition-colors cursor-pointer select-none
          ${dragging
            ? 'border-violet-400 bg-violet-500/10'
            : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
          }
          ${uploadState.status === 'uploading' ? 'pointer-events-none opacity-80' : ''}
        `}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => uploadState.status !== 'uploading' && inputRef.current?.click()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        {/* Icon */}
        <motion.div
          className="text-5xl"
          animate={{ y: dragging ? -8 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          {dragging ? '📥' : '📁'}
        </motion.div>

        <div className="text-center space-y-1">
          {selectedFile && uploadState.status !== 'idle' ? (
            <>
              <p className="font-medium text-white">{selectedFile.name}</p>
              <p className="text-sm text-white/50">{formatBytes(selectedFile.size)}</p>
            </>
          ) : (
            <>
              <p className="font-medium text-white">
                {dragging ? 'Drop to upload' : 'Drag & drop a file'}
              </p>
              <p className="text-sm text-white/50">or click to browse</p>
            </>
          )}
        </div>

        {/* Upload progress */}
        <AnimatePresence>
          {uploadState.status === 'uploading' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full space-y-2"
            >
              <div className="flex justify-between text-xs text-white/60">
                <span>
                  Chunk {uploadState.completedChunks}/{uploadState.totalChunks}
                </span>
                <span>
                  {Math.round((uploadState.completedChunks / uploadState.totalChunks) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-violet-500"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(uploadState.completedChunks / uploadState.totalChunks) * 100}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Per-node replica status */}
      <AnimatePresence>
        {uploadState.status === 'uploading' && uploadState.chunks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex flex-wrap gap-2 justify-center"
          >
            {uploadState.chunks.map((chunk) =>
              [...chunk.nodeStatuses.entries()].map(([port, status]) => (
                <span
                  key={`${chunk.chunkIndex}-${port}`}
                  className={`
                    inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                    ${status === 'done'
                      ? 'border-green-500/40 text-green-400 bg-green-500/10'
                      : status === 'uploading'
                        ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                        : status === 'failed'
                          ? 'border-red-500/40 text-red-400 bg-red-500/10'
                          : 'border-white/20 text-white/40 bg-white/5'
                    }
                  `}
                >
                  <span className="text-[10px]">🚢</span>
                  :{port}
                  {status === 'done' && ' ✅'}
                  {status === 'failed' && ' ❌'}
                  {status === 'uploading' && ' ⬆'}
                </span>
              )),
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success message */}
      <AnimatePresence>
        {uploadState.status === 'done' && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-center text-green-400 text-sm"
          >
            ✅ Uploaded! File ID: <code className="text-green-300">{uploadState.fileId}</code>
          </motion.p>
        )}
        {uploadState.status === 'error' && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-center text-red-400 text-sm"
          >
            ❌ {uploadState.error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
