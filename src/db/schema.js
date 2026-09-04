// MongoDB schema for metadata server
const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Original filename
  size: { type: Number, required: true }, // Size in bytes
  content_type: { type: String }, // MIME type
  created_at: { type: Date, default: Date.now }
});

const ChunkSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileModel', required: true }, // File this chunk belongs to
  chunkIndex: { type: Number, required: true }, // Position in file
  nodeId: { type: String, required: true }, // Node storing this chunk
  chunkName: { type: String, required: true }, // Filename on the storage node
  replicated: { type: Boolean, default: false }, // Replication status
  replicationCount: { type: Number, default: 0 }, // Number of replications
  lastReplicatedAt: { type: Date }
});

const NodeSchema = new mongoose.Schema({
  nodeId: { type: String, required: true }, // Unique node identifier
  status: { type: String, enum: ['active', 'standby', 'maintenance'], default: 'active' },
  ip: { type: String }, // Current IP address
  port: { type: Number }, // RPC port
  capacity: { type: Number }, // Total storage capacity (bytes)
  available: { type: Number }, // Available storage (bytes)
  lastHeartbeat: { type: Date }
});

const ReplicationLogSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileModel', required: true },
  timestamp: { type: Date, required: true },
  sourceNode: { type: String }, // Origin node
  targetNode: { type: String }, // Destination node
  chunkIndex: { type: Number },
  success: { type: Boolean }
});
module.exports = {
  FileModel: mongoose.model('FileModel', FileSchema),
  Chunk: mongoose.model('Chunk', ChunkSchema),
  Node: mongoose.model('Node', NodeSchema),
  ReplicationLog: mongoose.model('ReplicationLog', ReplicationLogSchema)
};