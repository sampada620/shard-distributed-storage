import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

// https://vite.dev/config/
//
// Proxies wire the React app (port 5173) to the existing backend with no
// CORS changes:
//   - /api/*             -> http://localhost:3000  (metadata server)
//   - /node/<port>/...   -> http://localhost:<port> (storage nodes, dynamic)
//
// The /api proxy uses Vite's built-in ProxyOptions. The /node proxy needs a
// dynamic target per request, handled by a custom middleware plugin.
const apiProxy: ProxyOptions = {
  target: 'http://localhost:3000',
  changeOrigin: true,
  rewrite: (p) => p.replace(/^\/api/, ''),
}

function dynamicNodeProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void,
): void {
  const m = req.url?.match(/^\/(\d+)(\/.*)$/)
  if (!m || !req.url) return next()
  const [, port, rest] = m
  const target = `http://localhost:${port}${rest}`

  const proxyReq = http.request(target, { method: req.method, headers: req.headers }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }))
  })
  req.pipe(proxyReq)
}

// Vite plugin that registers the /node middleware during dev
const nodeProxyPlugin: Plugin = {
  name: 'node-proxy',
  configureServer(server) {
    server.middlewares.use('/node', (req, res, next) =>
      dynamicNodeProxy(req as http.IncomingMessage, res as http.ServerResponse, next),
    )
  },
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss(), nodeProxyPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
    },
  },
})
