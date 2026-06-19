const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

// Admin Dashboard Overview Stats
router.get("/admin/overview", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB();
    const totalUsers = await db.collection("users").countDocuments();
    const totalRecipes = await db
      .collection("recipes")
      .countDocuments({ status: { $ne: "deleted" } });
    const totalPremiumMembers = await db
      .collection("users")
      .countDocuments({ isPremium: true });
    const totalReports = await db.collection("reports").countDocuments();

    const revenueStats = await db
      .collection("payments")
      .aggregate([
        { $match: { paymentStatus: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();

    const totalRevenue = revenueStats.length > 0 ? revenueStats[0].total : 0;

    res.send({
      totalUsers,
      totalRecipes,
      totalPremiumMembers,
      totalReports,
      totalRevenue,
    });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// View all users
router.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  const users = await getDB()
    .collection("users")
    .find()
    .sort({ createdAt: -1 })
    .toArray();
  res.send(users);
});

// Block / Unblock user
router.patch(
  "/admin/users/:id/block",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const result = await getDB()
      .collection("users")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { isBlocked: !!req.body.isBlocked, updatedAt: new Date() } },
      );
    res.send({ success: true, message: "User status toggled" });
  },
);

// View all recipes for admin moderation
router.get("/admin/recipes", verifyToken, verifyAdmin, async (req, res) => {
  const recipes = await getDB()
    .collection("recipes")
    .find({ status: { $ne: "deleted" } })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(recipes);
});

// View transactions log
router.get(
  "/admin/transactions",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const transactions = await getDB()
      .collection("payments")
      .find()
      .sort({ paidAt: -1 })
      .toArray();
    res.send(transactions);
  },
);

module.exports = router;
