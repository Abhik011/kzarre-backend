const express = require("express");
const router = express.Router();
const Story = require("../models/Story");

router.get("/", async (req, res) => {
  const stories = await Story.find({ published: true })
    .sort({ createdAt: -1 })
    .select("title subtitle coverImage slug");

  res.json({ stories });
});

router.get("/:slug", async (req, res) => {
  const story = await Story.findOne({
    slug: req.params.slug,
    published: true,
  });

  if (!story) return res.status(404).json({ message: "Story not found" });

  res.json({ story });
});

module.exports = router;
