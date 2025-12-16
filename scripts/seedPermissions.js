const mongoose = require("mongoose");
require("dotenv").config();

const Permission = require("../models/Permission");

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    const permissions = [
      // ===== DASHBOARD =====
      { key: "view_dashboard", label: "View Dashboard" },

      // ===== USER MANAGEMENT =====
      { key: "manage_users", label: "Manage Users" },
      { key: "create_user", label: "Create User" },
      { key: "update_user", label: "Update User" },
      { key: "delete_user", label: "Delete User" },

      // ===== CMS =====
      { key: "manage_cms", label: "Manage CMS" },

      // ===== ANALYTICS =====
      { key: "view_analytics", label: "View Analytics" },

      // ===== E-COMMERCE =====
      { key: "manage_orders", label: "Manage Orders" },
      { key: "manage_inventory", label: "Manage Inventory" },

      // ===== STORIES =====
      { key: "manage_stories", label: "Manage Stories" },

      // ===== SHIPPING / S&L =====
      { key: "manage_shipping", label: "Manage Shipping & Logistics" },

      // ===== CRM / 360 =====
      { key: "view_crm", label: "View CRM (360)" },

      // ===== MARKETING =====
      { key: "manage_marketing", label: "Manage Marketing" },

      // ===== FINANCE =====
      { key: "view_finance", label: "View Payments & Finance" },

      // ===== SECURITY =====
      { key: "manage_security", label: "Manage Security & Compliance" },

      // ===== SETTINGS =====
      { key: "manage_settings", label: "Manage Website Settings" },
    ];

    // 🔥 RESET & SEED
    await Permission.deleteMany({});
    await Permission.insertMany(permissions);

    console.log("✅ Permissions seeded successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });
