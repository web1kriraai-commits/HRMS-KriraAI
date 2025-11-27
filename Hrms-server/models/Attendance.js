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
    enum: ['Standard', 'Extra'],
    default: 'Standard'
  },
  durationSeconds: {
    type: Number,
    default: 0
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
  totalWorkedSeconds: {
    type: Number,
    default: 0
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
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);



