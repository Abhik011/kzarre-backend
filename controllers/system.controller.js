const SystemConfig = require("../models/SystemConfig");

/* =============================
   GET SYSTEM CONFIG
============================= */
exports.getConfig = async (req, res) => {
  try {
    let config = await SystemConfig.findOne();

    if (!config) {
      config = await SystemConfig.create({
        general: {},
        maintenance: {},
      });
    }

    res.json({ success: true, config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============================
   SAVE GENERAL SETTINGS
============================= */
exports.saveGeneral = async (req, res) => {
  try {
    const { general } = req.body;

    const config = await SystemConfig.findOneAndUpdate(
      {},
      { $set: { general } },
      { new: true, upsert: true }
    );

    res.json({ success: true, config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* =============================
   SAVE MAINTENANCE SETTINGS
============================= */
exports.saveMaintenance = async (req, res) => {
  try {
    const { maintenance } = req.body;

    const config = await SystemConfig.findOneAndUpdate(
      {},
      { $set: { maintenance } },
      { new: true, upsert: true }
    );

    res.json({ success: true, config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* =============================
   RUN SYSTEM ACTION
============================= */
exports.runAction = async (req, res) => {
  try {
    const { action } = req.body;

    // 🔥 Stub actions (expand later)
    switch (action) {
      case "clearCache":
        break;
      case "rebuildIndex":
        break;
      case "forceLogoutAll":
        break;
      default:
        return res.status(400).json({ success: false, message: "Invalid action" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};
