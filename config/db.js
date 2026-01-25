const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      console.error("❌ MONGO_URI not set in environment");
      process.exit(1);
    }

    // 🔥 Disable mongoose buffering (important)
    mongoose.set("bufferCommands", false);

    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,  // fail fast if Mongo unreachable
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB connected");

  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);

    // 🔥 ALWAYS EXIT if DB not connected
    process.exit(1);
  }
};

module.exports = connectDB;
