import mongoose from 'mongoose';

const companyHolidaySchema = new mongoose.Schema({
  date: {
    type: String, // YYYY-MM-DD format
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional for backward compatibility
  },
  createdByName: {
    type: String,
    required: false
  },
  createdByRole: {
    type: String,
    enum: ['Admin', 'HR', 'Employee'],
    required: false
  }
}, {
  timestamps: true
});

export default mongoose.model('CompanyHoliday', companyHolidaySchema);



