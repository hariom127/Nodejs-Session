const mongoose = require('mongoose');

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


module.exports = mongoose.model('User', userSchema);
