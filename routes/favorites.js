const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { verifyToken } = require("../middlewares/auth.js");

router.post("/favorites", verifyToken, async (req, res) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId)
      return res.status(400).json({ message: "Recipe ID is required" });

    const db = req.app.get("db");
    const favoritesCollection = db.collection("favorites");

    const existing = await favoritesCollection.findOne({
      userEmail: req.user.email,
      recipeId: new ObjectId(recipeId),
    });

    if (existing)
      return res.status(400).json({ message: "Recipe already in favorites" });

    await favoritesCollection.insertOne({
      userEmail: req.user.email,
      userId: req.user.id,
      recipeId: new ObjectId(recipeId),
      addedAt: new Date(),
    });

    res.status(201).json({ success: true, message: "Added to favorites" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/favorites", verifyToken, async (req, res) => {
  try {
    const db = req.app.get("db");

    const favorites = await db
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

    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৩. ইউজারের ফেভারিট থেকে রেসিপি রিমুভ করা (DELETE /api/favorites/:id)
router.delete("/favorites/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");
    const favoritesCollection = db.collection("favorites");

    const favorite = await favoritesCollection.findOne({ _id: new ObjectId(id) });
    if (!favorite) {
      return res.status(404).json({ message: "Favorite entry not found" });
    }

    if (favorite.userEmail !== req.user.email) {
      return res
        .status(403)
        .json({ message: "Unauthorized to remove this favorite" });
    }

    await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true, message: "Removed from favorites" });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
