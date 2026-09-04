// Metadata Server for Distributed File Storage
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { FileModel, Chunk, Node, ReplicationLog } = require('./db/schema');

dotenv.config();

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/distributed-storage', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// File Registry Endpoints
// GET /files — list all registered files
app.get('/files', async (req, res) => {
  try {
    const files = await FileModel.find().sort({ created_at: -1 });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/files', async (req, res) => {
  try {
    const file = new FileModel(req.body);
    await file.save();
    res.status(201).json(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/files/:fileId', async (req, res) => {
  try {
    const file = await FileModel.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------
//  Assign two storage nodes to a chunk via Round-Robin
//   POST /files/:fileId/assign-nodes
//   Body: { chunkIndex: <Integer> }
// ------------------------------------------------------------
app.post('/files/:fileId/assign-nodes', async (req, res) => {
  try {
    // 1️⃣ Validate payload
    const { chunkIndex } = req.body;
    if (chunkIndex == null || !Number.isInteger(chunkIndex)) {
      return res.status(400).json({ error: "'chunkIndex' must be an integer" });
    }

    // 2️⃣ Verify the parent file exists
    const file = await FileModel.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // 3️⃣ Fetch all active storage nodes
    const activeNodes = await Node.find({ status: 'active' }).lean();
    const nodeCount = activeNodes.length;
    if (nodeCount < 2) {
      return res.status(400).json({ error: 'Need at least 2 active storage nodes' });
    }

    // 4️⃣ Round-robin selection of two distinct nodes based on chunkIndex
    const idx1 = chunkIndex % nodeCount;
    const idx2 = (chunkIndex + 1) % nodeCount;
    const chosen = [activeNodes[idx1], activeNodes[idx2]];

    // 5️⃣ Return node descriptors (the client will build upload URLs)
    res.json({
      chunkIndex,
      nodes: chosen.map(n => ({
        nodeId: n.nodeId,
        port:   n.port,
        url:    `http://localhost:${n.port}`
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chunk-to-Node Mapping Endpoints
app.post('/chunks', async (req, res) => {
  try {
    const chunk = new Chunk(req.body);
    await chunk.save();
    res.status(201).json(chunk);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/chunks/file/:fileId', async (req, res) => {
  try {
    const chunks = await Chunk.find({ fileId: req.params.fileId })
      .sort('chunkIndex');
    res.json(chunks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/chunks/:chunkId/replicate', async (req, res) => {
  try {
    const chunk = await Chunk.findByIdAndUpdate(
      req.params.chunkId,
      {
        replicated: true,
        replicationCount: req.body.replicationCount || 1,
        lastReplicatedAt: new Date()
      },
      { new: true }
    );

    if (!chunk) return res.status(404).json({ error: 'Chunk not found' });

    // Log replication
    const log = new ReplicationLog({
      _id: new mongoose.Types.ObjectId(),
      fileId: chunk.fileId,
      timestamp: new Date(),
      sourceNode: req.body.sourceNode,
      targetNode: chunk.nodeId,
      chunkIndex: chunk.chunkIndex,
      success: true
    });
    await log.save();

    res.json(chunk);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Node Management Endpoints
app.post('/nodes', async (req, res) => {
  try {
    const node = new Node(req.body);
    await node.save();
    res.status(201).json(node);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/nodes/active', async (req, res) => {
  try {
    const nodes = await Node.find({ status: 'active' });
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Replication Tracking Endpoints
app.get('/replication/logs/:fileId', async (req, res) => {
  try {
    const logs = await ReplicationLog.find({ fileId: req.params.fileId })
      .sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Metadata Server running on port ${PORT}`);
});

module.exports = app;