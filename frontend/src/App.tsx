// ─────────────────────────────────────────────────────────────────────────────
// App.tsx — top-level page
//
//  ┌────────────────────────────────────────┐
//  │  Hero (Vortex background)              │
//  │    - Heading + subheading              │
//  │    - DropZone                          │
//  │    - "View Files" smooth-scroll link   │
//  └────────────────────────────────────────┘
//  ┌────────────────────────────────────────┐
//  │  FileList (auto-refresh on upload)     │
//  └────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Vortex } from './components/ui/vortex';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { useUploader } from './lib/useUploader';

function App() {
  const { state: uploadState, upload } = useUploader();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // After a successful upload, bump the trigger so FileList re-fetches.
  const handleUpload = useCallback(
    async (file: File) => {
      try {
        await upload(file);
        setRefreshTrigger((n) => n + 1);
      } catch {
        // Error is already reflected in uploadState.
      }
    },
    [upload],
  );

  const scrollToFiles = () => {
    document.getElementById('files')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Hero (Vortex) ─────────────────────────────────────────────────── */}
      <Vortex
        containerClassName="w-full h-[100vh]"
        className="absolute inset-0"
        particleCount={500}
        baseHue={280}
        rangeY={300}
        baseRadius={1.5}
      >
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="text-5xl sm:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#a78bfa] via-[#e879f9] to-[#f472b6] flex items-center"
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 100 100"
              className="inline-block align-middle mr-4 -mt-2"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>
              <g>
                <circle cx="50" cy="15" r="8" fill="url(#logoGrad)" />
                <circle cx="85" cy="45" r="8" fill="url(#logoGrad)" />
                <circle cx="60" cy="85" r="8" fill="url(#logoGrad)" />
                <circle cx="15" cy="55" r="8" fill="url(#logoGrad)" />
                <line x1="50" y1="15" x2="85" y2="45" stroke="url(#logoGrad)" strokeWidth="1.5" />
                <line x1="50" y1="15" x2="60" y2="85" stroke="url(#logoGrad)" strokeWidth="1.5" />
                <line x1="50" y1="15" x2="15" y2="55" stroke="url(#logoGrad)" strokeWidth="1.5" />
              </g>
            </svg>
            Shard
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
            className="mt-4 text-lg text-white/60 max-w-xl"
          >
            Resilient by design — your files live on, no matter what fails.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
            className="mt-10 w-full"
          >
            <DropZone onUpload={handleUpload} uploadState={uploadState} />
          </motion.div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            onClick={scrollToFiles}
            className="mt-8 flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            View Files
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ↓
            </motion.span>
          </motion.button>
        </div>
      </Vortex>

      {/* ── File list ────────────────────────────────────────────────────── */}
      <FileList refreshTrigger={refreshTrigger} />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-24 py-8 text-center text-xs text-white/30 border-t border-white/5">
        Distributed File Storage · Stage 8 · React + Framer Motion + Vite
      </footer>
    </div>
  );
}

export default App;
