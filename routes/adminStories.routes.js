const express = require("express");
const router = express.Router();
const slugify = require("slugify");
const Story = require("../models/Story");
const uploadStoryImage = require("../utils/uploadStoryImage");

/* ================= ADMIN ================= */

// CREATE
router.post(
  "/create",
  uploadStoryImage.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "images", maxCount: 5 },
  ]),
  async (req, res) => {
    const { title, subtitle, content, published } = req.body;

    if (!title || !content)
      return res.status(400).json({ message: "Title & content required" });

    if (!req.files?.coverImage)
      return res.status(400).json({ message: "Cover image required" });

    const story = await Story.create({
      title,
      subtitle,
      content,
      coverImage: req.files.coverImage[0].location,
      images: req.files.images?.map(f => f.location) || [],
      slug: slugify(title, { lower: true, strict: true }),
      published: published !== "false",
    });

    res.status(201).json({ success: true, story });
  }
);

// LIST (ADMIN)
router.get("/", async (_, res) => {
  const stories = await Story.find().sort({ createdAt: -1 });
  res.json({ stories });
});

// UPDATE ✅
router.put(
  "/:id",
  uploadStoryImage.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "images", maxCount: 5 },
  ]),
  async (req, res) => {
    const update = {
      title: req.body.title,
      subtitle: req.body.subtitle,
      content: req.body.content,
      published: req.body.published !== "false",
    };

    if (req.body.title) {
      update.slug = slugify(req.body.title, { lower: true, strict: true });
    }

    if (req.files?.coverImage)
      update.coverImage = req.files.coverImage[0].location;

    if (req.files?.images)
      update.images = req.files.images.map(f => f.location);

    const story = await Story.findByIdAndUpdate(req.params.id, update, { new: true });

    if (!story) return res.status(404).json({ message: "Story not found" });

    res.json({ success: true, story });
  }
);

// DELETE
router.delete("/:id", async (req, res) => {
  await Story.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
