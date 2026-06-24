const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

// Create Recipe (with Free Limit Check)
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
        .send({ message: "Missing required recipe fields" });
    }

    const db = getDB();
    const user = await db
      .collection("users")
      .findOne({ email: req.user.email });

    if (user.role !== "admin") {
      const activeRecipeCount = await db.collection("recipes").countDocuments({
        authorEmail: user.email,
        status: { $ne: "deleted" },
      });
      const limit = user.recipeLimit || (user.isPremium ? (user.premiumType === "bronze" ? 5 : user.premiumType === "silver" ? 15 : 9999) : 2);
      if (activeRecipeCount >= limit) {
        return res.status(403).send({
          message: `Limit reached: Your current plan allows up to ${limit} recipes. Upgrade to Premium for a higher limit!`,
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
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("recipes").insertOne(newRecipe);
    res
      .status(201)
      .send({ success: true, recipeId: result.insertedId, recipe: newRecipe });
  } catch (error) {
    console.error("Error creating recipe:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Get Recipes with Advanced Filters, Pagination & Sorting
router.get("/recipes", async (req, res) => {
  try {
    const db = getDB();
    const { search, category, sortBy, order, page = 1, limit = 6 } = req.query;
    const query = { status: "active" };

    if (search) query.recipeName = { $regex: search, $options: "i" };
    if (category)
      query.category = { $in: category.split(",").map((c) => c.trim()) };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let sortObj = { createdAt: -1 };
    if (sortBy) sortObj = { [sortBy]: order === "asc" ? 1 : -1 };

    const recipes = await db
      .collection("recipes")
      .find(query)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    const total = await db.collection("recipes").countDocuments(query);
    res.send({
      recipes,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Featured & Popular endpoints
router.get("/recipes/featured", async (req, res) => {
  const recipes = await getDB()
    .collection("recipes")
    .find({ status: "active", isFeatured: true })
    .limit(4)
    .toArray();
  res.send(recipes);
});

router.get("/recipes/popular", async (req, res) => {
  const recipes = await getDB()
    .collection("recipes")
    .find({ status: "active" })
    .sort({ likesCount: -1, createdAt: -1 })
    .limit(4)
    .toArray();
  res.send(recipes);
});

router.get("/recipes/my-recipes", verifyToken, async (req, res) => {
  const recipes = await getDB()
    .collection("recipes")
    .find({ authorEmail: req.user.email, status: { $ne: "deleted" } })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(recipes);
});

router.get("/recipes/:id", async (req, res) => {
  try {
    const recipe = await getDB()
      .collection("recipes")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!recipe || recipe.status === "deleted")
      return res.status(404).send({ message: "Recipe not found" });
    res.send(recipe);
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.patch("/recipes/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const recipe = await db
      .collection("recipes")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (recipe.authorEmail !== req.user.email && req.user.role !== "admin")
      return res.status(403).send({ message: "Unauthorized" });

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;
    if (updates.preparationTime)
      updates.preparationTime = parseInt(updates.preparationTime);

    await db
      .collection("recipes")
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.delete("/recipes/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const recipe = await db
      .collection("recipes")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (recipe.authorEmail !== req.user.email && req.user.role !== "admin")
      return res.status(403).send({ message: "Unauthorized" });

    await db
      .collection("recipes")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "deleted", updatedAt: new Date() } },
      );
    res.send({ success: true, message: "Recipe soft-deleted" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.post("/recipes/:id/like", verifyToken, async (req, res) => {
  await getDB()
    .collection("recipes")
    .updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { likesCount: 1 }, $set: { updatedAt: new Date() } },
    );
  const updated = await getDB()
    .collection("recipes")
    .findOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: true, likesCount: updated.likesCount });
});

// Toggle recipe feature state (Admin only)
router.patch(
  "/recipes/:id/feature",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const db = getDB();
      const { isFeatured } = req.body;
      await db
        .collection("recipes")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { isFeatured: !!isFeatured, updatedAt: new Date() } },
        );
      res.send({ success: true, message: "Recipe feature state updated" });
    } catch (error) {
      console.error("Error updating recipe feature state:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  },
);

module.exports = router;
