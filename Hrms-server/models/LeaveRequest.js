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
    enum: ['Sick Leave', 'Casual Leave', 'Paid Leave', 'Unpaid Leave', 'Half Day', 'Company Holiday'],
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
  }
}, {
  timestamps: true
});

export default mongoose.model('LeaveRequest', leaveRequestSchema);



