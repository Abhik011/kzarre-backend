const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { auth, authorizeRoles } = require("../middlewares/roleAuth");
const { sendEmail } = require("../utils/sendEmail");
const router = express.Router();


router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) return res.status(404).json({ message: "Admin not found." });
    if (!admin.isActive)
      return res.status(403).json({ message: "Admin account is inactive." });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ message: "Invalid password." });

    // 🔑 Generate tokens
    const payload = { id: admin._id, role: admin.role };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "7d",
    });

    // 📍 Capture IP + device info
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // ❌ Allow only one active session
    admin.currentSession = {
      token: refreshToken,
      ip,
      userAgent,
      loginAt: new Date(),
    };

    // 🧾 Add to activity log
    admin.activityLogs.push({ action: "LOGIN", ip, userAgent });

    await admin.save();

    // 🍪 Send secure refresh token cookie
    res.cookie("refresh_token_admin", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: "✅ Admin login successful.",
      accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Admin Login Error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});


router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token_admin;
    if (!token) return res.status(401).json({ message: "No refresh token." });

    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const admin = await Admin.findById(payload.id);

    if (!admin) return res.status(401).json({ message: "User not found." });

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (
      !admin.currentSession ||
      admin.currentSession.token !== token ||
      admin.currentSession.ip !== ip
    ) {
      return res.status(401).json({ message: "Session invalid or expired." });
    }

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
});


router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token_admin;
    if (!token) return res.json({ message: "Already logged out." });

    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const admin = await Admin.findById(payload.id);
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (admin && admin.currentSession?.token === token) {
      admin.currentSession.logoutAt = new Date();
      admin.activityLogs.push({
        action: "LOGOUT",
        ip,
        userAgent: req.headers["user-agent"],
      });
      admin.currentSession = null;
      await admin.save();
    }

    res.clearCookie("refresh_token_admin", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "✅ Admin logged out successfully." });
  } catch (err) {
    res.clearCookie("refresh_token_admin");
    res.json({ message: "✅ Logged out." });
  }
});


router.get("/activity", auth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select(
      "email name currentSession activityLogs"
    );
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    res.json({
      success: true,
      currentSession: admin.currentSession,
      activityLogs: admin.activityLogs.reverse(),
    });
  } catch (err) {
    console.error("Error fetching admin activity:", err);
    res.status(500).json({ message: "Server error." });
  }
});



router.post(
  "/create-user",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    try {
      const { firstName, lastName, email, role, group, status } = req.body;

      const existing = await Admin.findOne({ email });
      if (existing)
        return res.status(400).json({ message: "Admin already exists." });

      // 🔐 Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // 👤 Create admin account
      const newAdmin = new Admin({
        name: `${firstName} ${lastName}`,
        email,
        password: hashedPassword,
        role: role || "admin",
        group: group || "none",
        isActive: status === "Active",
      });

      await newAdmin.save();

      // 📌 Login URL (change to your real frontend domain)
      const loginUrl = `${process.env.FRONTEND_URL}/admin/login`;

      // 📩 Email body
      const emailHTML = `
        <div style="font-family: Arial; padding: 20px;">
          <h2>Welcome to KZARRÈ, ${firstName}!</h2>
          <p>Your admin account has been created successfully.</p>

          <h3>🔐 Login Details</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>

          <p>Please log in and change your password immediately.</p>

          <a href="${loginUrl}" 
             style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px;">
             Login Now
          </a>

          <br/><br/>
          <p>Regards,<br/>KZARRÈ Team</p>
        </div>
      `;

      // 📬 Send welcome email
      await sendEmail(
        email,
        "Welcome to KZARRÈ – Your Admin Account",
        emailHTML
      );

      return res.status(201).json({
        message: "✅ Admin created successfully. Email sent.",
        admin: newAdmin,
        tempPassword,
      });
    } catch (err) {
      console.error("Error creating admin:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);



router.get("/users", auth, authorizeRoles("superadmin"), async (req, res) => {
  console.log("\n===== USERS ROUTE DEBUG =====");
  console.log("User accessing:", req.user);
  console.log("==============================\n");

  try {
    const admins = await Admin.find().select("-password");
    res.json(admins);
  } catch (err) {
    console.error("Error fetching admins:", err);
    res.status(500).json({ message: "Server error." });
  }
});



router.put(
  "/update-user/:id",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    try {
      const { role, group, status } = req.body;

      const updatedAdmin = await Admin.findByIdAndUpdate(
        req.params.id,
        {
          ...(role && { role }),
          ...(group && { group }),
          ...(status && { isActive: status === "Active" }),
        },
        { new: true }
      ).select("-password");

      if (!updatedAdmin)
        return res.status(404).json({ message: "Admin not found." });

      res.json({
        message: "✅ Admin updated successfully.",
        admin: updatedAdmin,
      });
    } catch (err) {
      console.error("Error updating admin:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);


router.delete(
  "/delete-user/:id",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    try {
      const deletedAdmin = await Admin.findByIdAndDelete(req.params.id);
      if (!deletedAdmin)
        return res.status(404).json({ message: "Admin not found." });

      res.json({ message: "✅ Admin deleted successfully." });
    } catch (err) {
      console.error("Error deleting admin:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);


router.put(
  "/toggle-active/:id",
  auth,
  authorizeRoles("superadmin"),
  async (req, res) => {
    try {
      const admin = await Admin.findById(req.params.id);
      if (!admin) return res.status(404).json({ message: "Admin not found." });

      admin.isActive = !admin.isActive;
      await admin.save();

      res.json({
        message: `✅ Admin ${admin.isActive ? "activated" : "deactivated"}`,
        isActive: admin.isActive,
      });
    } catch (err) {
      console.error("Error toggling admin status:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);

module.exports = router;
