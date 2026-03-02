import mongoose from 'mongoose';

const leaveRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  startDate: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  endDate: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  category: {
    type: String,
    enum: ['Paid Leave', 'Unpaid Leave', 'Half Day Leave', 'Extra Time Leave'],
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  attachmentUrl: {
    type: String
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },
  hrComment: {
    type: String
  },
  startTime: {
    type: String // HH:mm format for extra time leave and half day leave
  },
  endTime: {
    type: String // HH:mm format for extra time leave and half day leave
  }
}, {
  timestamps: true
});

// Indexes for fast per-user per-date lookups (used during clock-in/out and bulk fetches)
leaveRequestSchema.index({ userId: 1, startDate: 1, status: 1 });
leaveRequestSchema.index({ userId: 1, startDate: 1, category: 1, status: 1 });

export default mongoose.model('LeaveRequest', leaveRequestSchema);



