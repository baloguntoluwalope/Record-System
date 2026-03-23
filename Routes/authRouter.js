const express = require("express");
const router  = express.Router();
const {
  judgeLogin,
  createJudge,
  getAllJudges,
  deleteJudge,
  getJudgeSubmissions,
} = require("../controllers/judgeControllers.js");
const { adminLogin } = require("../controllers/adminControllers.js");
const { adminAuth }   = require("../middlewares/auth.js");
const { authLimiter } = require("../middlewares/rateLimiter.js");

// Admin 
router.post("/admin/login",               authLimiter, adminLogin);

// Judge
router.post("/judge/login",               authLimiter, judgeLogin);
router.post("/judges",                    adminAuth,   createJudge);
router.get ("/judges",                    adminAuth,   getAllJudges);
router.delete("/judges/:id",              adminAuth,   deleteJudge);
router.get ("/:code/submissions",         adminAuth,   getJudgeSubmissions);

module.exports = router;