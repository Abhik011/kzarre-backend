const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const { auth, authorizeRoles } = require("../middlewares/roleAuth");
const { sendEmail } = require("../utils/sendEmail");
const accessAuth = require("../middlewares/accessAuth");
const requirePermission = require("../middlewares/requirePermission");
const router = express.Router();
const Activity = require("../models/Activity");


router.post("/create-user",

  async (req, res) => {
    try {
      const { firstName, lastName, email, roleId } = req.body;

      // 1️⃣ Validate role
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      // 2️⃣ Check existing user
      const exists = await Admin.findOne({ email });
      if (exists) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // 3️⃣ Generate password
      const plainPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // 4️⃣ Create admin
      const admin = await Admin.create({
        name: `${firstName} ${lastName}`,
        email,
        password: hashedPassword,
        roleId: role._id,
        isActive: true,
      });

      // 5️⃣ Send email (NON-BLOCKING but awaited for safety)
      await sendEmail(
        email,
        "Your Admin Account Credentials",
        `
    <div style="font-family: Arial, sans-serif">
      <h2>Welcome to KZARRÈ Admin Panel</h2>
      <p>Your account has been created.</p>

      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Password:</strong> ${plainPassword}</p>
      <p><strong>Role:</strong> ${role.name}</p>

      <p style="margin-top:12px">
        ⚠️ Please login and change your password immediately.
      </p>

      <p>
        Login URL:
        <a href="${process.env.ADMIN_LOGIN_URL}">
          ${process.env.ADMIN_LOGIN_URL}
        </a>
      </p>
    </div>
  `
      );
      // 🔥 ACTIVITY LOG: CREATE USER
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

      await Activity.create({
        userId: req.user?.id || null,          // creator
        userName: req.user?.name || "SYSTEM",
        action: "CREATE_USER",
        meta: {
          createdUserId: admin._id,
          createdUserEmail: admin.email,
          role: role.name,
        },
        ip,
        timestamp: new Date(),
      });

      // 6️⃣ Response
      res.status(201).json({
        message: "✅ User created and email sent",
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: role.name,
        },
      });
    } catch (err) {
      console.error("CREATE USER ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================================================
   🔐 LOGIN
====================================================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    /* ================================
       1️⃣ FIND USER
    ================================= */
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "Admin account inactive." });
    }

    /* ================================
       2️⃣ VERIFY PASSWORD
    ================================= */
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(400).json({ message: "Invalid password." });
    }

    /* ================================
       3️⃣ RESOLVE ROLE + PERMISSIONS
    ================================= */
    let resolvedPermissions = [];
    let roleName = "—";

    console.log("🔍 LOGIN DEBUG - Role Resolution:");
    console.log("- Admin roleId:", admin.roleId);

    if (admin.roleId) {
      console.log("- Searching for role with ID:", admin.roleId);
      console.log("- Role ID type:", typeof admin.roleId);

      const roleDoc = await Role.findById(admin.roleId);
      console.log("- Role.findById result:", roleDoc);

      if (!roleDoc) {
        console.log("- Trying Role.findOne with string ID...");
        const roleDocAlt = await Role.findOne({ _id: admin.roleId });
        console.log("- Role.findOne result:", roleDocAlt);
      }

      if (roleDoc) {
        roleName = roleDoc.name;
        console.log("- Setting roleName to:", roleName);
        console.log("- roleDoc.name is:", roleDoc.name);
        console.log("- roleName after assignment:", roleName);

        // 🔥 Superadmin → ALL permissions
        if (roleDoc.name === "superadmin") {
          console.log("- Superadmin detected, getting all permissions");
          const allPermissions = await Permission.find().select("key");
          resolvedPermissions = allPermissions.map(p => p.key);
          console.log("- All permissions loaded:", resolvedPermissions.length);
          // Ensure role is set to superadmin
          roleName = "superadmin";
          console.log("- Forcing roleName to superadmin");
        } else {
          // Role permissions
          if (roleDoc.permissions?.length) {
            resolvedPermissions.push(...roleDoc.permissions);
          }
        }
      } else {
        console.log("- ERROR: Role document not found for roleId:", admin.roleId);
      }
    } else {
      console.log("- ERROR: Admin has no roleId");
    }

    console.log("- Final roleName:", roleName);
    console.log("- Final permissions count:", resolvedPermissions.length);

    // 🔁 User-level permission overrides
    if (admin.permissions?.length) {
      resolvedPermissions.push(...admin.permissions);
    }

    // 🧹 Remove duplicates
    resolvedPermissions = [...new Set(resolvedPermissions)];

    /* ================================
       4️⃣ TOKENS
    ================================= */
    const payload = { id: admin._id };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign(
      payload,
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    /* ================================
       5️⃣ SESSION + ACTIVITY LOG
    ================================= */
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    admin.currentSession = {
      token: refreshToken,
      ip,
      userAgent,
      loginAt: new Date(),
    };

    admin.activityLogs.push({
      action: "LOGIN",
      ip,
      userAgent,
      timestamp: new Date(),
    });

    await admin.save();

    /* ================================
       6️⃣ COOKIE
    ================================= */
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    /* ================================
       7️⃣ RESPONSE
    ================================= */
    console.log("🔍 LOGIN DEBUG - Final Response:");
    console.log("- roleName before response:", roleName);
    console.log("- permissions count:", resolvedPermissions.length);

    res.json({
      success: true,
      message: "Login successful",
      accessToken,

      // 🔥 THIS IS REQUIRED
      permissions: resolvedPermissions,

      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: roleName,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/roles/:id",
  async (req, res) => {
    try {
      const role = await Role.findById(req.params.id);
      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      // ✅ CHECK BY roleId (NOT name)
      const usersUsingRole = await Admin.countDocuments({
        roleId: role._id,
      });

      if (usersUsingRole > 0) {
        return res.status(400).json({
          message: "Role is assigned to users. Remove it first.",
        });
      }

      await Role.findByIdAndDelete(role._id);
      // 🔥 ACTIVITY LOG: DELETE ROLE
const ip =
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket.remoteAddress;

await Activity.create({
  userId: req.user?.id || null,
  userName: req.user?.name || "UNKNOWN",
  action: "DELETE_ROLE",
  meta: {
    roleId: role._id,
    roleName: role.name,
  },
  ip,
  timestamp: new Date(),
});


      res.json({ message: "✅ Role deleted successfully" });
    } catch (err) {
      console.error("DELETE ROLE ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);
// ======================================================
// 🗑️ DELETE USER (HARD DELETE)
// ======================================================
router.delete("/users/:id",

  async (req, res) => {
    try {
      const admin = await Admin.findById(req.params.id);

      if (!admin) {
        return res.status(404).json({ message: "User not found" });
      }

      // 🔥 Prevent deleting self (important safety)
      const requesterId =
        req.user?.id || req.user?._id || req.admin?._id;

      if (requesterId && admin._id.toString() === requesterId.toString()) {
        return res.status(400).json({
          message: "You cannot delete your own account",
        });
      }
      await Admin.findByIdAndDelete(admin._id);
      // 🔥 ACTIVITY LOG: DELETE USER
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

      await Activity.create({
        userId: req.user?.id || null,
        userName: req.user?.name || "UNKNOWN",
        action: "DELETE_USER",
        meta: {
          deletedUserId: admin._id,
          deletedUserEmail: admin.email,
        },
        ip,
        timestamp: new Date(),
      });

      res.json({ success: true, message: "✅ User deleted successfully" });
    } catch (err) {
      console.error("DELETE USER ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);
// ======================================================
// 🔄 SET USER ACTIVE / INACTIVE (EXPLICIT)
// ======================================================
router.patch("/users/:id/status",
  accessAuth,
  requirePermission("manage_users"),
  async (req, res) => {
    try {
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "isActive must be boolean",
        });
      }

      const admin = await Admin.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true }
      ).select("-password");

      if (!admin) {
        return res.status(404).json({ message: "User not found" });
      }
       // 🔥 ACTIVITY LOG: USER STATUS CHANGE
const ip =
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket.remoteAddress;

await Activity.create({
  userId: req.user?.id || null,
  userName: req.user?.name || "UNKNOWN",
  action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
  meta: {
    targetUserId: admin._id,
    targetUserEmail: admin.email,
  },
  ip,
  timestamp: new Date(),
});

      res.json({
        success: true,
        message: `User ${isActive ? "activated" : "deactivated"}`,
        admin,
      });
    } catch (err) {
      console.error("SET STATUS ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

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

    // 🔥 ACTIVITY LOG: ADMIN TOKEN REFRESH
const ip =
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket.remoteAddress;

await Activity.create({
  userId: admin._id,
  userName: admin.name,
  action: "ADMIN_TOKEN_REFRESH",
  ip,
  timestamp: new Date(),
});

  } catch {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

router.get("/permissions",
  async (req, res) => {
    const permissions = await Permission.find().sort("key");
    res.json({ permissions });
  }
);

router.get("/roles",

  async (req, res) => {
    const roles = await Role.find();
    res.json({ roles });
  }
);

router.post("/roles",

  async (req, res) => {
    const { name, permissions } = req.body;

    const exists = await Role.findOne({ name });
    if (exists)
      return res.status(400).json({ message: "Role already exists" });

    const role = await Role.create({ name, permissions });
    res.status(201).json({ message: "✅ Role created", role });
  }
);

router.get(
  "/users",
  async (req, res) => {
    const users = await Admin.find()
      .select("-password")
      .populate("roleId", "name permissions"); // 🔥 FIX

    res.json(users);
  }
);


router.put("/update-permissions/:id",
  async (req, res) => {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { permissions: req.body.permissions },
      { new: true }
    ).select("-password");

    // 🔥 ACTIVITY LOG: UPDATE PERMISSIONS
const ip =
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket.remoteAddress;

await Activity.create({
  userId: req.user?.id || null,
  userName: req.user?.name || "UNKNOWN",
  action: "UPDATE_PERMISSIONS",
  meta: {
    targetUserId: admin._id,
    newPermissions: req.body.permissions,
  },
  ip,
  timestamp: new Date(),
});


    res.json({ message: "✅ Permissions updated", admin });
  }
);

router.put("/toggle-active/:id",
  accessAuth,
  requirePermission("manage_users"),
  async (req, res) => {
    const admin = await Admin.findById(req.params.id);
    admin.isActive = !admin.isActive;
    await admin.save();

    res.json({
      message: `Admin ${admin.isActive ? "activated" : "deactivated"}`,
    });
  }
);

// Get user orders
router.get("/user/:id/orders", accessAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await Admin.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Find orders for this user (assuming orders have customerId or similar field)
    // Note: This assumes Order model has a customerId field pointing to Admin _id
    const Order = require("../models/Order");
    const orders = await Order.find({ customerId: id })
      .sort({ createdAt: -1 })
      .select("orderId amount status paymentStatus createdAt items");

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        orders: orders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          amount: order.amount,
          status: order.status,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
          items: order.items || []
        }))
      }
    });
  } catch (err) {
    console.error("GET USER ORDERS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user orders",
    });
  }
});

// Search users by email
router.get("/search", accessAuth, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || email.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Email search query must be at least 2 characters"
      });
    }

    const searchRegex = new RegExp(email.trim(), 'i');

    // Search admins/users by email
    const users = await Admin.find({
      email: searchRegex,
      isActive: true
    })
      .select("_id name email role")
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }))
    });
  } catch (err) {
    console.error("USER SEARCH ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to search users",
    });
  }
});

module.exports = router;
