const mongoose = require("mongoose");
const Admin    = require("./models/adminModels.js");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const exists = await Admin.findOne({ email: "admin@gmail.com" });
  if (exists) {
    console.log("Admin already exists");
    process.exit();
  }

  await Admin.create({
    name:     "Admin",
    email:    "admin@gmail.com",
    password: "1234",
  });

  console.log("✅ Admin created");
  console.log("   Email:    admin@gmail.com");
  console.log("   Password: 1234");
  process.exit();
}).catch(console.error);