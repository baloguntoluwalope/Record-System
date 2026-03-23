require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/adminModels.js"); // Adjust path if needed

const seedAdmin = async () => {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB...");

    // 2. Check if admin already exists
    const adminExists = await Admin.findOne({ email: "admin@example.com" });
    if (adminExists) {
      console.log("Admin already exists! Skipping seed.");
      process.exit();
    }

    // 3. Create new admin
    const newAdmin = new Admin({
      name: "Super Admin",
      email: "admin@gmail.com",
      password: "123", // The schema hook will hash this automatically
      role: "admin"
    });

    await newAdmin.save();
    console.log("✅ Admin user created successfully!");
    
    // 4. Close connection
    process.exit();
  } catch (error) {
    console.error("❌ Error seeding admin:", error.message);
    process.exit(1);
  }
};

seedAdmin();