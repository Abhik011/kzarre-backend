const mongoose = require("mongoose");

const AboutPageSchema = new mongoose.Schema(
  {
    /* ===== HERO VIDEO ===== */
    heroVideo: {
      type: String, // "/v1.mp4" or S3 URL
      required: true,
    },

    /* ===== TEXT CONTENT ===== */
    quote: String,
    intro: String,
    mainText: String,

    /* ===== IMAGE GRID ===== */
    gridSectionOne: {
      text: String,
      images: [String], // array of image URLs
    },

    gridSectionTwo: {
      text: String,
      images: [String],
    },

    /* ===== FOOTER ===== */
    footerText: String,
    footerTitle: String,

    published: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AboutPage", AboutPageSchema);
