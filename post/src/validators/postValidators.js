const { body, param, query } = require('express-validator');

// Each rule checks one field. Order matters: checks run from left to right.

const titleRule = () => body('title')
  .isString().withMessage('title must be text')
  .trim()
  .isLength({ min: 3, max: 150 }).withMessage('title must be 3-150 characters');

const contentRule = () => body('content')
  .isString().withMessage('content must be text')
  .trim()
  .isLength({ min: 1, max: 20000 }).withMessage('content must be 1-20000 characters');

const postIdRule = [
  param('id').isMongoId().withMessage('id must be a valid 24-character hex ObjectId'),
];

const createPostRules = [
  titleRule().exists().withMessage('title is required'),
  contentRule().exists().withMessage('content is required'),
];

const updatePostRules = [
  titleRule().optional(),
  contentRule().optional(),
  body().custom((value = {}) => value.title !== undefined || value.content !== undefined)
    .withMessage('Provide at least one of: title, content'),
];

const listPostsRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a number >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').toInt(),
  query('author').optional().isMongoId().withMessage('author must be a valid user id'),
];

module.exports = { postIdRule, createPostRules, updatePostRules, listPostsRules };
