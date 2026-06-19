const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { verifyToken } = require("../middlewares/auth.js");

router.post("/recipes", verifyToken, async (req, res) => {
  try {
    const {
      recipeName,
      recipeImage,
      category,
      cuisineType,
      difficultyLevel,
      preparationTime,
      ingredients,
      instructions,
    } = req.body;

    if (!recipeName || !category || !ingredients || !instructions) {
      return res
        .status(400)
        .json({ message: "Missing required recipe fields" });
    }

    const db = req.app.get("db");
    const usersCollection = db.collection("users");
    const recipesColeection = db.collection("recipes");

    const user = await usersCollection.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "User account is blocked" });
    }

    if (user.role !== "admin" && !user.isPremium) {
      const activeRecipeCount = await recipesColeection.countDocuments({
        authorEmail: user.email,
        status: { $ne: "deleted" },
      });

      if (activeRecipeCount >= 2) {
        return res.status(403).json({
          message:
            "Limit reached: Free members can only add up to 2 recipes. Upgrade to Premium for unlimited uploads",
        });
      }
    }

    const newRecipe = {
      recipeName,
      recipeImage: recipeImage || "",
      category,
      cuisineType: cuisineType || "",
      difficultyLevel: difficultyLevel || "Medium",
      preparationTime: parseInt(preparationTime) || 30,
      ingredients: Array.isArray(ingredients)
        ? ingredients
        : ingredients.split(",").map((i) => i.trim()),
      instructions,
      authorId: user._id.toString(),
      authorName: user.name,
      authorEmail: user.email,
      likesCount: 0,
      isFeatured: false,
      status: "active", // সক্রিয় রেসিপি
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await recipesColeection.insertOne(newRecipe);
    res
      .status(201)
      .json({ success: true, recipeId: result.insertedId, recipe: newRecipe });

    // catch block
  } catch (error) {
    console.error("Error creating recipe:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/recipes", async (req, res) => {
  try {
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");
    const { search, category, page = 1, limit = 6 } = req.query;

    const query = { status: "active" };

    if (search) query.recipeName = { $regex: search, $options: "i" };

    if (category) {
      const categories = category.split(",").map((c) => c.trim());
      query.category = { $in: categories };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const recipes = await recipesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await recipesCollection.countDocuments(query);

    res.json({
      recipes,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching recipes: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Featured recipes for home page (GET /api/recipes/featured)
router.get("/recipes/featured", async (req, res) => {
  try {
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");
    const limit = parseInt(req.query.limit) || 3;

    const recipes = await recipesCollection
      .find({ status: "active", isFeatured: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ recipes });
  } catch (error) {
    console.error("Error fetching featured recipes:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Popular recipes sorted by likes (GET /api/recipes/popular)
router.get("/recipes/popular", async (req, res) => {
  try {
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");
    const limit = parseInt(req.query.limit) || 3;

    const recipes = await recipesCollection
      .find({ status: "active" })
      .sort({ likesCount: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ recipes });
  } catch (error) {
    console.error("Error fetching popular recipes:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// User interaction status for a recipe (GET /api/recipes/:id/status)
router.get("/recipes/:id/status", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");
    const favoritesCollection = db.collection("favorites");
    const paymentsCollection = db.collection("payments");

    const recipe = await recipesCollection.findOne({
      _id: new ObjectId(id),
      status: { $ne: "deleted" },
    });
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const liked = (recipe.likedBy || []).includes(req.user.email);

    const favorite = await favoritesCollection.findOne({
      userEmail: req.user.email,
      recipeId: new ObjectId(id),
    });

    const purchased = await paymentsCollection.findOne({
      userEmail: req.user.email,
      recipeId: new ObjectId(id),
      paymentStatus: "succeeded",
    });

    res.json({
      liked,
      likesCount: recipe.likesCount || 0,
      favorited: !!favorite,
      favoriteId: favorite?._id?.toString() || null,
      purchased: !!purchased,
    });
  } catch (error) {
    console.error("Error fetching recipe status:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/recipes/my-recipes", verifyToken, async (req, res) => {
  try {
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");

    const recipes = await recipesCollection
      .find({ authorEmail: req.user.email, status: { $ne: "deleted" } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(recipes);
  } catch (error) {
    console.error("Error fetching my recipes:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৫. রেসিপি আপডেট করার জন্য রাউট (PUT /api/recipes/:id)
router.put("/recipes/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      recipeName,
      recipeImage,
      category,
      cuisineType,
      difficultyLevel,
      preparationTime,
      ingredients,
      instructions,
    } = req.body;

    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");

    const recipe = await recipesCollection.findOne({ _id: new ObjectId(id) });
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    // চেক করা ইউজার নিজেই অথর কিনা
    if (recipe.authorEmail !== req.user.email && req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized to edit this recipe" });
    }

    const updatedRecipe = {
      recipeName: recipeName || recipe.recipeName,
      recipeImage: recipeImage !== undefined ? recipeImage : recipe.recipeImage,
      category: category || recipe.category,
      cuisineType: cuisineType || recipe.cuisineType,
      difficultyLevel: difficultyLevel || recipe.difficultyLevel,
      preparationTime: parseInt(preparationTime) || recipe.preparationTime,
      ingredients: Array.isArray(ingredients)
        ? ingredients
        : ingredients.split(",").map((i) => i.trim()),
      instructions: instructions || recipe.instructions,
      updatedAt: new Date(),
    };

    await recipesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedRecipe }
    );

    res.json({ success: true, message: "Recipe updated successfully", recipe: updatedRecipe });
  } catch (error) {
    console.error("Error updating recipe:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/recipes/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");

    const recipe = await recipesCollection.findOne({ _id: new ObjectId(id) });
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    if (recipe.authorEmail !== req.user.email && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this recipe" });
    }

    await recipesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "deleted", updatedAt: new Date() } },
    );

    res.json({ success: true, message: "Recipe deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Like / Unlike a recipe (PATCH /api/recipes/:id/like)
router.patch("/recipes/:id/like", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");

    const recipe = await recipesCollection.findOne({ _id: new ObjectId(id) });
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const likedBy = recipe.likedBy || [];
    const alreadyLiked = likedBy.includes(req.user.email);

    if (alreadyLiked) {
      // Unlike: remove email and decrement count
      await recipesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $pull: { likedBy: req.user.email },
          $inc: { likesCount: -1 },
        }
      );
      return res.json({ success: true, liked: false, likesCount: (recipe.likesCount || 1) - 1 });
    } else {
      // Like: add email and increment count
      await recipesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $addToSet: { likedBy: req.user.email },
          $inc: { likesCount: 1 },
        }
      );
      return res.json({ success: true, liked: true, likesCount: (recipe.likesCount || 0) + 1 });
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get a single recipe by ID (GET /api/recipes/:id)
router.get("/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.get("db");
    const recipesCollection = db.collection("recipes");

    const recipe = await recipesCollection.findOne({
      _id: new ObjectId(id),
      status: { $ne: "deleted" },
    });

    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    res.json(recipe);
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;

