const jwt = require("jsonwebtoken");

const adminAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided." });
    }

    const token   = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

const judgeAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided." });
    }

    const token   = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "judge") {
      return res.status(403).json({ message: "Judge access only." });
    }

    // Game controller reads req.judge.code
    req.judge = { code: decoded.code, name: decoded.name, id: decoded.id };
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = { adminAuth, judgeAuth };