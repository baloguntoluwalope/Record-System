const crypto         = require("crypto");
const { randomUUID } = require("crypto");
const mongoose       = require("mongoose");
const Game           = require("../models/gameModels.js");

const HOUSES     = ["Blue", "Yellow", "Green"];
const CATEGORIES = ["KG", "Nursery", "Primary", "JSS", "SSS", "General"];
const GENDERS    = ["Boys", "Girls", "Mixed"];
const POINTS     = { gold: 5, silver: 3, bronze: 1 };

const validatePlacements = (gold, silver, bronze) => {
  if (!gold || !silver || !bronze) return "gold, silver, and bronze are required.";
  if (gold === silver || silver === bronze || gold === bronze)
    return "gold, silver, and bronze must be different houses.";
  return null;
};

const hasJudgeSubmitted = (game, judgeCode) =>
  game.houseScores.some((hs) => hs.judges.includes(judgeCode));

const applyPlacements = (game, placements, judgeCode) => {
  for (const [medal, house] of Object.entries(placements)) {
    const houseScore = game.houseScores.find((hs) => hs.house === house);
    if (!houseScore) {
      return `House "${house}" not found. Available: ${game.houses.join(", ")}`;
    }
    houseScore.points += POINTS[medal];
    houseScore.judges.push(judgeCode);
  }
  return null;
};

const recalculateMedals = (game) => {
  // Reset all medals first
  game.houseScores.forEach((hs) => {
    hs.medals.gold   = 0;
    hs.medals.silver = 0;
    hs.medals.bronze = 0;
  });

  // Sort by points descending and assign medals by rank
  const sorted = [...game.houseScores].sort((a, b) => b.points - a.points);
  const medals = ["gold", "silver", "bronze"];
  sorted.forEach((hs, i) => {
    if (medals[i]) {
      const houseScore = game.houseScores.find((h) => h.house === hs.house);
      houseScore.medals[medals[i]] = 1;
    }
  });
};

// ADMIN: Create game(s)
exports.createGame = async (req, res) => {
  try {
    const { name, categories, genders, houses } = req.body;

    if (!name || !categories || !genders) {
      return res.status(400).json({ message: "name, categories, and genders are required." });
    }

    const categoryList = Array.isArray(categories) ? categories : [categories];
    const genderList   = Array.isArray(genders)    ? genders    : [genders];

    const invalidCategories = categoryList.filter((c) => !CATEGORIES.includes(c));
    const invalidGenders    = genderList.filter((g)   => !GENDERS.includes(g));

    if (invalidCategories.length) {
      return res.status(400).json({
        message: `Invalid categories: ${invalidCategories.join(", ")}. Must be from: ${CATEGORIES.join(", ")}`,
      });
    }
    if (invalidGenders.length) {
      return res.status(400).json({
        message: `Invalid genders: ${invalidGenders.join(", ")}. Must be from: ${GENDERS.join(", ")}`,
      });
    }

    const gameHouses = Array.isArray(houses) && houses.length >= 2 ? houses : HOUSES;
    const created    = [];
    const skipped    = [];

    const existingGame = await Game.findOne({ name });
    const gameId = existingGame?.gameId ?? randomUUID();

    for (const category of categoryList) {
      for (const gender of genderList) {
        const existing = await Game.findOne({ name, category, gender });
        if (existing) { skipped.push(`${category} - ${gender}`); continue; }

        await Game.create({
          name,
          category,
          gender,
          gameId,
          houses: gameHouses,
          houseScores: gameHouses.map((h) => ({
            house:  h,
            points: 0,
            medals: { gold: 0, silver: 0, bronze: 0 },
            judges: [],
          })),
        });

        created.push(`${category} - ${gender}`);
      }
    }

    return res.status(201).json({
      message: `✅ ${created.length} game(s) created.`,
      gameId,
      created,
      skipped: skipped.length ? skipped : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ADMIN: Update game
exports.updateGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { name, category, gender } = req.body;

    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (gender && !GENDERS.includes(gender)) {
      return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
    }

    const update = {
      ...(name     && { name }),
      ...(category && { category }),
      ...(gender   && { gender }),
    };

    const result = await Game.updateMany({ gameId }, update);
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
    }

    const updated = await Game.find({ gameId });

    return res.json({
      message: `✅ ${result.modifiedCount} game(s) updated.`,
      gameId,
      games: updated.map((g) => `${g.category} - ${g.gender}`),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ADMIN: Delete game
exports.deleteGame = async (req, res) => {
  try {
    const { gameId } = req.params;

    const result = await Game.deleteMany({ gameId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
    }

    return res.json({
      message: `✅ ${result.deletedCount} game(s) deleted.`,
      gameId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ADMIN: Publish game
exports.publishGame = async (req, res) => {
  try {
    const { gameId } = req.params;

    const games = await Game.find({ gameId });
    if (!games.length) {
      return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
    }

    const alreadyPublished = games.every((g) => g.published);
    if (alreadyPublished) {
      return res.json({
        message:    "Game is already published.",
        gameId,
        gameName:   games[0].name,
        publicLink: `/public/${games[0].publicLink}`,
        published:  games.map((g) => `${g.category} - ${g.gender}`),
      });
    }

    const token = crypto.randomBytes(8).toString("hex");

    await Game.updateMany({ gameId }, { published: true, publicLink: token });

    return res.json({
      message:    `✅ ${games.length} game(s) published.`,
      gameId,
      gameName:   games[0].name,
      publicLink: `/public/${token}`,
      published:  games.map((g) => `${g.category} - ${g.gender}`),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ADMIN: Unpublish game
exports.unpublishGame = async (req, res) => {
  try {
    const { gameId } = req.params;

    const result = await Game.updateMany(
      { gameId },
      { published: false, publicLink: null }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
    }

    return res.json({
      message: `✅ ${result.modifiedCount} game(s) unpublished.`,
      gameId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ADMIN: Reset leaderboard
exports.resetLeaderboard = async (req, res) => {
  try {
    await Game.updateMany({}, {
      $set: {
        "houseScores.$[].points":        0,
        "houseScores.$[].medals.gold":   0,
        "houseScores.$[].medals.silver": 0,
        "houseScores.$[].medals.bronze": 0,
        "houseScores.$[].judges":        [],
      },
    });

    req.app.get("io").emit("scoreUpdated", { message: "Leaderboard reset." });

    return res.json({ message: "✅ Leaderboard reset successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUBLIC: Get all games
exports.getAllGames = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 6;
    const skip   = (page - 1) * limit;
    const search = req.query.search || "";

    // ✅ Build filter — search by name, optionally filter by category/gender
    const filter = {};
    if (search)            filter.name     = { $regex: search, $options: "i" };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.gender)   filter.gender   = req.query.gender;

    const games = await Game.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Game.countDocuments(filter);

    res.json({
      games,
      totalGames:  total,
      currentPage: page,
      totalPages:  Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// PUBLIC: Get game by gameId
exports.getGamesByGameId = async (req, res) => {
  try {
    const { gameId } = req.params;

    if (!gameId) {
      return res.status(400).json({ message: "gameId parameter is required" });
    }

    // Use .trim() to ensure no hidden spaces are breaking the search
    const game = await Game.findOne({ gameId: gameId.trim() }).lean();

    if (!game) {
      console.log(`[404] No game found for ID: ${gameId}`);
      return res.status(404).json({ message: `Game with id "${gameId}" not found.` });
    }

    // DEBUG LOG: Check your terminal/server console! 
    // This tells you exactly what is coming OUT of the database.
    console.log(`Fetched Game: ${game.name} | Scores:`, JSON.stringify(game.houseScores));

    return res.json({
      gameId:    game.gameId,
      name:      game.name,
      category:  game.category,
      gender:    game.gender,
      published: game.published,
      houseScores: game.houseScores.map(({ house, points, medals }) => ({
        house,
        points: Number(points), // Ensure it's treated as a number
        medals: medals || [],
      })),
    });
  } catch (error) {
    console.error("Controller Error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

// PUBLIC: Get games by category + gender
exports.getGamesByCategoryAndGender = async (req, res) => {
  try {
    const { category, gender } = req.params;

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (!GENDERS.includes(gender)) {
      return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
    }

    const games = await Game.find({ category, gender }).sort({ name: 1 });
    if (!games.length) {
      return res.status(404).json({ message: `No games found for ${category} - ${gender}.` });
    }

    return res.json({
      category,
      gender,
      total: games.length,
      games: games.map((g) => ({
        gameId:      g.gameId,
        name:        g.name,
        houseScores: g.houseScores.map(({ house, points, medals }) => ({ house, points, medals })),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUBLIC: Audience view via token
exports.getPublicGame = async (req, res) => {
  try {
    const { token } = req.params;

    const games = await Game.find({ publicLink: token, published: true });
    if (!games.length) {
      return res.status(404).json({ message: "Game not found or not published." });
    }

    return res.json({
      gameId:   games[0].gameId,
      gameName: games[0].name,
      total:    games.length,
      games:    games.map((g) => ({
        category:    g.category,
        gender:      g.gender,
        houseScores: g.houseScores.map(({ house, points, medals }) => ({ house, points, medals })),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUBLIC: Leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    // ✅ Only published games appear on the leaderboard
    const games  = await Game.find({ published: true });
    const totals = {};

    HOUSES.forEach((h) => {
      totals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 };
    });

    for (const game of games) {
      for (const hs of game.houseScores) {
        if (!totals[hs.house]) {
          totals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
        }
        totals[hs.house].points += hs.points;
        totals[hs.house].gold   += hs.medals.gold;
        totals[hs.house].silver += hs.medals.silver;
        totals[hs.house].bronze += hs.medals.bronze;
      }
    }

    // Overall leaderboard
    const sorted = Object.entries(totals).sort((a, b) => b[1].points - a[1].points);
    let rank = 1;
    const overallLeaderboard = sorted.map(([house, data], i) => {
      if (i > 0 && data.points < sorted[i - 1][1].points) rank = i + 1;
      return {
        rank,
        house,
        points:      data.points,
        totalPoints: data.points,
        medals: {
          gold:   data.gold,
          silver: data.silver,
          bronze: data.bronze,
        },
      };
    });

    // Medal table
    const medalTable = Object.fromEntries(
      Object.entries(totals).map(([house, data]) => [
        house,
        {
          points:      data.points,
          totalPoints: data.points,
          gold:        data.gold,
          silver:      data.silver,
          bronze:      data.bronze,
        },
      ])
    );

    // Category leaderboard
    const categoryLeaderboard = {};
    for (const category of CATEGORIES) {
      const catTotals = {};
      HOUSES.forEach((h) => { catTotals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 }; });

      for (const game of games.filter((g) => g.category === category)) {
        for (const hs of game.houseScores) {
          if (!catTotals[hs.house]) {
            catTotals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
          }
          catTotals[hs.house].points += hs.points;
          catTotals[hs.house].gold   += hs.medals.gold;
          catTotals[hs.house].silver += hs.medals.silver;
          catTotals[hs.house].bronze += hs.medals.bronze;
        }
      }

      const catSorted = Object.entries(catTotals).sort((a, b) => b[1].points - a[1].points);
      let catRank = 1;
      categoryLeaderboard[category] = catSorted.map(([house, data], i) => {
        if (i > 0 && data.points < catSorted[i - 1][1].points) catRank = i + 1;
        return {
          rank:        catRank,
          house,
          points:      data.points,
          totalPoints: data.points,
          medals: {
            gold:   data.gold,
            silver: data.silver,
            bronze: data.bronze,
          },
        };
      });
    }

    // Gender leaderboard
    const genderLeaderboard = {};
    for (const gender of GENDERS) {
      const genTotals = {};
      HOUSES.forEach((h) => { genTotals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 }; });

      for (const game of games.filter((g) => g.gender === gender)) {
        for (const hs of game.houseScores) {
          if (!genTotals[hs.house]) {
            genTotals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
          }
          genTotals[hs.house].points += hs.points;
          genTotals[hs.house].gold   += hs.medals.gold;
          genTotals[hs.house].silver += hs.medals.silver;
          genTotals[hs.house].bronze += hs.medals.bronze;
        }
      }

      const genSorted = Object.entries(genTotals).sort((a, b) => b[1].points - a[1].points);
      let genRank = 1;
      genderLeaderboard[gender] = genSorted.map(([house, data], i) => {
        if (i > 0 && data.points < genSorted[i - 1][1].points) genRank = i + 1;
        return {
          rank:        genRank,
          house,
          points:      data.points,
          totalPoints: data.points,
          medals: {
            gold:   data.gold,
            silver: data.silver,
            bronze: data.bronze,
          },
        };
      });
    }

    const houseTotals = Object.entries(totals)
      .sort((a, b) => b[1].points - a[1].points)
      .map(([house, data], i) => ({
        rank:        i + 1,
        house,
        points:      data.points,
        totalPoints: data.points,
        gold:        data.gold,
        silver:      data.silver,
        bronze:      data.bronze,
      }));

    return res.json({
      houseTotals,
      overallLeaderboard,
      categoryLeaderboard,
      genderLeaderboard,
      medalTable,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// JUDGE: Submit result by gameId + category + gender
exports.submitResult = async (req, res) => {
  try {
    const { gameId }                                 = req.params;
    const { category, gender, gold, silver, bronze } = req.body;
    const judgeCode                                  = req.judge.code;

    if (!category || !gender) {
      return res.status(400).json({ message: "category and gender are required in the body." });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (!GENDERS.includes(gender)) {
      return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
    }

    const placementError = validatePlacements(gold, silver, bronze);
    if (placementError) return res.status(400).json({ message: placementError });

    const game = await Game.findOne({ gameId, category, gender });
    if (!game) {
      return res.status(404).json({ message: `Game not found for gameId "${gameId}" under ${category} - ${gender}.` });
    }

    if (hasJudgeSubmitted(game, judgeCode)) {
      return res.status(409).json({ message: "You have already submitted results for this game." });
    }

    const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
    if (err) return res.status(400).json({ message: err });

    recalculateMedals(game); // ✅ auto-rank medals by points
    game.markModified("houseScores");
    await game.save();
    req.app.get("io").emit("scoreUpdated", game);

    return res.json({ message: "✅ Result submitted successfully.", game });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// JUDGE: Submit by category + gender params
exports.submitResultByCategoryAndGender = async (req, res) => {
  try {
    const { category, gender }               = req.params;
    const { gameName, gold, silver, bronze } = req.body;
    const judgeCode                          = req.judge.code;

    if (!gameName) return res.status(400).json({ message: "gameName is required." });

    const placementError = validatePlacements(gold, silver, bronze);
    if (placementError) return res.status(400).json({ message: placementError });

    const game = await Game.findOne({ name: gameName, category, gender });
    if (!game) {
      return res.status(404).json({
        message: `Game "${gameName}" not found under ${category} - ${gender}.`,
      });
    }

    if (hasJudgeSubmitted(game, judgeCode)) {
      return res.status(409).json({ message: "You have already submitted results for this game." });
    }

    const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
    if (err) return res.status(400).json({ message: err });

    recalculateMedals(game); // ✅ auto-rank medals by points
    game.markModified("houseScores");
    await game.save();
    req.app.get("io").emit("scoreUpdated", game);

    return res.json({
      message: `✅ Score submitted for "${gameName}" (${category} - ${gender}).`,
      game,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// JUDGE: Submit single score
exports.submitSingleScore = async (req, res) => {
  try {
    const { gameName, category, gender, gold, silver, bronze } = req.body;
    const judgeCode = req.judge.code;

    if (!gameName || !category || !gender) {
      return res.status(400).json({ message: "gameName, category, and gender are required." });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (!GENDERS.includes(gender)) {
      return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
    }

    const placementError = validatePlacements(gold, silver, bronze);
    if (placementError) return res.status(400).json({ message: placementError });

    const game = await Game.findOne({ name: gameName, category, gender });
    if (!game) {
      return res.status(404).json({
        message: `Game "${gameName}" not found under ${category} - ${gender}.`,
      });
    }

    if (hasJudgeSubmitted(game, judgeCode)) {
      return res.status(409).json({ message: "You have already submitted results for this game." });
    }

    const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
    if (err) return res.status(400).json({ message: err });

    recalculateMedals(game); // ✅ auto-rank medals by points
    game.markModified("houseScores");
    await game.save();
    req.app.get("io").emit("scoreUpdated", game);

    return res.json({
      message: `✅ Score submitted for "${gameName}" (${category} - ${gender}).`,
      game,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// JUDGE: Submit multiple scores
exports.submitMultipleScores = async (req, res) => {
  try {
    const { gameName, scores } = req.body;
    const judgeCode = req.judge.code;

    if (!gameName) return res.status(400).json({ message: "gameName is required." });
    if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ message: "scores must be a non-empty array." });
    }

    const submitted = [];
    const skipped   = [];
    const errors    = [];

    for (const entry of scores) {
      const { category, gender, gold, silver, bronze } = entry;

      if (!category || !gender) {
        errors.push({ entry, reason: "category and gender are required." });
        continue;
      }
      if (!CATEGORIES.includes(category)) {
        errors.push({ entry, reason: `Invalid category "${category}".` });
        continue;
      }
      if (!GENDERS.includes(gender)) {
        errors.push({ entry, reason: `Invalid gender "${gender}".` });
        continue;
      }

      const placementError = validatePlacements(gold, silver, bronze);
      if (placementError) { errors.push({ entry, reason: placementError }); continue; }

      const game = await Game.findOne({ name: gameName, category, gender });
      if (!game) {
        errors.push({ entry, reason: `Game "${gameName}" not found under ${category} - ${gender}.` });
        continue;
      }

      if (hasJudgeSubmitted(game, judgeCode)) {
        skipped.push(`${category} - ${gender} (already submitted)`);
        continue;
      }

      const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
      if (err) { errors.push({ entry, reason: err }); continue; }

      recalculateMedals(game); // ✅ auto-rank medals by points
      game.markModified("houseScores");
      await game.save();
      req.app.get("io").emit("scoreUpdated", game);
      submitted.push(`${category} - ${gender}`);
    }

    return res.json({
      message:  `✅ ${submitted.length} score(s) submitted.`,
      submitted,
      skipped:  skipped.length ? skipped : undefined,
      errors:   errors.length  ? errors  : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.toggleGameVoting = async (req, res) => {
  try {
    const { gameId } = req.params; // Must match :gameId in the route
    const { enabled } = req.body;

    const updatedGame = await Game.findOneAndUpdate(
      { gameId: gameId }, // Searching your custom UUID field
      { $set: { votingEnabled: enabled } },
      { new: true }
    );

    if (!updatedGame) {
      return res.status(404).json({ message: "Game not found." });
    }

    res.json({ votingEnabled: updatedGame.votingEnabled });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// const crypto   = require("crypto");
// const { randomUUID } = require("crypto");
// const mongoose = require("mongoose");
// const Game     = require("../models/gameModels.js");

// const HOUSES     = ["Blue", "Yellow", "Green"];
// const CATEGORIES = ["KG", "Nursery", "Primary", "JSS", "SSS", "General"];
// const GENDERS    = ["Boys", "Girls", "Mixed"];
// const POINTS     = { gold: 5, silver: 3, bronze: 1 };

// const validatePlacements = (gold, silver, bronze) => {
//   if (!gold || !silver || !bronze) return "gold, silver, and bronze are required.";
//   if (gold === silver || silver === bronze || gold === bronze)
//     return "gold, silver, and bronze must be different houses.";
//   return null;
// };

// const hasJudgeSubmitted = (game, judgeCode) =>
//   game.houseScores.some((hs) => hs.judges.includes(judgeCode));

// const applyPlacements = (game, placements, judgeCode) => {
//   for (const [medal, house] of Object.entries(placements)) {
//     const houseScore = game.houseScores.find((hs) => hs.house === house);
//     if (!houseScore) {
//       return `House "${house}" not found. Available: ${game.houses.join(", ")}`;
//     }
//     houseScore.points        += POINTS[medal];
//     houseScore.medals[medal] += 1;
//     houseScore.judges.push(judgeCode);
//   }
//   return null;
// };

// // ADMIN: Create game(s) 
// exports.createGame = async (req, res) => {
//   try {
//     const { name, categories, genders, houses } = req.body;

//     if (!name || !categories || !genders) {
//       return res.status(400).json({ message: "name, categories, and genders are required." });
//     }

//     const categoryList = Array.isArray(categories) ? categories : [categories];
//     const genderList   = Array.isArray(genders)    ? genders    : [genders];

//     const invalidCategories = categoryList.filter((c) => !CATEGORIES.includes(c));
//     const invalidGenders    = genderList.filter((g)   => !GENDERS.includes(g));

//     if (invalidCategories.length) {
//       return res.status(400).json({
//         message: `Invalid categories: ${invalidCategories.join(", ")}. Must be from: ${CATEGORIES.join(", ")}`,
//       });
//     }
//     if (invalidGenders.length) {
//       return res.status(400).json({
//         message: `Invalid genders: ${invalidGenders.join(", ")}. Must be from: ${GENDERS.join(", ")}`,
//       });
//     }

//     const gameHouses = Array.isArray(houses) && houses.length >= 2 ? houses : HOUSES;
//     const created    = [];
//     const skipped    = [];

    
//     const existingGame = await Game.findOne({ name });
//     const gameId = existingGame?.gameId ?? randomUUID();

//     for (const category of categoryList) {
//       for (const gender of genderList) {
//         const existing = await Game.findOne({ name, category, gender });
//         if (existing) { skipped.push(`${category} - ${gender}`); continue; }

//         await Game.create({
//           name,
//           category,
//           gender,
//           gameId,
//           houses: gameHouses,
//           houseScores: gameHouses.map((h) => ({
//             house:  h,
//             points: 0,
//             medals: { gold: 0, silver: 0, bronze: 0 },
//             judges: [],
//           })),
//         });

//         created.push(`${category} - ${gender}`);
//       }
//     }

//     return res.status(201).json({
//       message: `✅ ${created.length} game(s) created.`,
//       gameId,
//       created,
//       skipped: skipped.length ? skipped : undefined,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //ADMIN: Update game 
// exports.updateGame = async (req, res) => {
//   try {
//     const { gameId } = req.params;
//     const { name, category, gender } = req.body;

//     if (category && !CATEGORIES.includes(category)) {
//       return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
//     }
//     if (gender && !GENDERS.includes(gender)) {
//       return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
//     }

    
//     const update = {
//       ...(name     && { name }),
//       ...(category && { category }),
//       ...(gender   && { gender }),
//     };

//     const result = await Game.updateMany({ gameId }, update);
//     if (result.matchedCount === 0) {
//       return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
//     }

//     const updated = await Game.find({ gameId });

//     return res.json({
//       message: `✅ ${result.modifiedCount} game(s) updated.`,
//       gameId,
//       games: updated.map((g) => `${g.category} - ${g.gender}`),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// // ADMIN: Delete game
// exports.deleteGame = async (req, res) => {
//   try {
//     const { gameId } = req.params;

//     const result = await Game.deleteMany({ gameId });
//     if (result.deletedCount === 0) {
//       return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
//     }

//     return res.json({
//       message: `✅ ${result.deletedCount} game(s) deleted.`,
//       gameId,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  ADMIN: Publish game 
// exports.publishGame = async (req, res) => {
//   try {
//     const { gameId } = req.params;

//     const games = await Game.find({ gameId });
//     if (!games.length) {
//       return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
//     }

    
//     const alreadyPublished = games.every((g) => g.published);
//     if (alreadyPublished) {
//       return res.json({
//         message:    "Game is already published.",
//         gameId,
//         gameName:   games[0].name,
//         publicLink: `/public/${games[0].publicLink}`,
//         published:  games.map((g) => `${g.category} - ${g.gender}`),
//       });
//     }

//     // One shared token for the entire race
//     const token = crypto.randomBytes(8).toString("hex");

//     await Game.updateMany({ gameId }, { published: true, publicLink: token });

//     return res.json({
//       message:    `✅ ${games.length} game(s) published.`,
//       gameId,
//       gameName:   games[0].name,
//       publicLink: `/public/${token}`,
//       published:  games.map((g) => `${g.category} - ${g.gender}`),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  ADMIN: Unpublish game
// exports.unpublishGame = async (req, res) => {
//   try {
//     const { gameId } = req.params;

//     const result = await Game.updateMany(
//       { gameId },
//       { published: false, publicLink: null }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ message: `No games found for gameId "${gameId}".` });
//     }

//     return res.json({
//       message: `✅ ${result.modifiedCount} game(s) unpublished.`,
//       gameId,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// // ADMIN: Reset leaderboard 
// exports.resetLeaderboard = async (req, res) => {
//   try {
//     await Game.updateMany({}, {
//       $set: {
//         "houseScores.$[].points":        0,
//         "houseScores.$[].medals.gold":   0,
//         "houseScores.$[].medals.silver": 0,
//         "houseScores.$[].medals.bronze": 0,
//         "houseScores.$[].judges":        [],
//       },
//     });

//     req.app.get("io").emit("scoreUpdated", { message: "Leaderboard reset." });

//     return res.json({ message: "✅ Leaderboard reset successfully." });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  PUBLIC: Get all games 
// exports.getAllGames = async (req, res) => {
//   try {

//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 6;

//     const skip = (page - 1) * limit;

//     const games = await Game.find()
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const total = await Game.countDocuments();

//     res.json({
//       games,
//       totalGames: total,
//       currentPage: page,
//       totalPages: Math.ceil(total / limit)
//     });

//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };;

// //  PUBLIC: Get game by gameId 
// exports.getGamesByGameId = async (req, res) => {
//   try {
//     const { gameId } = req.params;

// if (!gameId) {
//   return res.status(400).json({
//     message: "gameId parameter is required"
//   });
// }

//     const game = await Game.findOne({ gameId }).lean();

//     if (!game) {
//       return res
//         .status(404)
//         .json({ message: `Game with id "${gameId}" not found.` });
//     }

//     return res.json({
//       gameId: game.gameId,
//       name: game.name,
//       category: game.category,
//       gender: game.gender,
//       published: game.published,
//       houseScores: game.houseScores.map(({ house, points, medals }) => ({
//         house,
//         points,
//         medals,
//       })),
//     });

//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  PUBLIC: Get games by category + gender 
// exports.getGamesByCategoryAndGender = async (req, res) => {
//   try {
//     const { category, gender } = req.params;

//     if (!CATEGORIES.includes(category)) {
//       return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
//     }
//     if (!GENDERS.includes(gender)) {
//       return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
//     }

//     const games = await Game.find({ category, gender }).sort({ name: 1 });
//     if (!games.length) {
//       return res.status(404).json({ message: `No games found for ${category} - ${gender}.` });
//     }

//     return res.json({
//       category,
//       gender,
//       total: games.length,
//       games: games.map((g) => ({
//         gameId:      g.gameId,
//         name:        g.name,
//         houseScores: g.houseScores.map(({ house, points, medals }) => ({ house, points, medals })),
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  PUBLIC: Audience view via token 
// exports.getPublicGame = async (req, res) => {
//   try {
//     const { token } = req.params;

//     const games = await Game.find({ publicLink: token, published: true });
//     if (!games.length) {
//       return res.status(404).json({ message: "Game not found or not published." });
//     }

//     return res.json({
//       gameId:    games[0].gameId,
//       gameName:  games[0].name,
//       total:     games.length,
//       games:     games.map((g) => ({
//         category:    g.category,
//         gender:      g.gender,
//         houseScores: g.houseScores.map(({ house, points, medals }) => ({ house, points, medals })),
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// }

// //  PUBLIC: Leaderboard 
// exports.getLeaderboard = async (req, res) => {
//   try {
//     // ✅ Fetch ALL games — not just ones with points
//     const games  = await Game.find({});
//     const totals = {};

//     // ✅ Always seed all 4 houses at 0 so they always appear
//     const HOUSES = ["Blue", "Yellow", "Green"];
//     HOUSES.forEach((h) => {
//       totals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 };
//     });

//     for (const game of games) {
//       for (const hs of game.houseScores) {
//         if (!totals[hs.house]) {
//           totals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
//         }
//         totals[hs.house].points += hs.points;
//         totals[hs.house].gold   += hs.medals.gold;
//         totals[hs.house].silver += hs.medals.silver;
//         totals[hs.house].bronze += hs.medals.bronze;
//       }
//     }

//     // Overall leaderboard 
//     const sorted = Object.entries(totals).sort((a, b) => b[1].points - a[1].points);
//     let rank = 1;
//     const overallLeaderboard = sorted.map(([house, data], i) => {
//       if (i > 0 && data.points < sorted[i - 1][1].points) rank = i + 1;
//       return {
//         rank,
//         house,
//         points:      data.points,
//         totalPoints: data.points,   
//         medals: {
//           gold:   data.gold,
//           silver: data.silver,
//           bronze: data.bronze,
//         },
//       };
//     });

//     // Medal table 
//     const medalTable = Object.fromEntries(
//       Object.entries(totals).map(([house, data]) => [
//         house,
//         {
//           points:      data.points,
//           totalPoints: data.points,
//           gold:        data.gold,
//           silver:      data.silver,
//           bronze:      data.bronze,
//         },
//       ])
//     );

//     //  Category leaderboard
//     const categoryLeaderboard = {};
//     for (const category of CATEGORIES) {
//       const catTotals = {};
//       HOUSES.forEach((h) => { catTotals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 }; });

//       for (const game of games.filter((g) => g.category === category)) {
//         for (const hs of game.houseScores) {
//           if (!catTotals[hs.house]) {
//             catTotals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
//           }
//           catTotals[hs.house].points += hs.points;
//           catTotals[hs.house].gold   += hs.medals.gold;
//           catTotals[hs.house].silver += hs.medals.silver;
//           catTotals[hs.house].bronze += hs.medals.bronze;
//         }
//       }

//       const catSorted = Object.entries(catTotals).sort((a, b) => b[1].points - a[1].points);
//       let catRank = 1;
//       categoryLeaderboard[category] = catSorted.map(([house, data], i) => {
//         if (i > 0 && data.points < catSorted[i - 1][1].points) catRank = i + 1;
//         return {
//           rank:        catRank,
//           house,
//           points:      data.points,
//           totalPoints: data.points,
//           medals: {
//             gold:   data.gold,
//             silver: data.silver,
//             bronze: data.bronze,
//           },
//         };
//       });
//     }

//     //Gender leaderboard 
//     const genderLeaderboard = {};
//     for (const gender of GENDERS) {
//       const genTotals = {};
//       HOUSES.forEach((h) => { genTotals[h] = { points: 0, gold: 0, silver: 0, bronze: 0 }; });

//       for (const game of games.filter((g) => g.gender === gender)) {
//         for (const hs of game.houseScores) {
//           if (!genTotals[hs.house]) {
//             genTotals[hs.house] = { points: 0, gold: 0, silver: 0, bronze: 0 };
//           }
//           genTotals[hs.house].points += hs.points;
//           genTotals[hs.house].gold   += hs.medals.gold;
//           genTotals[hs.house].silver += hs.medals.silver;
//           genTotals[hs.house].bronze += hs.medals.bronze;
//         }
//       }

//       const genSorted = Object.entries(genTotals).sort((a, b) => b[1].points - a[1].points);
//       let genRank = 1;
//       genderLeaderboard[gender] = genSorted.map(([house, data], i) => {
//         if (i > 0 && data.points < genSorted[i - 1][1].points) genRank = i + 1;
//         return {
//           rank:        genRank,
//           house,
//           points:      data.points,
//           totalPoints: data.points,
//           medals: {
//             gold:   data.gold,
//             silver: data.silver,
//             bronze: data.bronze,
//           },
//         };
//       });
//     }
//     const houseTotals = Object.entries(totals)
//       .sort((a, b) => b[1].points - a[1].points)
//       .map(([house, data], i) => ({
//         rank:        i + 1,
//         house,
//         points:      data.points,
//         totalPoints: data.points,
//         gold:        data.gold,
//         silver:      data.silver,
//         bronze:      data.bronze,
//       }));

//     return res.json({
//       houseTotals,
//       overallLeaderboard,
//       categoryLeaderboard,
//       genderLeaderboard,
//       medalTable,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// // JUDGE: Submit result by gameId + category + gender
// exports.submitResult = async (req, res) => {
//   try {
//     const { gameId }              = req.params;
//     const { category, gender, gold, silver, bronze } = req.body;
//     const judgeCode               = req.judge.code;

//     if (!category || !gender) {
//       return res.status(400).json({ message: "category and gender are required in the body." });
//     }
//     if (!CATEGORIES.includes(category)) {
//       return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
//     }
//     if (!GENDERS.includes(gender)) {
//       return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
//     }

//     const placementError = validatePlacements(gold, silver, bronze);
//     if (placementError) return res.status(400).json({ message: placementError });

//     const game = await Game.findOne({ gameId, category, gender });
//     if (!game) {
//       return res.status(404).json({ message: `Game not found for gameId "${gameId}" under ${category} - ${gender}.` });
//     }

//     if (hasJudgeSubmitted(game, judgeCode)) {
//       return res.status(409).json({ message: "You have already submitted results for this game." });
//     }

//     const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
//     if (err) return res.status(400).json({ message: err });

//     await game.save();
//     req.app.get("io").emit("scoreUpdated", game);

//     return res.json({ message: "✅ Result submitted successfully.", game });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// // JUDGE: Submit by category + gender params
// exports.submitResultByCategoryAndGender = async (req, res) => {
//   try {
//     const { category, gender }            = req.params;
//     const { gameName, gold, silver, bronze } = req.body;
//     const judgeCode                       = req.judge.code;

//     if (!gameName) return res.status(400).json({ message: "gameName is required." });

//     const placementError = validatePlacements(gold, silver, bronze);
//     if (placementError) return res.status(400).json({ message: placementError });

//     const game = await Game.findOne({ name: gameName, category, gender });
//     if (!game) {
//       return res.status(404).json({
//         message: `Game "${gameName}" not found under ${category} - ${gender}.`,
//       });
//     }

//     if (hasJudgeSubmitted(game, judgeCode)) {
//       return res.status(409).json({ message: "You have already submitted results for this game." });
//     }

//     const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
//     if (err) return res.status(400).json({ message: err });

//     await game.save();
//     req.app.get("io").emit("scoreUpdated", game);

//     return res.json({
//       message: `✅ Score submitted for "${gameName}" (${category} - ${gender}).`,
//       game,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// // JUDGE: Submit single score 
// exports.submitSingleScore = async (req, res) => {
//   try {
//     const { gameName, category, gender, gold, silver, bronze } = req.body;
//     const judgeCode = req.judge.code;

//     if (!gameName || !category || !gender) {
//       return res.status(400).json({ message: "gameName, category, and gender are required." });
//     }
//     if (!CATEGORIES.includes(category)) {
//       return res.status(400).json({ message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` });
//     }
//     if (!GENDERS.includes(gender)) {
//       return res.status(400).json({ message: `Invalid gender. Must be one of: ${GENDERS.join(", ")}` });
//     }

//     const placementError = validatePlacements(gold, silver, bronze);
//     if (placementError) return res.status(400).json({ message: placementError });

//     const game = await Game.findOne({ name: gameName, category, gender });
//     if (!game) {
//       return res.status(404).json({
//         message: `Game "${gameName}" not found under ${category} - ${gender}.`,
//       });
//     }

//     if (hasJudgeSubmitted(game, judgeCode)) {
//       return res.status(409).json({ message: "You have already submitted results for this game." });
//     }

//     const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
//     if (err) return res.status(400).json({ message: err });

//     await game.save();
//     req.app.get("io").emit("scoreUpdated", game);

//     return res.json({
//       message: `✅ Score submitted for "${gameName}" (${category} - ${gender}).`,
//       game,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

// //  JUDGE: Submit multiple scores 
// exports.submitMultipleScores = async (req, res) => {
//   try {
//     const { gameName, scores } = req.body;
//     const judgeCode = req.judge.code;

//     if (!gameName) return res.status(400).json({ message: "gameName is required." });
//     if (!Array.isArray(scores) || scores.length === 0) {
//       return res.status(400).json({ message: "scores must be a non-empty array." });
//     }

//     const submitted = [];
//     const skipped   = [];
//     const errors    = [];

//     for (const entry of scores) {
//       const { category, gender, gold, silver, bronze } = entry;

//       if (!category || !gender) {
//         errors.push({ entry, reason: "category and gender are required." });
//         continue;
//       }
//       if (!CATEGORIES.includes(category)) {
//         errors.push({ entry, reason: `Invalid category "${category}".` });
//         continue;
//       }
//       if (!GENDERS.includes(gender)) {
//         errors.push({ entry, reason: `Invalid gender "${gender}".` });
//         continue;
//       }

//       const placementError = validatePlacements(gold, silver, bronze);
//       if (placementError) { errors.push({ entry, reason: placementError }); continue; }

//       const game = await Game.findOne({ name: gameName, category, gender });
//       if (!game) {
//         errors.push({ entry, reason: `Game "${gameName}" not found under ${category} - ${gender}.` });
//         continue;
//       }

//       if (hasJudgeSubmitted(game, judgeCode)) {
//         skipped.push(`${category} - ${gender} (already submitted)`);
//         continue;
//       }

//       const err = applyPlacements(game, { gold, silver, bronze }, judgeCode);
//       if (err) { errors.push({ entry, reason: err }); continue; }

//       await game.save();
//       req.app.get("io").emit("scoreUpdated", game);
//       submitted.push(`${category} - ${gender}`);
//     }

//     return res.json({
//       message:  `✅ ${submitted.length} score(s) submitted.`,
//       submitted,
//       skipped:  skipped.length ? skipped : undefined,
//       errors:   errors.length  ? errors  : undefined,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };