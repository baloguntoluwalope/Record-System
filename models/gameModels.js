const mongoose = require("mongoose");

const houseScoreSchema = new mongoose.Schema({
  house:  { type: String, required: true },
  points: { type: Number, default: 0 },
  medals: {
    gold:   { type: Number, default: 0 },
    silver: { type: Number, default: 0 },
    bronze: { type: Number, default: 0 },
  },
  judges: [{ type: String }],
});

const gameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    category: {
      type: String,
      enum: ["KG", "Nursery", "Primary", "JSS", "SSS", "General"],
      required: true,
    },

    gender: {
      type: String,
      enum: ["Boys", "Girls", "Mixed"],
      required: true,
    },
    gameId: { type: String, index: true },

    houses:      [{ type: String }],
    houseScores: [houseScoreSchema],

    published:  { type: Boolean, default: false },
   publicLink: { type: String }, // remove unique index
  },
  { timestamps: true }
);

module.exports = mongoose.model("Game", gameSchema);