const mongoose = require("mongoose");
const Game     = require("./models/gameModels.js");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await Game.updateMany(
    {},
    { $pull: { houseScores: { house: "Red" } } }
  );
  console.log(`✅ Red house removed from ${result.modifiedCount} game(s)`);
  process.exit();
}).catch(console.error);