const express = require("express");
const jwt = require("jsonwebtoken");
const Activity = require("../models/Activity");

const router = express.Router();

// GET ALL ACTIVITY (Only SuperAdmin)
router.get("/", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match)
      return res.status(401).json({ message: "No token provided" });

    let payload;
    try {
      payload = jwt.verify(match[1], process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid access token" });
    }

    if (payload.role !== "superadmin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const logs = await Activity.find().sort({ timestamp: -1 });

    res.json({ success: true, logs });
  } catch (err) {
    console.error("Activity route error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
