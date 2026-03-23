require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");
const {dbconnnect}  = require("./config/dbconnect.js");
const gameRouter  = require("./Routes/gameRouter.js");
const authRouter = require("./Routes/authRouter.js")
const dotenv = require('dotenv');



const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

dbconnnect();

app.use(cors());
app.use(express.json());
app.set("io", io);

app.use("/api/games",  gameRouter);
app.use("/api/auth",  authRouter);

app.get("/", (req, res) => res.json({ message: "🏆 Sports Scoring API is running." }));

io.on("connection", (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`❌ Client disconnected: ${socket.id}`));
});

app.use((req, res) => res.status(404).json({ message: "Route not found." }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));







// const express=require("express");
// const mongoose=require("mongoose");
// const  {dbconnect} = require("./config/dbconnect.js")
// const cors=require("cors");
// const http=require("http");
// const {Server}=require("socket.io");
// const scoreRouter=require("./Routes/scoreRouter.js");
// const dotenv = require("dotenv");
// require("dotenv").config();

// const app=express();
// const PORT = process.env.PORT || 3000;
// const server=http.createServer(app);
// const io=new Server(server,{cors:{origin:"*"}});
// app.set("io",io);

// app.use(cors());
// app.use(express.json());
// app.use("/api/races",scoreRouter);

// // Connect to MongoDB
//   dbconnect()


// // mongoose.connect(process.env.MONGO_URI,{useNewUrlParser:true,useUnifiedTopology:true})
// //   .then(()=>console.log("MongoDB connected"))
// //   .catch(err=>console.log(err));

// const port = process.env.PORT || 4000; 
// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });
// // server.listen(process.env.PORT||5000,()=>console.log("Server running on port "+(process.env.PORT||5000)));