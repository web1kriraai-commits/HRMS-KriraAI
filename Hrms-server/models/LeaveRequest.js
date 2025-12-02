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
    enum: ['Pending', 'Approved', 'Rejected'],
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

export default mongoose.model('LeaveRequest', leaveRequestSchema);



