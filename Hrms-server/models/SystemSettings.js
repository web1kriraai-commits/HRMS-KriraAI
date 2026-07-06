import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema({
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  /** Default check-in time (HH:mm, 24h) for all employees — e.g. 08:30 */
  defaultCheckInTime: {
    type: String,
    default: '08:30'
  },
  /** Per-day check-in override: YYYY-MM-DD → HH:mm */
  checkInTimeOverrides: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  /** Default checkout time (HH:mm, 24h) for all employees — e.g. 17:30 */
  defaultCheckoutTime: {
    type: String,
    default: '17:30'
  },
  /** Per-day checkout override: YYYY-MM-DD → HH:mm */
  checkoutTimeOverrides: {
    type: Map,
    of: String,
    default: () => new Map()
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



