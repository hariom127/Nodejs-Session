const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const env = require('../config/env');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email is invalid'],
    },
    // Never selected by default, so it cannot leak through a normal query.
    password: { type: String, required: true, select: false },
  }
);

// Unique index is the real guarantee against duplicate accounts (the pre-check
// in the service only gives a friendlier error and can race).
userSchema.index({ email: 1 }, { unique: true });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, env.bcryptSaltRounds);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
