const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { connectDB } = require("./db");
const authRoutes = require("./routes/auth");
const recipeRoutes = require("./routes/recipes");
const favoriteRoutes = require("./routes/favorites");
const reportRoutes = require("./routes/reports");
const paymentRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
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

// Database connection
connectDB()
  .then(() => {
    // Mount routes
    app.use("/api", authRoutes);
    app.use("/api", recipeRoutes);
    app.use("/api", favoriteRoutes);
    app.use("/api", reportRoutes);
    app.use("/api", paymentRoutes);
    app.use("/api", adminRoutes);

    // Root endpoint
    app.get("/", (req, res) => {
      res.send({
        status: "healthy",
        message: "RecipeHub API Server is running",
      });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res
        .status(500)
        .send({
          message: "Something broke in the server!",
          error: err.message,
        });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(
      "Failed to initialize database connection. Server starting aborted.",
      err,
    );
  });
