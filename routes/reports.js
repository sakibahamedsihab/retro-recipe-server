const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

// Create report
router.post("/reports", verifyToken, async (req, res) => {
  try {
    const { recipeId, reason } = req.body;
    if (!recipeId || !reason)
      return res.status(400).send({ message: "Missing fields" });

    await getDB()
      .collection("reports")
      .insertOne({
        recipeId: new ObjectId(recipeId),
        reporterEmail: req.user.email,
        reason,
        status: "pending",
        createdAt: new Date(),
      });
    res
      .status(201)
      .send({ success: true, message: "Report submitted successfully" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Get reported recipes (Admin only)
router.get("/reports", verifyToken, verifyAdmin, async (req, res) => {
  const reports = await getDB()
    .collection("reports")
    .aggregate([
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
  res.send(reports);
});

// Dismiss report (Admin only)
router.delete("/reports/:id", verifyToken, verifyAdmin, async (req, res) => {
  await getDB()
    .collection("reports")
    .deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: true, message: "Report dismissed" });
});

// Delete reported recipe and dismiss report (Admin only)
router.delete(
  "/reports/:id/remove-recipe",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const db = getDB();
    const report = await db
      .collection("reports")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!report) return res.status(404).send({ message: "Report not found" });

    await db
      .collection("recipes")
      .updateOne(
        { _id: report.recipeId },
        { $set: { status: "deleted", updatedAt: new Date() } },
      );
    await db.collection("reports").deleteMany({ recipeId: report.recipeId });
    res.send({ success: true, message: "Recipe removed and reports resolved" });
  },
);

module.exports = router;
