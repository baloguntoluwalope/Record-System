const express = require("express");
const router  = express.Router();
const Vote    = require("../models/voteModels.js");
const Game    = require("../models/gameModels.js");

// 1. POST /api/votes/:gameId — Parent submits a vote
router.post("/:gameId", async (req, res) => {
  try {
    const { house }  = req.body;
    const { gameId } = req.params;

    if (!house) return res.status(400).json({ message: "House is required." });

    const game = await Game.findOne({ gameId });
    if (!game) return res.status(404).json({ message: "Event not found." });
    
    // Check if admin has enabled voting for this specific game
    if (!game.votingEnabled) {
      return res.status(403).json({ message: "Voting is not currently open for this event." });
    }

    const validHouse = game.houseScores.some((h) => h.house === house);
    if (!validHouse) return res.status(400).json({ message: "Invalid house selection." });

    const vote = await Vote.create({ gameId, house });
    res.status(201).json({ message: "Vote recorded successfully!", vote });
  } catch (err) {
    res.status(500).json({ message: "Server error recording vote." });
  }
});

// 2. GET /api/votes/:gameId — Fetch vote counts for Admin Dashboard
router.get("/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;

    const votes = await Vote.aggregate([
      { $match: { gameId } },
      { $group: { _id: "$house", count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]);

    const total = votes.reduce((sum, v) => sum + v.count, 0);
    res.json({ gameId, votes, total });
  } catch (err) {
    res.status(500).json({ message: "Server error fetching votes." });
  }
});

// 3. POST /api/votes/:gameId/apply-bonus
router.post("/:gameId/apply-bonus", async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findOne({ gameId }); // Ensure this is the correct ID field
    if (!game) return res.status(404).json({ message: "Event not found." });
    
    if (game.bonusApplied) {
      return res.status(400).json({ message: "Bonus already applied." });
    }

    const votes = await Vote.aggregate([
      { $match: { gameId } },
      { $group: { _id: "$house", count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]);

    if (votes.length === 0) return res.status(400).json({ message: "No votes found." });

    const bonusTiers = [5, 3, 1];
    
    // Use a for...of loop to handle async properly if needed
    for (let i = 0; i < Math.min(votes.length, bonusTiers.length); i++) {
      const houseName = votes[i]._id;
      const pointsToAdd = bonusTiers[i];

      await Game.updateOne(
        { gameId, "houseScores.house": houseName },
        { 
          $inc: { "houseScores.$.points": pointsToAdd },
          // Optional: If you want to force it live immediately:
          $set: { published: true } 
        }
      );
    }

    // Mark the game as finalized
    await Game.updateOne({ gameId }, { $set: { bonusApplied: true, votingEnabled: false } });

    // 🚀 IMPORTANT: Fetch the FULL leaderboard data to broadcast, not just one game
    // This ensures the total points on the big screen update instantly
    const io = req.app.get("io");
    if (io) {
      // Broadcast to 'scoreUpdated' (matching your Leaderboard.jsx)
      io.emit("scoreUpdated", { message: "Refresh Leaderboard", gameId });
    }

    res.json({ message: "Tiered bonus points applied and results published!" });
  } catch (err) {
    console.error("Bonus Error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;