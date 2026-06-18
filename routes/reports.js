const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

router.post("/reports", verifyToken, async (req, res) => {
  try {
    const { recipeId, reason } = req.body;
    if (!recipeId || !reason) {
      return res
        .status(400)
        .json({ message: "Recipe ID and reason are required" });
    }

    const db = req.app.get("db");

    await db.collection("reports").insertOne({
      recipeId: new ObjectId(recipeId),
      reporterEmail: req.user.email,
      reason,
      status: "pending",
      createdAt: new Date(),
    });

    res
      .status(201)
      .json({ success: true, message: "Report submitted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/reports", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = req.app.get("db");

    const reports = await db
      .collection("reports")
      .aggregate([
        // রেসিপি কালেকশন থেকে রিপোর্টেড রেসিপির নাম ও লেখকের ইমেইল আনা
        {
          $lookup: {
            from: "recipes",
            localField: "recipeId",
            foreignField: "_id",
            as: "recipeDetails",
          },
        },
        { $unwind: "$recipeDetails" },
        {
          $project: {
            _id: 1,
            recipeId: 1,
            reporterEmail: 1,
            reason: 1,
            status: 1,
            createdAt: 1,
            recipeName: "$recipeDetails.recipeName",
            authorEmail: "$recipeDetails.authorEmail",
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/reports/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");

    const result = await db
      .collection("reports")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Report not found" });

    res.json({ success: true, message: "Report dismissed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete(
  "/reports/:id/remove-recipe",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = req.app.get("db");

      const report = await db
        .collection("reports")
        .findOne({ _id: new ObjectId(id) });
      if (!report) return res.status(404).json({ message: "Report not found" });

      await db
        .collection("recipes")
        .updateOne(
          { _id: report.recipeId },
          { $set: { status: "deleted", updatedAt: new Date() } },
        );

      await db.collection("reports").deleteMany({ recipeId: report.recipeId });

      res.json({
        success: true,
        message: "Recipe removed and all related reports resolved",
      });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
);

module.exports = router;
