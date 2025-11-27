import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema({
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
systemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ timezone: 'Asia/Kolkata' });
  }
  return settings;
};

export default mongoose.model('SystemSettings', systemSettingsSchema);



