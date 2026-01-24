const mongoose = require("mongoose");

const ExportLogSchema = new mongoose.Schema(
  {
    exportedBy: String, // admin email
    exportedAt: Date,
    format: {
      type: String,
      enum: ["csv", "pdf"],
    },
    ipAddress: String,
  },
  { _id: false }
);

const DataRequestSchema = new mongoose.Schema(
  {
    customerEmail: String,
    requestType: {
      type: String,
      enum: ["export", "delete"],
    },
    requestedBy: String,

    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },

    // 🔥 NEW
    exportedAt: Date,
    exportLogs: [ExportLogSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("DataRequest", DataRequestSchema);
