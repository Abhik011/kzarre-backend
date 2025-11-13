module.exports = function checkPermission(permissionName) {
  return (req, res, next) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ message: "Unauthorized" });

    if (admin.role === "superadmin") return next(); // full access

    if (admin.permissions.includes(permissionName)) return next();

    return res.status(403).json({ message: "Permission denied" });
  };
};
