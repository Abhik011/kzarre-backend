const express = require("express");
const router = express.Router();

const Newsletter = require("../models/Newsletter");
const Subscriber = require("../models/Subscriber");
const Lead = require("../models/Lead");
const EmailTemplate = require("../models/EmailTemplate");
const sendEmail = require("../utils/sendEmail");
const { auth } = require("../middlewares/auth");

/* =====================================================
   📩 CREATE NEWSLETTER (TEMPLATE-BASED ONLY)
===================================================== */
router.post("/newsletter",  async (req, res) => {
  try {
    const { subject, content, blocks, status } = req.body;

    if (!subject || !status) {
      return res.status(400).json({ message: "Subject & status required" });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Invalid session" });
    }

    // ✅ SAVE EXACTLY WHAT FRONTEND SENDS
    const newsletter = await Newsletter.create({
      subject,
      content: content || "",     // ✅ FINAL HTML
      blocks: blocks || [],       // ✅ editor state (optional)
      status,
      createdBy: userId,
    });

    res.json({
      success: true,
      message: "Newsletter saved",
      newsletter,
    });

  } catch (err) {
    console.error("NEWSLETTER ERROR:", err);
    res.status(500).json({ message: "Failed to save newsletter" });
  }
});

/* =====================================================
   👥 SUBSCRIBERS (PUBLIC + ADMIN)
===================================================== */
router.post("/send",  async (req, res) => {
  try {
    const { newsletterId, testEmail } = req.body;

    if (!newsletterId) {
      return res.status(400).json({ message: "newsletterId required" });
    }

    const newsletter = await Newsletter.findById(newsletterId);
    if (!newsletter) {
      return res.status(404).json({ message: "Newsletter not found" });
    }

    if (!newsletter.blocks || !newsletter.blocks.length) {
      return res.status(400).json({ message: "Newsletter has no content" });
    }

    // ✅ Convert blocks → HTML
    const html = newsletter.blocks
      .map(block => block.html || "")
      .join("");

    /* =====================
       TEST EMAIL MODE
    ===================== */
    if (testEmail) {
      await sendEmail(
        testEmail,
        newsletter.subject,
        html
      );

      return res.json({
        success: true,
        message: "Test email sent successfully",
      });
    }

    /* =====================
       SEND TO ALL SUBSCRIBERS
    ===================== */
    const subscribers = await Subscriber.find();

    for (const sub of subscribers) {
      await sendEmail(
        sub.email,
        newsletter.subject,
        html
      );
    }

    newsletter.status = "sent";
    newsletter.sentAt = new Date();
    await newsletter.save();

    res.json({
      success: true,
      sent: subscribers.length,
    });

  } catch (err) {
    console.error("❌ CAMPAIGN SEND ERROR:", err);
    res.status(500).json({ message: "Campaign send failed" });
  }
});

// ADMIN – list subscribers
router.get("/subscribers", async (req, res) => {
  const subscribers = await Subscriber.find().sort({ createdAt: -1 });
  res.json({ subscribers });
});


// PUBLIC – subscribe
router.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const exists = await Subscriber.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Already subscribed" });
    }

    await Subscriber.create({ email });

    res.status(201).json({
      success: true,
      message: "Successfully subscribed",
    });
  } catch (err) {
    console.error("SUBSCRIBE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   🎯 LEADS (ADMIN)
===================================================== */
router.get("/leads", async (req, res) => {
  const leads = await Lead.find().sort({ createdAt: -1 });
  res.json(leads);
});

module.exports = router;
