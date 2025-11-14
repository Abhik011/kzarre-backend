const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema(
  {
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Traffic", trafficSchema);
