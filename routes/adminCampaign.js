const express = require("express");
const router = express.Router();
const Newsletter = require("../models/Newsletter");
const Subscriber = require("../models/Subscriber");
const Lead = require("../models/Lead");
const { auth } = require("../middlewares/auth");

// Subscribers
router.get("/subscribers", auth(), async (req, res) => {
  res.json(await Subscriber.find());
});

router.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email || !email.includes("@")) {
      return res.status(400).json({
        message: "Please provide a valid email address.",
      });
    }

    // Check duplicate
    const exists = await Newsletter.findOne({ email });
    if (exists) {
      return res.status(409).json({
        message: "This email is already subscribed.",
      });
    }

    // Save
    await Newsletter.create({ email });

    return res.status(201).json({
      message: "Successfully subscribed to newsletter.",
    });
  } catch (err) {
    console.error("Newsletter error:", err);
    return res.status(500).json({
      message: "Server error. Please try again later.",
    });
  }
});


// Create Newsletter
router.post("/newsletter", auth(), async (req, res) => {
  const { subject, content } = req.body;
  const mail = await Newsletter.create({ subject, content });
  res.json(mail);
});

// Leads
router.get("/leads", auth(), async (req, res) => {
  res.json(await Lead.find());
});

module.exports = router;
