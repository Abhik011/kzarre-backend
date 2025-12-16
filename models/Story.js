// models/Story.js
const mongoose = require("mongoose");

const StorySchema = new mongoose.Schema(
  {
    title: String,
    subtitle: String,
    content: String,

    coverImage: String,      // hero image
    images: [String],        // 👈 multiple images inside article

    published: Boolean,
    slug: { type: String, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", StorySchema);
