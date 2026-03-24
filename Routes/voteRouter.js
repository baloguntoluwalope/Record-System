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

// 3. POST /api/votes/:gameId/apply-bonus — Admin applies 5-3-1 tiered points
router.post("/:gameId/apply-bonus", async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findOne({ gameId });
    if (!game) return res.status(404).json({ message: "Event not found." });
    
    if (game.bonusApplied) {
      return res.status(400).json({ message: "Tiered bonuses have already been applied to this event." });
    }

    // Get current rankings
    const votes = await Vote.aggregate([
      { $match: { gameId } },
      { $group: { _id: "$house", count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]);

    if (votes.length === 0) {
      return res.status(400).json({ message: "No votes found. Cannot apply bonuses." });
    }

    const bonusTiers = [5, 3, 1];
    const updatePromises = [];
    const breakdown = [];

    // Map through top 3 houses and prepare updates
    for (let i = 0; i < Math.min(votes.length, bonusTiers.length); i++) {
      const houseName = votes[i]._id;
      const pointsToAdd = bonusTiers[i];
      const rank = ["1st", "2nd", "3rd"][i];

      updatePromises.push(
        Game.updateOne(
          { gameId, "houseScores.house": houseName },
          { $inc: { "houseScores.$.points": pointsToAdd } }
        )
      );

      breakdown.push({ rank, house: houseName, points: pointsToAdd });
    }

    // Mark as applied and store the winner
    updatePromises.push(
      Game.updateOne(
        { gameId },
        { $set: { bonusApplied: true, bonusHouse: votes[0]._id } }
      )
    );

    // Execute all updates in parallel
    await Promise.all(updatePromises);

    // Broadcast updated scores to everyone via Socket.io
    const updatedGame = await Game.findOne({ gameId });
    req.app.get("io")?.emit("scoreUpdate", updatedGame);

    res.json({
      message: "Tiered bonus points applied!",
      breakdown: breakdown.map(b => `${b.rank}: ${b.house} (+${b.points}pts)`),
      winner: votes[0]._id
    });
  } catch (err) {
    console.error("Bonus Error:", err);
    res.status(500).json({ message: "Server error applying bonus points." });
  }
});

module.exports = router;