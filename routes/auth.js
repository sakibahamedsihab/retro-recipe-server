const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getDB } = require("../db");
const { verifyToken } = require("../middlewares/auth");

// Generate JWT and set cookie
router.post("/jwt", async (req, res) => {
  try {
    const { email, name, image } = req.body;
    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const db = getDB();
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
          .send({ message: "This user account is blocked" });
      }
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.send({ user });
  } catch (error) {
    console.error("Error generating JWT:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  });
  res.send({ success: true, message: "Logged out successfully" });
});

// Get current user details
router.get("/users/me", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const user = await db
      .collection("users")
      .findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).send({ message: "Account is blocked" });
    }
    res.send(user);
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Update Profile
router.patch("/users/profile", verifyToken, async (req, res) => {
  try {
    const { name, image } = req.body;
    const db = getDB();
    const usersCollection = db.collection("users");

    const updates = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (image) updates.image = image;

    await usersCollection.updateOne(
      { email: req.user.email },
      { $set: updates },
    );
    const updatedUser = await usersCollection.findOne({
      email: req.user.email,
    });

    res.send(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

module.exports = router;
