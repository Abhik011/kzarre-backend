const express = require("express");
const router = express.Router();
const AboutPage = require("../models/AboutPage");

/* ===== CREATE OR UPDATE ===== */
router.post("/", async (req, res) => {
  try {
    const existing = await AboutPage.findOne();

    if (existing) {
      const updated = await AboutPage.findByIdAndUpdate(
        existing._id,
        req.body,
        { new: true }
      );
      return res.json({ success: true, about: updated });
    }

    const about = await AboutPage.create(req.body);
    res.status(201).json({ success: true, about });
  } catch (err) {
    console.error("ABOUT SAVE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ===== GET (ADMIN) ===== */
router.get("/", async (req, res) => {
  const about = await AboutPage.findOne();
  res.json({ about });
});

module.exports = router;
