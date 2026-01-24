const express = require("express");
const router = express.Router();
const accessAuth = require("../middlewares/accessAuth");

const Admin = require("../models/Admin");

router.get("/me", accessAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id)
      .populate("roleId", "name")
      .select("name email roleId");

    if (!admin) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: admin.name,
      email: admin.email,
      role: admin.roleId?.name || "Undefined", 
    });
  } catch (err) {
    console.error("PROFILE ME ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
