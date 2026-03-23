const rateLimit = require("express-rate-limit");

exports.scoreLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      10,
  message:  { message: "Too many requests. Please slow down." },
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      10,
  message:  { message: "Too many login attempts. Try again later." },
});