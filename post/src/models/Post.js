const mongoose = require('mongoose');
require('./User'); // registers the read-only User model used by populate('author')

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'title is required'],
      trim: true,
      minlength: 3,
      maxlength: 150,
    },
    content: {
      type: String,
      required: [true, 'content is required'],
      trim: true,
      minlength: 1,
      maxlength: 20000,
    },
    // Owner of the post, taken from the verified JWT. `immutable` means even a
    // buggy update path cannot transfer ownership.
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: true
  },
);

postSchema.index({ createdAt: -1 }); // newest-first listing
postSchema.index({ author: 1, createdAt: -1 }); // listing by author

module.exports = mongoose.model('Post', postSchema);
