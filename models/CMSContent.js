const mongoose = require("mongoose");

const CMSContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    displayTo: {
      type: String,
      enum: [
        "",
        "home-landing-video",
        "home-banner",
        "post",
        "about-page",
        "product-page",
      ],
      default: "",
    },

    // Media info (image/video)
    media: {
      url: { type: String },
      name: { type: String },
      kind: { type: String }, // image / video
      displayTo: { type: String },
    },

    // SEO + visibility
    meta: {
      tag: { type: String },
      description: { type: String },
      keywords: { type: String },
      visibleDate: { type: String },
      visibleTime: { type: String },
    },

    author: {
      type: String,
      default: "Admin",
    },

    status: {
      type: String,
      enum: ["Pending Review", "Approved", "Rejected", "Draft"],
      default: "Pending Review",
    },

    rejectionReason: String,

    heroVideoUrl: String,
    banners: [
      {
        imageUrl: String,
        order: Number,
      },
    ],
    stories: Array,
  },
  { timestamps: true }
);

module.exports = mongoose.model("CMSContent", CMSContentSchema);
