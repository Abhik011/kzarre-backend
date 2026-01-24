const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

module.exports = async function accessAuth(req, res, next) {
  try {
    let token = null;

    // Try to get token from cookie first (new system)
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // Fallback to Authorization header (old system)
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - no token provided" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(payload.id)
      .populate("roleId", "name permissions");

    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "Account disabled or not found" });
    }

    // Determine if user is superadmin
    const roleName = admin.roleId?.name || "";
    const isSuperAdmin = roleName === "superadmin";

    req.user = {
      id: admin._id,
      email: admin.email,
      name: admin.name, 
      role: roleName,
      isSuperAdmin: isSuperAdmin,
      permissions: isSuperAdmin ? ["*"] : [  // SuperAdmin gets wildcard permission
        ...new Set([
          ...(admin.roleId?.permissions || []),
          ...(admin.permissions || []),
        ]),
      ],
    };

    next();
  } catch (err) {
    console.error("❌ AccessAuth error:", err.message);
    res.status(401).json({ message: "Invalid token" });
  }
};
