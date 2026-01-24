// models/CmsPage.js
const mongoose = require("mongoose");

const SectionSchema = new mongoose.Schema({
  id: String,              // "hero", "main", "faq-list"
  type: String,            // "text", "list", "qa", "image"
  html: String,            // rich HTML
  meta: Object,           // optional structured data
});

const CmsPageSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },   // "faq", "about"
    title: { type: String, required: true },

    type: {
      type: String,
      required: true,
      enum: ["contact", "faq", "about", "policy", "generic"],
    },

    sections: [SectionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("CmsPage", CmsPageSchema);
