const express = require("express");
const router = express.Router();
const Notify = require("../models/Notify");

// ✅ USER clicks "Notify Me"
router.post("/", async (req, res) => {
  try {
    const { productId, email } = req.body;

    if (!productId || !email) {
      return res.status(400).json({
        success: false,
        message: "Product ID & Email required",
      });
    }

    const exists = await Notify.findOne({ productId, email });

    if (exists) {
      return res.status(200).json({
        success: true,
        message: "You are already subscribed",
      });
    }

    await Notify.create({ productId, email });

    res.status(201).json({
      success: true,
      message: "You will be notified when stock is back ✅",
    });
  } catch (err) {
    console.log("NOTIFY ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
