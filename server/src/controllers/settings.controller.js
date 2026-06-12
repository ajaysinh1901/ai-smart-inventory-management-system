const Settings = require('../models/Settings.model');
const User     = require('../models/User.model');
const bcrypt   = require('bcryptjs');

// GET /settings — find or create default settings for the authenticated user
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.id });

    if (!settings) {
      settings = await Settings.create({ userId: req.user.id });
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /settings — merge/update settings (accepts partial updates)
exports.updateSettings = async (req, res) => {
  try {
    const { profile, workspace, preferences, aiConfig, notifications } = req.body;

    let settings = await Settings.findOne({ userId: req.user.id });
    if (!settings) {
      settings = await Settings.create({ userId: req.user.id });
    }

    // Deep merge each section if provided
    if (profile) {
      Object.assign(settings.profile, profile);
    }
    if (workspace) {
      // Light VPA shape check — `<handle>@<provider>`. Empty string clears it.
      if (workspace.upiId && workspace.upiId.trim() && !/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(workspace.upiId.trim())) {
        return res.status(400).json({ success: false, message: 'Invalid UPI ID. Use format like merchant@upi or 9876543210@ybl.' });
      }
      // Standard 15-char GSTIN — block bad formats early so invoices never
      // print a malformed GSTIN to the customer.
      if (workspace.gstin && workspace.gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(workspace.gstin.trim().toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Invalid GSTIN. Must be 15 characters in format 22AAAAA0000A1Z5.' });
      }
      // Normalise GSTIN to uppercase before storing.
      if (workspace.gstin) workspace.gstin = workspace.gstin.trim().toUpperCase();
      Object.assign(settings.workspace, workspace);
    }
    if (preferences) {
      Object.assign(settings.preferences, preferences);
    }
    if (aiConfig) {
      Object.assign(settings.aiConfig, aiConfig);
    }
    if (notifications) {
      // Handle nested channels separately
      const { channels, ...rest } = notifications;
      Object.assign(settings.notifications, rest);
      if (channels) {
        Object.assign(settings.notifications.channels, channels);
      }
    }

    await settings.save();

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUT /settings/password — validate current password, then hash and save new one
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both current and new passwords.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    // Fetch user with password field (select: false by default)
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Validate current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    // Set new password — the pre-save hook in User model will hash it
    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
