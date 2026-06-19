const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");
const { verifyToken } = require("../middlewares/auth");

// Add to favorites
router.post("/favorites", verifyToken, async (req, res) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId)
      return res.status(400).send({ message: "Recipe ID is required" });

    const db = getDB();
    const query = {
      userEmail: req.user.email,
      recipeId: new ObjectId(recipeId),
    };
    const existing = await db.collection("favorites").findOne(query);
    if (existing)
      return res.status(400).send({ message: "Recipe already in favorites" });

    await db.collection("favorites").insertOne({
      userEmail: req.user.email,
      userId: req.user.id,
      recipeId: new ObjectId(recipeId),
      addedAt: new Date(),
    });
    res.status(201).send({ success: true, message: "Added to favorites" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Get aggregated favorites
router.get("/favorites", verifyToken, async (req, res) => {
  try {
    const favorites = await getDB()
      .collection("favorites")
      .aggregate([
        { $match: { userEmail: req.user.email } },
        {
          $lookup: {
            from: "recipes",
            localField: "recipeId",
            foreignField: "_id",
            as: "recipeDetails",
          },
        },
        { $unwind: "$recipeDetails" },
        { $match: { "recipeDetails.status": "active" } },
        {
          $project: {
            _id: 1,
            recipeId: 1,
            addedAt: 1,
            recipe: {
              recipeName: "$recipeDetails.recipeName",
              recipeImage: "$recipeDetails.recipeImage",
              category: "$recipeDetails.category",
              cuisineType: "$recipeDetails.cuisineType",
              preparationTime: "$recipeDetails.preparationTime",
              authorName: "$recipeDetails.authorName",
              likesCount: "$recipeDetails.likesCount",
            },
          },
        },
      ])
      .toArray();
    res.send(favorites);
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Remove from favorites
router.delete("/favorites/:recipeId", verifyToken, async (req, res) => {
  await getDB()
    .collection("favorites")
    .deleteOne({
      userEmail: req.user.email,
      recipeId: new ObjectId(req.params.recipeId),
    });
  res.send({ success: true, message: "Removed from favorites" });
});

module.exports = router;
