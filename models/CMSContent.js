const mongoose = require("mongoose");

const CMSContentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },

    displayTo: {
      type: String,
      enum: [
        "",
        "post",
        "home-landing-video",
        "men-page-video",
        "women-page-video",
        "accessories-video",
        "heritage-video",
        "home-banner",
        "about-page",
        "product-page",
        "bannerOne",
        "bannerTwo",
        "bannerToggle",
        "home-banner-carousel",
        "women-grid",
        "men-grid",
        "women-4grid",
        "men-4grid",
      ],
      default: "",
    },

    // ⭐ Banner Styling
    bannerStyle: {
      titleColor: { type: String, default: "" },
      titleSize: { type: String, default: "" },
      titleFont: { type: String, default: "" },

      descColor: { type: String, default: "" },
      descSize: { type: String, default: "" },
      descFont: { type: String, default: "" },

      alignment: { type: String, default: "left" },
    },

    media: {
      url: String,
      name: String,
      kind: String,
      displayTo: String,
    },

    mediaGroup: [
      {
        imageUrl: String,
        title: String,
        description: String,
        metaTag: String,
        metaDescription: String,
        keywords: String,
        order: Number,
      },
    ],

    heroVideoUrl: String,

    // ✅ SCHEDULING (NEW)
    visibleAt: {
      type: Date,
      default: null,
      index: true,
    },

    publishedNotified: {
  type: Boolean,
  default: false,
},

    timezone: {
      type: String,
      default: "America/New_York",
    },

    meta: {
      tag: String,
      description: String,
      keywords: String,
      visibleDate: String,
      visibleTime: String,
    },

    author: { type: String, default: "Admin" },

    status: {
      type: String,
      enum: ["Pending Review", "Approved", "Rejected", "Draft", "Scheduled"],
      default: "Pending Review",
    },

    rejectionReason: String,

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
