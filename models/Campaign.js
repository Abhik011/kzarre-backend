// models/Campaign.js
const mongoose = require("mongoose");

const CampaignSchema = new mongoose.Schema({
  subject: String,

  template: { type: mongoose.Schema.Types.ObjectId, ref: "EmailTemplate" },

  html: String,                 // final rendered html
  status: {
    type: String,
    enum: ["draft", "scheduled", "sent"],
    default: "draft",
  },

  scheduledAt: Date,
  sentAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
}, { timestamps: true });

module.exports = mongoose.model("Campaign", CampaignSchema);
