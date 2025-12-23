import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Employee', 'HR', 'Admin'],
    required: true,
    default: 'Employee'
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  paidLeaveAllocation: {
    type: Number,
    default: 0 // Additional allocation added by admin (starts at 0, added to default)
  },
  paidLeaveLastAllocatedDate: {
    type: Date // Last date when paid leave was allocated
  },
  joiningDate: {
    type: String, // Employee joining date in dd-mm-yyyy format
    trim: true
  },
  bonds: [{
    type: {
      type: String,
      enum: ['Internship', 'Job', 'Other'],
      required: true
    },
    periodMonths: {
      type: Number,
      required: true,
      min: 1
    },
    startDate: {
      type: String, // Bond start date in dd-mm-yyyy format
      required: true,
      trim: true
    },
    order: {
      type: Number, // Order of bond (1, 2, 3, etc.)
      required: true,
      default: 1
    },
    salary: {
      type: Number, // Salary for Job bond or Stipend for Internship bond
      default: 0
    }
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Function to drop unique indexes on username and email to allow duplicates
export const dropUniqueIndexes = async () => {
  try {
    if (User.collection) {
      const indexes = await User.collection.indexes();
      for (const index of indexes) {
        // Drop unique indexes on username and email
        if (index.name === 'username_1' || index.name === 'email_1' || 
            (index.key && (index.key.username === 1 || index.key.email === 1))) {
          try {
            await User.collection.dropIndex(index.name);
            console.log(`Dropped unique index: ${index.name}`);
          } catch (err) {
            // Index might not exist, ignore error
            if (err.code !== 27) { // 27 = IndexNotFound
              console.log(`Note: Could not drop index ${index.name}`);
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore errors - indexes might not exist
    console.log('Note: Could not check/drop indexes (this is normal if collection is empty)');
  }
};

export default User;



