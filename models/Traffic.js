const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema(
  {
    visitorId: { type: String, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    url: String,

    ip: String,
    userAgent: String,

    country: { type: String, default: "UN" }, // ISO Code
    region: { type: String, default: "Unknown" },
    city: { type: String, default: "Unknown" },

    isFirstTime: Boolean,
    deviceType: String,
    os: String,
    browser: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Traffic", trafficSchema);
