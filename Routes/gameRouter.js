const express = require("express");
const router  = express.Router();
const {
  createGame,
  updateGame,
  deleteGame,
  getAllGames,
  getGamesByGameId,
  publishGame,
  unpublishGame,
  submitResult,
  submitMultipleScores,
  submitSingleScore,
  submitResultByCategoryAndGender,
  getGamesByCategoryAndGender,
  getPublicGame,
  getLeaderboard,
  resetLeaderboard,
} = require("../controllers/gameControllers.js");
const { adminAuth, judgeAuth } = require("../middlewares/auth.js");
const { scoreLimiter }         = require("../middlewares/rateLimiter.js");

// Public
router.get("/leaderboard",              getLeaderboard);
router.get("/public/:token",            getPublicGame);
router.get("/",                         getAllGames);

// Judge
router.post("/scores/single",           judgeAuth, scoreLimiter, submitSingleScore);
router.post("/scores/multiple",         judgeAuth, scoreLimiter, submitMultipleScores);

// Admin
router.post("/",                        adminAuth, createGame);
router.delete("/leaderboard/reset",     adminAuth, resetLeaderboard);
router.post("/publish/:gameId",         adminAuth, publishGame);
router.post("/unpublish/:gameId",       adminAuth, unpublishGame);
router.put("/update/:gameId",           adminAuth, updateGame);
router.delete("/delete/:gameId",        adminAuth, deleteGame);

// Judge — parameterized (keep at bottom to avoid route conflicts)
router.post("/:gameId/result",          judgeAuth, scoreLimiter, submitResult);
router.post("/:category/:gender/score", judgeAuth, scoreLimiter, submitResultByCategoryAndGender);
router.get("/:category/:gender",        getGamesByCategoryAndGender);
router.get("/:gameId",                  getGamesByGameId);

module.exports = router;