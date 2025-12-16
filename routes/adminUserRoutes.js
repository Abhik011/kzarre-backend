const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const { auth, authorizeRoles } = require("../middlewares/roleAuth");
const { sendEmail } = require("../utils/sendEmail");

const router = express.Router();

/* ======================================================
   🔐 LOGIN (WITH PERMISSIONS)
====================================================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: "Admin not found." });
    if (!admin.isActive)
      return res.status(403).json({ message: "Admin account inactive." });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ message: "Invalid password." });

    /* ================================
       🔑 RESOLVE PERMISSIONS
    ================================= */
    let resolvedPermissions = [];

    // 🔥 Superadmin → all permissions
    if (admin.role === "superadmin") {
      const allPermissions = await Permission.find().select("key");
      resolvedPermissions = allPermissions.map(p => p.key);
    } else {
      // 1️⃣ Role permissions
      if (admin.role) {
        const roleDoc = await Role.findOne({ name: admin.role });
        if (roleDoc?.permissions?.length) {
          resolvedPermissions.push(...roleDoc.permissions);
        }
      }

      // 2️⃣ User-specific permissions (override)
      if (admin.permissions?.length) {
        resolvedPermissions.push(...admin.permissions);
      }
    }

    // 🧹 Remove duplicates
    resolvedPermissions = [...new Set(resolvedPermissions)];

    /* ================================
       🔑 TOKENS
    ================================= */
    const payload = { id: admin._id };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "7d",
    });

    /* ================================
       📍 SESSION + ACTIVITY
    ================================= */
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    admin.currentSession = {
      token: refreshToken,
      ip,
      userAgent,
      loginAt: new Date(),
    };

    admin.activityLogs.push({ action: "LOGIN", ip, userAgent });
    await admin.save();

    /* ================================
       🍪 COOKIE
    ================================= */
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    /* ================================
       ✅ RESPONSE
    ================================= */
    res.json({
      success: true,
      message: "✅ Login successful",
      accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: resolvedPermissions, // 🔥 IMPORTANT
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   🔄 REFRESH TOKEN (NO CHANGE)
====================================================== */
router.post("/refresh", async (req, res) => {
  try {
    const oldToken = req.cookies?.refresh_token;
    if (!oldToken) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(oldToken, process.env.REFRESH_TOKEN_SECRET);
    const admin = await Admin.findById(payload.id);
    if (!admin) return res.status(401).json({ message: "User not found" });

    if (admin.currentSession?.token !== oldToken) {
      return res.status(401).json({ message: "Session invalid" });
    }

    const newAccessToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ success: true, accessToken: newAccessToken });
  } catch {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

/* ======================================================
   📜 PERMISSIONS (SUPERADMIN)
====================================================== */
router.get(
  "/permissions",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    const permissions = await Permission.find().sort("key");
    res.json({ permissions });
  }
);

/* ======================================================
   🧩 ROLES
====================================================== */
router.get(
  "/roles",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    const roles = await Role.find();
    res.json({ roles });
  }
);

router.post(
  "/roles",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    const { name, permissions } = req.body;

    const exists = await Role.findOne({ name });
    if (exists)
      return res.status(400).json({ message: "Role already exists" });

    const role = await Role.create({ name, permissions });
    res.status(201).json({ message: "✅ Role created", role });
  }
);

/* ======================================================
   👤 USERS
====================================================== */
router.get("/users", auth, authorizeRoles("superadmin"), async (req, res) => {
  const admins = await Admin.find().select("-password");
  res.json(admins);
});

router.put(
  "/update-permissions/:id",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { permissions: req.body.permissions },
      { new: true }
    ).select("-password");

    res.json({ message: "✅ Permissions updated", admin });
  }
);

router.put(
  "/toggle-active/:id",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    const admin = await Admin.findById(req.params.id);
    admin.isActive = !admin.isActive;
    await admin.save();

    res.json({
      message: `Admin ${admin.isActive ? "activated" : "deactivated"}`,
    });
  }
);

module.exports = router;
