const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Role = require("../models/Role");

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const AUTH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 15 * 60 * 1000, // 15 minutes (access token expiry)
};

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Get permissions from role and admin
    let rolePermissions = [];
    if (admin.roleId) {
      const role = await Role.findById(admin.roleId);
      rolePermissions = role?.permissions || [];
    }

    const permissions = [
      ...new Set([...rolePermissions, ...(admin.permissions || [])]),
    ];

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Update admin session
    admin.currentSession = { token: refreshToken };
    await admin.save();

    // Set cookies
    console.log("Backend: Setting cookies");
    res.cookie("refresh_token", refreshToken, COOKIE_OPTIONS);
    res.cookie("auth_token", accessToken, AUTH_TOKEN_COOKIE_OPTIONS);
    console.log("Backend: Cookies set, auth_token length:", accessToken.length);

    // Return response matching frontend expectations
    res.json({
      accessToken,
      admin: {
        _id: admin._id,
        name: admin.name || admin.email,
        email: admin.email,
        role: admin.role || "Admin",
        permissions,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ================= REFRESH ================= */
router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: "No refresh token" });

  const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

  const admin = await Admin.findById(payload.id);
  if (!admin || admin.currentSession?.token !== token)
    return res.status(401).json({ message: "Session invalid" });

  const newAccessToken = jwt.sign(
    { id: admin._id },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  res.json({ accessToken: newAccessToken });
});

module.exports = router;
