const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./db.js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

const authRoutes = require("./routes/auth.js");

connectDB()
  .then((db) => {
    app.set("db", db);

    app.use("/api", authRoutes);

    app.get("/", (req, res) => {
      res.send({
        status: "healthy",
        message: "Retro Recipe Server is running!",
      });
    });

    app.listen(PORT, () => {
      console.log(`Retro Server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed. Server startup aborted.", err);
  });
