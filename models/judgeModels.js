const mongoose = require("mongoose");
const crypto   = require("crypto");
const bcrypt   = require("bcryptjs");

const judgeSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    code: {
      type:    String,
      unique:  true,
      default: () => `JUDGE-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

judgeSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

judgeSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("Judge", judgeSchema);