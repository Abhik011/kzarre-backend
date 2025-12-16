const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true, // manage_inventory
    required: true,
  },
  label: String, // Manage Inventory
  category: String, // inventory, users, orders
});

module.exports = mongoose.model("Permission", permissionSchema);
