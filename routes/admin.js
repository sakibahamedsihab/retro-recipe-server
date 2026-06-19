const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

// ১. অ্যাডমিন ওভারভিউ স্ট্যাটস (GET /api/admin/overview)
router.get("/admin/overview", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = req.app.get("db");

    // ৪টি কাউন্টিং অপারেশন সমান্তরালভাবে (Parallel) চালানো যাতে সার্ভার সুপার-ফাস্ট রেসপন্স করে
    const totalUsers = await db.collection("users").countDocuments();
    const totalRecipes = await db
      .collection("recipes")
      .countDocuments({ status: { $ne: "deleted" } });
    const totalPremiumMembers = await db
      .collection("users")
      .countDocuments({ isPremium: true });
    const totalReports = await db.collection("reports").countDocuments();

    // মঙ্গোডিবি এগ্রিগেশন দিয়ে মোট আয়ের ($sum) হিসাব নিকাশ
    const revenueStats = await db
      .collection("payments")
      .aggregate([
        { $match: { paymentStatus: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();

    // যদি কোনো পেমেন্ট না থাকে তবে রেভিনিউ ০ দেখাবে
    const totalRevenue = revenueStats.length > 0 ? revenueStats[0].total : 0;

    res.json({
      totalUsers,
      totalRecipes,
      totalPremiumMembers,
      totalReports,
      totalRevenue,
    });
  } catch (error) {
    console.error("Admin overview stats error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ২. সমস্ত ইউজারের লিস্ট দেখা (GET /api/admin/users)
router.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = req.app.get("db");
    const users = await db
      .collection("users")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৩. ইউজার ব্লক/আনব্লক মডারেশন (PATCH /api/admin/users/:id/block)
router.patch(
  "/admin/users/:id/block",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body; // ফ্রন্টএন্ড থেকে true অথবা false আসবে

      const db = req.app.get("db");

      const result = await db
        .collection("users")
        .updateOne(
          { _id: new ObjectId(id) },
          { $set: { isBlocked: !isBlocked, updatedAt: new Date() } },
        );

      if (result.matchedCount === 0)
        return res.status(404).json({ message: "User not found" });

      res.json({
        success: true,
        message: `User account successfully ${!isBlocked ? "blocked" : "unblocked"}`,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
);

// ৪. সমস্ত রেসিপি অ্যাডমিন ভিউ (GET /api/admin/recipes)
router.get("/admin/recipes", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = req.app.get("db");
    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const query = { status: { $ne: "deleted" } };
    if (search) query.recipeName = { $regex: search, $options: "i" };

    const recipes = await db
      .collection("recipes")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection("recipes").countDocuments(query);

    res.json({
      recipes,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৫. রেসিপি ফিচার টগল (PATCH /api/admin/recipes/:id/feature)
router.patch(
  "/admin/recipes/:id/feature",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isFeatured } = req.body;
      const db = req.app.get("db");

      const result = await db.collection("recipes").updateOne(
        { _id: new ObjectId(id) },
        { $set: { isFeatured: !!isFeatured, updatedAt: new Date() } },
      );

      if (result.matchedCount === 0)
        return res.status(404).json({ message: "Recipe not found" });

      res.json({
        success: true,
        message: isFeatured
          ? "Recipe featured on home page"
          : "Recipe removed from featured",
      });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
);

// ৬. ট্রানজেকশন লিস্ট (GET /api/admin/transactions)
router.get(
  "/admin/transactions",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const db = req.app.get("db");
      const { page = 1, limit = 10 } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const transactions = await db
        .collection("payments")
        .find()
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const total = await db.collection("payments").countDocuments();

      res.json({
        transactions,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
);

module.exports = router;
