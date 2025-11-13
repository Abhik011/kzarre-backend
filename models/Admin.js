const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    token: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    loginAt: { type: Date, default: Date.now },
    logoutAt: { type: Date },
  },
  { _id: false }
);

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["superadmin", "admin", "user"],
      default: "admin",
    },
    group: {
      type: String,
      enum: [
        "none",
        "sales_manager",
        "inventory_manager",
        "hr_manager",
        "finance_manager",
      ],
      default: "none",
    },
    permissions: [{ type: String }],
    isActive: { type: Boolean, default: true },

    // 🟢 Single active session
    currentSession: sessionSchema,

    // 🧾 Logs for all login/logout activities
    activityLogs: [
      {
        action: String,
        ip: String,
        userAgent: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", AdminSchema);
