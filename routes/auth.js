const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../middlewares/auth.js");

router.post("/jwt", async (req, res) => {
  try {
    const { email, name, image } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const db = req.app.get("db");
    const usersCollection = db.collection("users");

    let user = await usersCollection.findOne({ email });

    if (!user) {
      const newUser = {
        name: name || email.split("@")[0],
        email,
        image: image || "",
        role: "user",
        isBlocked: false,
        isPremium: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await usersCollection.insertOne(newUser);
      user = { _id: result.insertedId, ...newUser };
    } else {
      if (user.isBlocked) {
        return res
          .status(403)
          .json({ message: "This user account is blocked" });
      }
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error generationg JWT: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  });
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/users/me", verifyToken, async (req, res) => {
  try {
    const db = req.app.get("db");
    const user = await db
      .collection("users")
      .findOne({ email: req.user.email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৪. ইউজারের নিজস্ব ড্যাশবোর্ড স্ট্যাটস (GET /api/users/dashboard-stats)
router.get("/users/dashboard-stats", verifyToken, async (req, res) => {
  try {
    const db = req.app.get("db");
    const email = req.user.email;

    const totalRecipes = await db
      .collection("recipes")
      .countDocuments({ authorEmail: email, status: { $ne: "deleted" } });

    const totalFavorites = await db
      .collection("favorites")
      .countDocuments({ userEmail: email });

    const recipes = await db
      .collection("recipes")
      .find({ authorEmail: email, status: { $ne: "deleted" } })
      .toArray();

    const totalLikesReceived = recipes.reduce(
      (sum, recipe) => sum + (recipe.likesCount || 0),
      0
    );

    res.json({
      totalRecipes,
      totalFavorites,
      totalLikesReceived,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ৫. ইউজারের প্রোফাইল আপডেট করা (PUT /api/users/profile)
router.put("/users/profile", verifyToken, async (req, res) => {
  try {
    const { name, image, bio } = req.body;
    const db = req.app.get("db");
    const usersCollection = db.collection("users");

    const updateFields = { updatedAt: new Date() };
    if (name) updateFields.name = name;
    if (image !== undefined) updateFields.image = image;
    if (bio !== undefined) updateFields.bio = bio;

    const result = await usersCollection.updateOne(
      { email: req.user.email },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await usersCollection.findOne({ email: req.user.email });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
