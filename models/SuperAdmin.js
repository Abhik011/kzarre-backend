const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    token: { type: String },
    ip: { type: String },
    loginAt: { type: Date, default: Date.now },
    logoutAt: { type: Date },
    userAgent: { type: String },
  },
  { _id: false }
);

const SuperAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    otp: { type: String },
    otpExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // 🟢 Only one active session allowed
    currentSession: sessionSchema,

    // 🧾 Activity history (for security/audit)
    activityLogs: [
      {
        action: { type: String },
        ip: { type: String },
        userAgent: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("SuperAdmin", SuperAdminSchema);
