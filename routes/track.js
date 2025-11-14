const express = require("express");
const router = express.Router();
const Traffic = require("../models/Traffic"); // your traffic model

router.post("/", async (req, res) => {
  try {
    const { visitorId, userId, url, userAgent } = req.body;

    console.log("\n📥 NEW TRAFFIC EVENT RECEIVED:");
    console.log("Visitor ID:", visitorId);
    console.log("User ID:", userId || "Guest");
    console.log("URL:", url);
    console.log("User Agent:", userAgent);
    console.log("Time:", new Date().toISOString());
    console.log("--------------------------------------------------");

    await Traffic.create({
      visitorId,
      userId,
      url,
      userAgent,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("🔥 Error saving traffic:", err);
    res.status(500).json({ success: false, message: "Tracking failed" });
  }
});

module.exports = router;
