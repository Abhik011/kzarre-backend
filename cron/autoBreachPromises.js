const cron = require("node-cron");
const CustomerPromise = require("../models/CRMPromise");

// 🔥 Runs every 1 hour
cron.schedule("*/30 * * * *", async () => {
  try {
    const now = new Date();

    const result = await CustomerPromise.updateMany(
      {
        status: "pending",
        dueDate: { $lt: now },   // overdue
      },
      {
        $set: {
          status: "breached",
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[CRON] Auto-breached ${result.modifiedCount} overdue promises`
      );
    }
  } catch (err) {
    console.error("[CRON] Auto breach failed:", err);
  }
});

module.exports = {};
