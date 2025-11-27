import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  targetType: {
    type: String,
    enum: ['USER', 'ATTENDANCE', 'LEAVE', 'SYSTEM'],
    required: true
  },
  targetId: {
    type: String,
    required: true
  },
  beforeData: {
    type: String // JSON string
  },
  afterData: {
    type: String // JSON string
  },
  details: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorId: 1 });

export default mongoose.model('AuditLog', auditLogSchema);



