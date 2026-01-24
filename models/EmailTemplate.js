// models/EmailTemplate.js
const mongoose = require("mongoose");

const EmailTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },        // "Diwali Offer Template"
  subject: { type: String, required: true },

  // Editor blocks (structured)
  blocks: [
    {
      type: { type: String, enum: ["text", "image", "button"], required: true },
      html: String,              // pre-rendered html for this block
      data: mongoose.Schema.Types.Mixed, // editor state (optional)
    },
  ],

  // Final compiled HTML (cached)
  html: { type: String, required: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
}, { timestamps: true });

module.exports = mongoose.model("emailtemplates", EmailTemplateSchema);
