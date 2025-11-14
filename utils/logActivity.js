const Activity = require("../models/Activity");

async function logActivity({ userId, userName, role, action, ip, userAgent }) {
  try {
    await Activity.create({
      userId,
      userName,
      role,
      action,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error("Activity Log Error:", err);
  }
}

module.exports = { logActivity };
