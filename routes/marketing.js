// routes/marketing.js
const express = require("express");
const router = express.Router();
const EmailTemplate = require("../models/EmailTemplate");
const Campaign = require("../models/Campaign");
const Subscriber = require("../models/Subscriber");
const sendEmail = require("../utils/sendEmail");
const upload = require("../middlewares/upload"); // multer
const accessAuth = require("../middlewares/accessAuth");

router.post("/templates", accessAuth, async (req, res) => {
  try {
    const { name, subject, blocks, html } = req.body;

    if (!name || !subject || !html) {
      return res.status(400).json({ message: "Name, subject, html required" });
    }

    const template = await EmailTemplate.create({
      name,
      subject,
      blocks: blocks || [],
      html,
      createdBy: req.user.id,
    });

    res.json({ success: true, template });
  } catch (err) {
    console.error("TEMPLATE CREATE ERROR:", err);
    res.status(500).json({ message: "Failed to save template" });
  }
});

router.get("/templates", accessAuth, async (req, res) => {
  const templates = await EmailTemplate.find().sort({ createdAt: -1 });
  res.json({ templates });
});

router.post("/campaigns", accessAuth, async (req, res) => {
  try {
    const { templateId, scheduledAt } = req.body;

    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    const campaign = await Campaign.create({
      subject: template.subject,
      template: template._id,
      html: template.html,
      status: scheduledAt ? "scheduled" : "sent",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      sentAt: scheduledAt ? null : new Date(),
      createdBy: req.user.id,
    });

    // 🔥 SEND IMMEDIATELY IF NOT SCHEDULED
    if (!scheduledAt) {
      const subscribers = await Subscriber.find();

      for (const sub of subscribers) {
        await sendEmail(sub.email, template.subject, template.html);
      }
    }

    res.json({ success: true, campaign });
  } catch (err) {
    console.error("CAMPAIGN CREATE ERROR:", err);
    res.status(500).json({ message: "Failed to create campaign" });
  }
});

router.get("/campaigns", accessAuth, async (req, res) => {
  const campaigns = await Campaign.find()
    .populate("template", "name")
    .sort({ createdAt: -1 });

  res.json({ campaigns });
});
