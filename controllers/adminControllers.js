const jwt   = require("jsonwebtoken");
const Admin = require("../models/adminModels.js");

// POST /api/auth/admin/login 
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required." });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { role: "admin", id: admin._id, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Admin login successful.",
      token,
      user: {
        id:    admin._id,
        name:  admin.name,
        email: admin.email,
        role:  "admin",
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};