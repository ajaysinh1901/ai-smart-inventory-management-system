const userService = require('../services/user.service');
const User = require('../models/User.model');

// PUT /api/users/me — authenticated user updates their own name/email
// Distinct from /:id route below which is admin-only. Email uniqueness is
// enforced by the User schema's `unique: true` index.
exports.updateMe = async (req, res) => {
  try {
    const { name, email } = req.body;
    const update = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (typeof email === 'string' && email.trim()) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        return res.status(400).json({ success: false, message: 'Invalid email format.' });
      }
      update.email = email.trim().toLowerCase();
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That email is already taken.' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// 6. GET /api/users
exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. GET /api/users/:id
exports.getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// 8. PUT /api/users/:id/role
exports.updateRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }
    
    // Validate role
    if (!['admin', 'manager', 'staff'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role provided' });
    }

    const updatedUser = await userService.updateUserRole(req.params.id, role);
    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// 9. DELETE /api/users/:id
exports.deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: {}
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};
