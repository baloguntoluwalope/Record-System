const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  house:  { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Vote", voteSchema);