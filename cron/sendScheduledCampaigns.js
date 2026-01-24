// cron/sendScheduledCampaigns.js
const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Subscriber = require("../models/Subscriber");
const sendEmail = require("../utils/sendEmail");

cron.schedule("* * * * *", async () => { // every minute
  const now = new Date();

  const due = await Campaign.find({
    status: "scheduled",
    scheduledAt: { $lte: now },
  });

  for (const campaign of due) {
    const subs = await Subscriber.find();

    for (const sub of subs) {
      await sendEmail(sub.email, campaign.subject, campaign.html);
    }

    campaign.status = "sent";
    campaign.sentAt = new Date();
    await campaign.save();
  }
});
