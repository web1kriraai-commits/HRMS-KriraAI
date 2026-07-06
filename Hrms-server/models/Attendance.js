import mongoose from 'mongoose';

const breakSchema = new mongoose.Schema({
  start: {
    type: Date,
    required: true
  },
  end: {
    type: Date
  },
  type: {
    type: String,
    enum: ['Standard', 'Extra', 'Pause'],
    default: 'Standard'
  },
  durationSeconds: {
    type: Number,
    default: 0
  },
  reason: {
    type: String,
    trim: true
  }
}, { _id: true });

const manualHourSchema = new mongoose.Schema({
  hours: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['Employee', 'Admin'],
    required: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  note: {
    type: String,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  checkIn: {
    type: Date
  },
  checkOut: {
    type: Date
  },
  location: {
    type: String
  },
  breaks: [breakSchema],
  manualHours: [manualHourSchema],
  totalWorkedSeconds: {
    type: Number,
    default: 0
  },
  isPenaltyDisabled: {
    type: Boolean,
    default: false
  },
  lowTimeFlag: {
    type: Boolean,
    default: false
  },
  extraTimeFlag: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String
  },
  isManualFlag: {
    type: Boolean,
    default: false
  },
  penaltySeconds: {
    type: Number,
    default: 0
  },
  lateCheckIn: {
    type: Boolean,
    default: false
  },
  earlyLogoutRequest: {
    type: String,
    enum: ['None', 'Pending', 'Approved', 'Rejected'],
    default: 'None'
  },
  earlyLogoutRequestNote: {
    type: String,
    trim: true
  },
  isCompulsoryBreakDisabled: {
    type: Boolean,
    default: false
  },
  /** Auto-calculated daily OT above 8h 15m */
  generalOvertimeMinutes: { type: Number, default: 0 },
  /** Admin-approved management OT (employee request) */
  managementOvertime: {
    reason: { type: String, trim: true },
    durationMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['None', 'Pending', 'Approved', 'Rejected'],
      default: 'None'
    },
    requestedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    completedMinutes: { type: Number, default: 0 }
  },
  /** Early checkout OT — request, deficit, and coverage tracking */
  earlyOvertime: {
    reason: { type: String, trim: true },
    durationMinutes: { type: Number, default: 0 },
    requestStatus: {
      type: String,
      enum: ['None', 'Pending', 'Approved', 'Rejected'],
      default: 'None'
    },
    requestedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    deficitMinutes: { type: Number, default: 0 },
    coveredMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['None', 'Pending', 'Partial', 'Covered'],
      default: 'None'
    }
  },
  /** @deprecated Legacy field — kept for backward compatibility */
  overtimeRequest: {
    reason: { type: String, trim: true },
    durationMinutes: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['None', 'Pending', 'Approved', 'Rejected'], 
      default: 'None' 
    },
    requestedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    completedMinutes: { type: Number, default: 0 },
    unfulfilledMinutes: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);



