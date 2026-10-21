const { Router } = require('express');
const controller = require('../controllers/postController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const {
  postIdRule, createPostRules, updatePostRules, listPostsRules,
} = require('../validators/postValidators');

const router = Router();

// Public: anyone can read posts
router.get('/', listPostsRules, validate, controller.list);
router.get('/:id', postIdRule, validate, controller.getOne);

// Logged-in users only. Update/delete also check ownership in the service.
router.post('/', authenticate, createPostRules, validate, controller.create);
router.patch('/:id', authenticate, postIdRule, updatePostRules, validate, controller.update);
router.delete('/:id', authenticate, postIdRule, validate, controller.remove);

module.exports = router;
