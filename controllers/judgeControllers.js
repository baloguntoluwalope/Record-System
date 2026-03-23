const jwt   = require("jsonwebtoken");
const Judge = require("../models/judgeModels.js");
const Game  = require("../models/gameModels.js");

//POST /api/auth/judge/login 
exports.judgeLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required." });
    }

    const judge = await Judge.findOne({ email });
    if (!judge || !judge.isActive) {
      return res.status(401).json({ message: "Invalid credentials or account deactivated." });
    }

    const isMatch = await judge.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { role: "judge", code: judge.code, id: judge._id, name: judge.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id:    judge._id,
        name:  judge.name,
        email: judge.email,
        role:  "judge",
        code:  judge.code,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/judges — admin creates a judge
exports.createJudge = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required." });
    }

    const exists = await Judge.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "Email already registered." });
    }

    const judge = await Judge.create({ name, email, password });

    res.status(201).json({
      message: "Judge created successfully.",
      judge: {
        id:    judge._id,
        name:  judge.name,
        email: judge.email,
        code:  judge.code,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/judges 
exports.getAllJudges = async (req, res) => {
  try {
    const judges = await Judge.find().select("-password");
    res.json({ message: "Judges fetched.", judges });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/auth/judges/:id 
exports.deleteJudge = async (req, res) => {
  try {
    const judge = await Judge.findByIdAndDelete(req.params.id);
    if (!judge) {
      return res.status(404).json({ message: "Judge not found." });
    }
    res.json({ message: "Judge deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/auth/:code/submissions ─────────────────────────────────────────
exports.getJudgeSubmissions = async (req, res) => {
  try {
    const { code } = req.params;

    const judge = await Judge.findOne({ code }).select("-password");
    if (!judge) {
      return res.status(404).json({ message: "Judge not found." });
    }

    // Find all games where this judge submitted
    const games = await Game.find({ "houseScores.judges": code });

    const submissions = games.map((game) => ({
      gameId:   game.gameId,
      name:     game.name,
      category: game.category,
      gender:   game.gender,
      scores:   game.houseScores.map(({ house, points, medals }) => ({
        house, points, medals,
      })),
    }));

    res.json({
      message: "Submissions fetched.",
      judge:   { name: judge.name, code: judge.code },
      total:   submissions.length,
      submissions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};