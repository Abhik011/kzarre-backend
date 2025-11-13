const express = require("express");
const jwt = require("jsonwebtoken");
const SuperAdmin = require("../models/SuperAdmin");
const { sendEmail } = require("../utils/sendEmail");
const { superAdminOTPTemplate } = require("../utils/emailTemplates");

const router = express.Router();

// ============================================================
// 🔢 Generate random 6-digit OTP
// ============================================================
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Temporary in-memory store for unverified or login OTPs
const pendingSuperAdmins = {}; // { email: { name, otp, otpExpires } }

// ============================================================
// 👑 STEP 1: REGISTER SuperAdmin (Send OTP but don't store yet)
// ============================================================
router.post("/register", async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email || !name)
      return res.status(400).json({ message: "Name and email are required." });

    // Prevent duplicate registration
    const existing = await SuperAdmin.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "SuperAdmin already exists." });

    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes validity

    pendingSuperAdmins[email] = { name, otp, otpExpires };

    await sendEmail(
      email,
      "KZARRÈ SuperAdmin Registration OTP",
      superAdminOTPTemplate(name, otp, "register")
    );

    res.status(200).json({
      success: true,
      message: "✅ OTP sent to email for verification.",
      email,
    });
  } catch (err) {
    console.error("❌ SuperAdmin Register Error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// ============================================================
// 🔐 STEP 2: VERIFY OTP (Create SuperAdmin in DB + Issue Token)
// ============================================================
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const pending = pendingSuperAdmins[email];
    if (!pending)
      return res.status(400).json({ message: "No OTP request found." });

    if (pending.otp !== otp || Date.now() > pending.otpExpires)
      return res.status(400).json({ message: "Invalid or expired OTP." });

    const newSuperAdmin = new SuperAdmin({
      name: pending.name,
      email,
      isVerified: true,
    });

    await newSuperAdmin.save();
    delete pendingSuperAdmins[email]; // clear from memory

    // ✅ Generate new token immediately after registration
    const token = jwt.sign(
      { id: newSuperAdmin._id, role: "superadmin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "✅ SuperAdmin verified and registered successfully.",
      token,
      superAdmin: {
        id: newSuperAdmin._id,
        name: newSuperAdmin.name,
        email: newSuperAdmin.email,
      },
    });
  } catch (err) {
    console.error("❌ SuperAdmin OTP Verify Error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// ============================================================
// ✉️ STEP 3: LOGIN SuperAdmin (Send OTP)
// ============================================================
router.post("/login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: "Email is required." });

    const superAdmin = await SuperAdmin.findOne({ email, isVerified: true });
    if (!superAdmin)
      return res
        .status(404)
        .json({ message: "SuperAdmin account not found or unverified." });

    const otp = generateOTP();
    const otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

    pendingSuperAdmins[email] = { otp, otpExpires };

    await sendEmail(
      email,
      "KZARRÈ SuperAdmin Login OTP",
      superAdminOTPTemplate(superAdmin.name, otp, "login")
    );

    res.json({
      success: true,
      message: "✅ OTP sent to your email for login.",
      email,
    });
  } catch (err) {
    console.error("❌ SuperAdmin Login Error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// ============================================================
// 🔑 STEP 4: VERIFY Login OTP → Issue NEW JWT token every login
// ============================================================
router.post("/login/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const superAdmin = await SuperAdmin.findOne({ email });
    const pending = pendingSuperAdmins[email];

    if (!superAdmin || !pending || pending.otp !== otp || Date.now() > pending.otpExpires)
      return res.status(400).json({ message: "Invalid or expired OTP." });

    delete pendingSuperAdmins[email];

    // 🔐 Generate tokens
    const payload = { id: superAdmin._id, role: "superadmin" };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

    // 🧠 Extract IP + User Agent
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // ❌ Invalidate old session (one active session rule)
    superAdmin.currentSession = {
      token: refreshToken,
      ip,
      userAgent,
      loginAt: new Date(),
    };

    // 🧾 Add activity log
    superAdmin.activityLogs.push({
      action: "LOGIN",
      ip,
      userAgent,
    });

    await superAdmin.save();

    // 🍪 Send secure cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: "✅ SuperAdmin login successful.",
      accessToken,
      superAdmin: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
      },
    });
  } catch (err) {
    console.error("❌ SuperAdmin Login Verify Error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ message: "No refresh token found." });

    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const superAdmin = await SuperAdmin.findById(payload.id);

    if (!superAdmin) return res.status(401).json({ message: "User not found." });

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // ✅ Check if session token matches and same IP
    if (
      !superAdmin.currentSession ||
      superAdmin.currentSession.token !== token ||
      superAdmin.currentSession.ip !== ip
    ) {
      return res.status(401).json({ message: "Session invalid or logged in elsewhere." });
    }

    // 🟢 Generate new access token
    const newAccessToken = jwt.sign(
      { id: superAdmin._id, role: "superadmin" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.json({ message: "Already logged out." });

    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const superAdmin = await SuperAdmin.findById(payload.id);
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (superAdmin && superAdmin.currentSession?.token === token) {
      superAdmin.currentSession.logoutAt = new Date();

      superAdmin.activityLogs.push({
        action: "LOGOUT",
        ip,
        userAgent: req.headers["user-agent"],
      });

      superAdmin.currentSession = null; // invalidate session
      await superAdmin.save();
    }

    res.clearCookie("refresh_token", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "✅ Logged out successfully." });
  } catch (err) {
    res.clearCookie("refresh_token");
    res.json({ message: "✅ Logged out." });
  }
});
// ============================================================
// 📜 STEP 5: GET SuperAdmin Activity Logs + Current Session
// ============================================================
router.get("/activity", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ message: "No session found." });

    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const superAdmin = await SuperAdmin.findById(payload.id).select(
      "email name currentSession activityLogs"
    );

    if (!superAdmin)
      return res.status(404).json({ message: "SuperAdmin not found." });

    res.json({
      success: true,
      currentSession: superAdmin.currentSession,
      activityLogs: superAdmin.activityLogs.reverse(), // newest first
    });
  } catch (err) {
    console.error("Error fetching activity logs:", err);
    res.status(500).json({ message: "Server error while fetching logs." });
  }
});



module.exports = router;
