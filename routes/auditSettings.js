const AuditSettings = require("../models/AuditSettings");

/* ================= AUDIT SETTINGS ================= */

router.get(
  "/audit-settings",
  accessAuth,
  requirePermission("manage_security"),
  async (req, res) => {
    const settings = await AuditSettings.findOne().sort("-createdAt");
    res.json(settings || {});
  }
);

router.post(
  "/audit-settings",
  accessAuth,
  requirePermission("manage_security"),
  async (req, res) => {
    const settings = await AuditSettings.create({
      ...req.body,
      updatedBy: req.user.id,
    });

    res.json({ success: true, settings });
  }
);
