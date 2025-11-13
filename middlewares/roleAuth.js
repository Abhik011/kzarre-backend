const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const SuperAdmin = require("../models/SuperAdmin");

// ============================================================
// 🔐 AUTH WITH DEBUG LOGS
// ============================================================
const auth = async (req, res, next) => {
  try {
    console.log("\n======== AUTH DEBUG START ========");

    const header = req.headers.authorization;
    console.log("Authorization Header:", header);

    if (!header || !header.startsWith("Bearer ")) {
      console.log("❌ No bearer token found");
      return res.status(401).json({ message: "No token provided" });
    }

    const token = header.split(" ")[1];
    console.log("Extracted Token:", token);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded Token:", decoded);
    } catch (err) {
      console.log("❌ JWT Verify Error:", err.message);
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    console.log("Checking SuperAdmin collection...");
    let user = await SuperAdmin.findById(decoded.id).select("-password");
    if (user) {
      console.log("✅ Found SuperAdmin:", user.email);
      req.user = { id: user._id, role: "superadmin", email: user.email };
      console.log("======== AUTH DEBUG END ========\n");
      return next();
    }

    console.log("Not found in SuperAdmin. Checking Admin collection...");
    user = await Admin.findById(decoded.id).select("-password");
    if (user) {
      console.log("✅ Found Admin:", user.email, "| Role:", user.role);
      req.user = { id: user._id, role: user.role, email: user.email };
      console.log("======== AUTH DEBUG END ========\n");
      return next();
    }

    console.log("❌ User ID not in any collection:", decoded.id);
    return res.status(401).json({ message: "User not found" });
  } catch (err) {
    console.log("❌ Auth General Error:", err.message);
    res.status(401).json({ message: "Authentication failed" });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    console.log("Role Check — Required:", allowedRoles);
    console.log("User Role:", req.user?.role);

    if (!req.user) {
      console.log("❌ No user context in request.");
      return res.status(403).json({ message: "No user context found" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.log("❌ Role mismatch. Access denied.");
      return res.status(403).json({ message: "Access denied: insufficient role" });
    }

    console.log("✅ Role authorized.");
    next();
  };
};

module.exports = { auth, authorizeRoles };
