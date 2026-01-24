const mongoose = require("mongoose");

const AuditSettingsSchema = new mongoose.Schema(
  {
    wormLogs: Boolean,
    quarterlyAccessReview: Boolean,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditSettings", AuditSettingsSchema);
