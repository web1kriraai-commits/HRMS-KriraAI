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
  /** Auto-calculated daily OT above 8h 15m, AFTER Management OT / Early OT repayment are carved out */
  generalOvertimeMinutes: { type: Number, default: 0 },
  /** Internal: total minutes worked above the minimum shift threshold, BEFORE any bucket allocation. Anchor for recalculateOvertimeBuckets. */
  rawOvertimeSurplusMinutes: { type: Number, default: 0 },
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
    /** Minutes worked above minimum shift, credited on approved early-checkout when surplus exists */
    completedMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['None', 'Pending', 'Partial', 'Covered'],
      default: 'None'
    }
  },
  /**
   * Early Leave OT request — employee/HR claims surplus (completed shift → checkout).
   * Admin/HR later allocates that surplus to General / Management / Early Request / Custom.
   * While status is Pending, surplus is held in rawOvertimeSurplusMinutes and not auto-bucketed.
   */
  overtimeManageRequest: {
    status: {
      type: String,
      enum: ['None', 'Pending', 'Managed', 'Rejected'],
      default: 'None'
    },
    requestedAt: { type: Date },
    note: { type: String, trim: true },
    /** Extra minutes from completed working hours to checkout (updated at checkout / manage) */
    extraMinutes: { type: Number, default: 0 },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managedAt: { type: Date },
    allocationType: {
      type: String,
      enum: ['None', 'General', 'Management', 'EarlyRequest', 'Custom'],
      default: 'None'
    },
    allocations: {
      generalMinutes: { type: Number, default: 0 },
      managementMinutes: { type: Number, default: 0 },
      earlyRequestMinutes: { type: Number, default: 0 }
    },
    adminNote: { type: String, trim: true }
  },
  /**
   * Explicit employee request to repay a previous early-checkout deficit by working
   * extra minutes on this day. Decoupled from `earlyOvertime` (which tracks the deficit
   * itself on the day it was incurred) and from `earlyLogoutRequest` (leaving early today).
   * Only the approved + applied amount is diverted away from generalOvertimeMinutes.
   */
  earlyOvertimeRepayment: {
    requestedMinutes: { type: Number, default: 0 },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ['None', 'Pending', 'Approved', 'Rejected'],
      default: 'None'
    },
    requestedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    /** Actual minutes credited as repayment after checkout, capped by surplus + outstanding deficit in the same month */
    appliedMinutes: { type: Number, default: 0 }
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



