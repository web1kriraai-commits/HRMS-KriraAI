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
  }
}, {
  timestamps: true
});

export default mongoose.model('CompanyHoliday', companyHolidaySchema);



