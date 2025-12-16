const express = require("express");
const router = express.Router();
const uploadStoryImage = require("../utils/uploadStoryImage");
const Story = require("../models/Story");
const slugify = require("slugify");

/* =================================================
   ✅ CREATE STORY (ADMIN)
================================================= */
router.post(
  "/create",
  uploadStoryImage.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "images", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const { title, subtitle, content, published } = req.body;

      if (!title || !req.files?.coverImage) {
        return res
          .status(400)
          .json({ message: "Title & cover image required" });
      }

      const coverImage = req.files.coverImage[0].location;
      const images = req.files.images
        ? req.files.images.map((f) => f.location)
        : [];

      const story = await Story.create({
        title,
        subtitle,
        content,
        coverImage,
        images,
        published: published !== "false",
        slug: slugify(title, { lower: true, strict: true }),
      });

      res.status(201).json({ success: true, story });
    } catch (err) {
      console.error("STORY CREATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* =================================================
   ✅ LIST STORIES (ADMIN)
================================================= */
router.get("/", async (req, res) => {
  const stories = await Story.find().sort({ createdAt: -1 });
  res.json({ stories });
});

/* =================================================
   ✅ DELETE STORY
================================================= */
router.delete("/:id", async (req, res) => {
  await Story.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
