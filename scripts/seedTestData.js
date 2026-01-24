const mongoose = require("mongoose");
require("dotenv").config();

const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Traffic = require("../models/Traffic");

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ecomdb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");

    try {
      // Clear existing test data
      await Customer.deleteMany({ email: /test\d+@/ });
      await Order.deleteMany({ orderId: /TEST-/ });
      await Traffic.deleteMany({ ip: "127.0.0.1" });

      console.log("🧹 Cleared existing test data");

      // Create test customers
      const customers = [];
      for (let i = 1; i <= 50; i++) {
        const daysAgo = Math.floor(Math.random() * 60); // Random date within last 60 days
        customers.push({
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
          phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        });
      }
      await Customer.insertMany(customers);
      console.log(`✅ Created ${customers.length} test customers`);

      // Create test orders
      const orders = [];
      const statuses = ['paid', 'pending', 'cancelled', 'refunded'];
      for (let i = 1; i <= 100; i++) {
        const customer = customers[Math.floor(Math.random() * customers.length)];
        const daysAgo = Math.floor(Math.random() * 30); // Last 30 days
        const amount = Math.floor(Math.random() * 500) + 50; // $50-$550
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        orders.push({
          orderId: `TEST-${i.toString().padStart(3, '0')}`,
          customerId: customer._id,
          customerName: customer.name,
          email: customer.email,
          amount: amount,
          status: status,
          paymentStatus: status === 'paid' ? 'paid' : status === 'refunded' ? 'refunded' : 'pending',
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          items: [{
            product: `Test Product ${Math.floor(Math.random() * 10) + 1}`,
            qty: Math.floor(Math.random() * 3) + 1,
            price: amount / (Math.floor(Math.random() * 3) + 1),
          }],
        });
      }
      await Order.insertMany(orders);
      console.log(`✅ Created ${orders.length} test orders`);

      // Create test traffic data
      const traffic = [];
      for (let i = 1; i <= 200; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        traffic.push({
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Test Browser)",
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000),
          country: ["US", "IN", "GB", "CA", "AU"][Math.floor(Math.random() * 5)],
          deviceType: ["desktop", "mobile", "tablet"][Math.floor(Math.random() * 3)],
        });
      }
      await Traffic.insertMany(traffic);
      console.log(`✅ Created ${traffic.length} test traffic records`);

      // Summary
      const totalCustomers = await Customer.countDocuments();
      const totalOrders = await Order.countDocuments({ status: 'paid' });
      const totalRevenue = await Order.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      console.log("\n📊 Test Data Summary:");
      console.log(`   👥 Total Customers: ${totalCustomers}`);
      console.log(`   📦 Total Orders: ${totalOrders}`);
      console.log(`   💰 Total Revenue: $${totalRevenue[0]?.total || 0}`);
      console.log(`   🌐 Traffic Records: ${traffic.length}`);

      console.log("\n🎉 Test data seeded successfully!");
      console.log("Your dashboard should now show meaningful analytics data.");

    } catch (error) {
      console.error("❌ Error seeding test data:", error);
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });