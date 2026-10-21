const { matchedData } = require('express-validator');
const postService = require('../services/postService');

// Express 5 forwards rejected promises from async handlers to the error middleware.

async function create(req, res) {
  const post = await postService.createPost(req.user.id, req.body);
  res.status(201).json({ success: true, data: { post } });
}

async function list(req, res) {
  // matchedData gives the validated query values (page and limit already converted to numbers).
  const result = await postService.listPosts(matchedData(req, { locations: ['query'] }));
  res.status(200).json({ success: true, data: result });
}

async function getOne(req, res) {
  const post = await postService.getPost(req.params.id);
  res.status(200).json({ success: true, data: { post } });
}

async function update(req, res) {
  const post = await postService.updatePost(req.params.id, req.user.id, req.body);
  res.status(200).json({ success: true, data: { post } });
}

async function remove(req, res) {
  await postService.deletePost(req.params.id, req.user.id);
  res.status(200).json({ success: true, data: { message: 'Post deleted successfully', id: req.params.id } });
}

module.exports = { create, list, getOne, update, remove };
