const Role = require("../models/Role");

module.exports = async (user) => {
  let rolePerms = [];

  if (user.roleGroup) {
    const role = await Role.findById(user.roleGroup);
    rolePerms = role?.permissions || [];
  }

  return [...new Set([...rolePerms, ...user.permissions])];
};
