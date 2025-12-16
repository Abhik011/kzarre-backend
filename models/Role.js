const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true, // inventory_manager
    required: true,
  },
  permissions: [{
    type: String, // permission.key
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AdminUser",
  },
});

module.exports = mongoose.model("Role", roleSchema);
