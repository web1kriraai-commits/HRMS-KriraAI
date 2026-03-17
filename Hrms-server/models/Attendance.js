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
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);



