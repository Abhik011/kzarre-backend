const express = require("express");
const router = express.Router();
const Notify = require("../models/Notify");

// ✅ USER clicks "Notify Me"
router.post("/", async (req, res) => {
  try {
    const { productId, email, size = null, color = null } = req.body;

    if (!productId || !email) {
      return res.status(400).json({
        success: false,
        message: "Product ID & Email required",
      });
    }

    // ✅ Check existing subscription (variant-aware)
    const exists = await Notify.findOne({
      productId,
      email,
      size,
      color,
    });

    if (exists) {
      return res.status(200).json({
        success: true,
        message: "You are already subscribed for this variant",
      });
    }

    await Notify.create({
      productId,
      email,
      size,
      color,
    });

    res.status(201).json({
      success: true,
      message: "You will be notified when this item is back in stock ✅",
    });
  } catch (err) {
    console.error("NOTIFY ERROR:", err);

    // ✅ Handle duplicate key error safely
    if (err.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "You are already subscribed for this variant",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
