const getPermissions = require("../utils/getEffectivePermissions");

module.exports = (permission) => {
  return async (req, res, next) => {
    if (req.user.role === "superadmin") return next();

    const perms = await getPermissions(req.user);

    if (!perms.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    next();
  };
};
