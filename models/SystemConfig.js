const mongoose = require("mongoose");

const SystemConfigSchema = new mongoose.Schema(
  {
    general: {
      siteTitle: String,
      timeZone: String,
      primaryColor: String,
      secondaryColor: String,
      fonts: [
        {
          name: String,
          fileUrl: String,
        },
      ],
    },

    maintenance: {
      autoBackup: Boolean,
      developerAccess: Boolean,
      maintenanceMode: Boolean,
      maintenanceMessage: String,
      maintenanceEta: String,
      clearCache: Boolean,
      rebuildIndex: Boolean,
      forceLogoutAll: Boolean,
      readOnlyMode: Boolean,
      adminIpWhitelist: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemConfig", SystemConfigSchema);
