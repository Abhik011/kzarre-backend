const express = require("express");
const router = express.Router();
const AboutPage = require("../models/AboutPage");

router.get("/", async (req, res) => {
  const about = await AboutPage.findOne({ published: true });
  if (!about) {
    return res.status(404).json({ message: "About page not found" });
  }
  res.json({ about });
});

module.exports = router;
