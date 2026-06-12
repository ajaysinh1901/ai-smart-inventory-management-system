const express = require('express');
const { getUsers, getUser, updateRole, deleteUser, updateMe } = require('../../controllers/user.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

// All /users routes require authentication
router.use(protect);

// PUT /users/me — authenticated user updates own profile (no admin gate)
router.route('/me').put(updateMe);

// Everything else is admin-only
router.use(authorize('admin'));

router.route('/')
  .get(getUsers);

router.route('/:id')
  .get(getUser)
  .delete(deleteUser);

router.route('/:id/role')
  .put(updateRole);

module.exports = router;
