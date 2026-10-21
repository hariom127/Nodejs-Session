const Post = require('../models/Post');
const AppError = require('../utils/AppError');

const AUTHOR_FIELDS = 'name';

async function findOwnedPost(postId, userId) {
  const post = await Post.findById(postId);
  if (!post) throw AppError.notFound('Post not found');
  // Ownership is checked against the id from the verified JWT, never a
  // client-supplied value. Posts are public, so 403 leaks nothing.
  if (!post.author.equals(userId)) throw AppError.forbidden('You can only modify your own posts');
  return post;
}

async function createPost(userId, { title, content }) {
  const post = await Post.create({ title, content, author: userId });
  return post.populate('author', AUTHOR_FIELDS);
}

async function listPosts({ page = 1, limit = 10, author }) {
  const filter = author ? { author } : {};
  const [items, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS),
    Post.countDocuments(filter),
  ]);
  return {
    posts: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getPost(postId) {
  const post = await Post.findById(postId).populate('author', AUTHOR_FIELDS);
  if (!post) throw AppError.notFound('Post not found');
  return post;
}

async function updatePost(postId, userId, changes) {
  const post = await findOwnedPost(postId, userId);
  Object.assign(post, changes); // `changes` is already whitelisted to title/content
  await post.save();
  return post.populate('author', AUTHOR_FIELDS);
}

async function deletePost(postId, userId) {
  await findOwnedPost(postId, userId);
  // Author is repeated in the filter as defense in depth.
  await Post.deleteOne({ _id: postId, author: userId });
}

module.exports = { createPost, listPosts, getPost, updatePost, deletePost };
