const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userName: String,
    role: { type: String, enum: ["superadmin", "admin"], required: true },
    action: String,
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Activity", activitySchema);
