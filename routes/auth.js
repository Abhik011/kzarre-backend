const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const SuperAdmin = require("../models/SuperAdmin");
const { register, login, verifyOtp } = require("../controllers/authController");
const isProd = process.env.NODE_ENV === "production";

const router = express.Router();

// ================= AUTH =================
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);

// ================= REFRESH =================
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,               
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ================= VERIFY TOKEN =================
router.get("/verify", async (req, res) => {
  try {
    console.log("Backend Verify: Cookies received:", Object.keys(req.cookies || {}));
    console.log("Backend Verify: auth_token present:", !!req.cookies?.auth_token);

    const token = req.cookies?.auth_token;
    if (!token) {
      console.log("Backend Verify: No auth_token in cookies");
      return res.status(401).json({ message: "No token provided" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(payload.id)
      .populate("roleId", "name permissions")
      .select("-password");

    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    // Check if user is superadmin
    const roleName = admin.roleId?.name || admin.role || "Admin";
    const isSuperAdmin = roleName === "superadmin";

    res.json({
      user: {
        _id: admin._id,
        name: admin.name || admin.email,
        email: admin.email,
        role: roleName,
        isSuperAdmin: isSuperAdmin,
        permissions: isSuperAdmin ? ["*"] : [
          ...new Set([
            ...(admin.roleId?.permissions || []),
            ...(admin.permissions || []),
          ]),
        ],
      },
    });
  } catch (err) {
    console.error("VERIFY ERROR:", err.message);
    res.status(401).json({ message: "Invalid token" });
  }
});

// ================= REFRESH TOKEN =================
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      return res.status(401).json({ message: "No refresh token" });
    }

    const payload = jwt.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET
    );

    const admin = await Admin.findById(payload.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "User not found" });
    }

    // 🔒 Session validation
    if (admin.currentSession?.token !== token) {
      return res.status(401).json({ message: "Session invalid" });
    }

    const newAccessToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("REFRESH ERROR:", err.message);
    res.status(401).json({ message: "Invalid refresh token" });
  }
});




// ✅ EXPORT ONLY ONCE
module.exports = router;
