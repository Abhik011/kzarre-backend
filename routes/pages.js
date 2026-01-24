const express = require("express");
const router = express.Router();
const CmsPage = require("../models/CmsPage");
const accessAuth = require("../middlewares/accessAuth");    
const ContactMessage = require("../models/ContactMessage");


/* ======================================
   PUBLIC – SUBMIT CONTACT FORM
====================================== */
router.post("/public/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "All fields required" });
    }

    const saved = await ContactMessage.create({
      name,
      email,
      message,
      page: "contact",
    });

    res.json({ success: true, message: "Message received", id: saved._id });
  } catch (err) {
    console.error("CONTACT SAVE ERROR:", err);
    res.status(500).json({ message: "Failed to save message" });
  }
});

/* ======================================
   ADMIN – LIST ALL CONTACT MESSAGES
====================================== */
router.get("/messages/contact", accessAuth, async (req, res) => {
  const messages = await ContactMessage.find()
    .sort({ createdAt: -1 });

  res.json({ messages });
});

router.get("/pages/:key", accessAuth, async (req, res) => {
  const { key } = req.params;

  let page = await CmsPage.findOne({ key });

  // 🔥 AUTO-CREATE IF NOT EXISTS (WITH TYPE)
  if (!page) {
    const inferType = (key) => {
      if (key === "faq") return "faq";
      if (["about", "sustainability", "accessibility"].includes(key)) return "about";
      if (["legal", "return-policy", "shipping", "returns"].includes(key)) return "policy";
      if (key === "contact") return "contact";
      return "generic";
    };

    page = await CmsPage.create({
      key,
      title: key
        .split("-")
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(" "),
      type: inferType(key),   // 🔥 REQUIRED FIELD
      sections: [
        {
          id: "main",
          type: "text",
          html: "",
        },
      ],
    });
  }

  res.json({ page });
});

router.put("/pages/:key", accessAuth, async (req, res) => {
  const { title, sections, type } = req.body;

  const inferType = (key) => {
    if (key === "faq") return "faq";
    if (["about", "sustainability", "accessibility"].includes(key)) return "about";
    if (["legal", "return-policy", "shipping", "returns"].includes(key)) return "policy";
    if (key === "contact") return "contact";
    return "generic";
  };

  const page = await CmsPage.findOneAndUpdate(
    { key: req.params.key },
    {
      key: req.params.key,
      title,
      type: type || inferType(req.params.key), // 🔥 NEVER MISSING
      sections: Array.isArray(sections) ? sections : [],
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true, // 🔥 ensure schema rules applied
    }
  );

  res.json({ success: true, page });
});

router.get("/public/pages/:key", async (req, res) => {
  const page = await CmsPage.findOne({ key: req.params.key });

  if (!page) {
    return res.status(404).json({ message: "Page not found" });
  }

  res.json({ page });
});

module.exports = router;
    
// e.g. "text", "list", "hero"