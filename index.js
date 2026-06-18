const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { connectDB } = require("./db.js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  }),
);

app.use(express.json());
app.use(cookieParser());

const authRoutes = require("./routes/auth.js");
const recipeRoutes = require("./routes/recipes.js");
const favoriteRoutes = require("./routes/favorites.js");
const reportRoutes = require("./routes/reports.js");
const paymentRoutes = require("./routes/payments.js");
const adminRoutes = require("./routes/admin.js");
connectDB()
  .then((db) => {
    app.set("db", db);

    app.use("/api", authRoutes);
    app.use("/api", recipeRoutes);
    app.use("/api", favoriteRoutes);
    app.use("/api", reportRoutes);
    app.use("/api", paymentRoutes);
    app.use("/api", adminRoutes);

    app.get("/", (req, res) => {
      res.send({
        status: "healthy",
        message: "Retro Recipe Server is running!",
      });
    });

    app.use((err, req, res, next) => {
      console.error("Global Catch-Net Caught An Error:", err.stack);
      res.status(500).json({
        message: "Something broke in the server!",
        error:
          process.env.NODE_ENV === "production"
            ? "Internal Error"
            : err.message,
      });
    });

    app.listen(PORT, () => {
      console.log(`Retro Server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed. Server startup aborted.", err);
  });
