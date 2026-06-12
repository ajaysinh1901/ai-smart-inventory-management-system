const User = require('../models/User.model');

exports.getAllUsers = async () => {
  const users = await User.find({});
  return users;
};

exports.getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

exports.updateUserRole = async (id, role) => {
  const user = await User.findByIdAndUpdate(
    id,
    { role },
    { new: true, runValidators: true }
  );
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

exports.deleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new Error('User not found');
  }
  await user.deleteOne();
  return { id };
};
