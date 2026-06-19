const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getDB } = require("../db");
const { verifyToken } = require("../middlewares/auth");

// Create checkout session
router.post(
  "/payments/create-checkout-session",
  verifyToken,
  async (req, res) => {
    try {
      const { type, recipeId } = req.body;
      if (!type)
        return res.status(400).send({ message: "Payment type is required" });

      const db = getDB();
      const user = await db
        .collection("users")
        .findOne({ email: req.user.email });
      if (!user) return res.status(404).send({ message: "User not found" });

      let lineItems = [];
      let metadata = {
        type,
        userEmail: user.email,
        userId: user._id.toString(),
      };

      if (type === "premium") {
        if (user.isPremium)
          return res.status(400).send({ message: "User is already premium" });
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "RecipeHub Premium Membership",
                description:
                  "Unlock unlimited recipe uploads and get a premium badge!",
              },
              unit_amount: 1499,
            },
            quantity: 1,
          },
        ];
      } else if (type === "recipe") {
        if (!recipeId)
          return res.status(400).send({ message: "Recipe ID required" });
        const recipe = await db
          .collection("recipes")
          .findOne({ _id: new ObjectId(recipeId) });

        const alreadyPurchased = await db.collection("payments").findOne({
          userEmail: user.email,
          recipeId: new ObjectId(recipeId),
          paymentStatus: "succeeded",
        });
        if (alreadyPurchased)
          return res.status(400).send({ message: "Already purchased" });

        metadata.recipeId = recipeId;
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Recipe: ${recipe.recipeName}`,
                description: `Unlock instructions for ${recipe.recipeName}`,
              },
              unit_amount: 499,
            },
            quantity: 1,
          },
        ];
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        metadata,
        success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}&type=${type}${recipeId ? "&recipeId=" + recipeId : ""}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard`,
      });

      res.send({ id: session.id, url: session.url });
    } catch (error) {
      res.status(500).send({ message: "Stripe session crash" });
    }
  },
);

// Confirm checkout payment
router.post("/payments/confirm", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== "paid")
      return res.status(400).send({ message: "Invalid session" });

    const db = getDB();
    const transactionId = session.payment_intent;

    const existing = await db.collection("payments").findOne({ transactionId });
    if (existing)
      return res.send({
        success: true,
        alreadyProcessed: true,
        payment: existing,
      });

    const paymentDoc = {
      userEmail: session.metadata.userEmail,
      userId: session.metadata.userId,
      amount: session.amount_total / 100,
      recipeId: session.metadata.recipeId
        ? new ObjectId(session.metadata.recipeId)
        : null,
      transactionId,
      paymentStatus: "succeeded",
      paidAt: new Date(session.created * 1000),
    };

    await db.collection("payments").insertOne(paymentDoc);

    if (session.metadata.type === "premium") {
      await db
        .collection("users")
        .updateOne(
          { email: session.metadata.userEmail },
          { $set: { isPremium: true, updatedAt: new Date() } },
        );
    }

    res.send({ success: true, payment: paymentDoc });
  } catch (error) {
    res.status(500).send({ message: "Confirmation failed" });
  }
});

// Get purchased recipes
router.get("/payments/purchased", verifyToken, async (req, res) => {
  const purchases = await getDB()
    .collection("payments")
    .aggregate([
      {
        $match: {
          userEmail: req.user.email,
          recipeId: { $ne: null },
          paymentStatus: "succeeded",
        },
      },
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
          amount: 1,
          transactionId: 1,
          paidAt: 1,
          recipe: {
            recipeName: "$recipeDetails.recipeName",
            recipeImage: "$recipeDetails.recipeImage",
            category: "$recipeDetails.category",
            cuisineType: "$recipeDetails.cuisineType",
            preparationTime: "$recipeDetails.preparationTime",
            authorName: "$recipeDetails.authorName",
          },
        },
      },
    ])
    .toArray();
  res.send(purchases);
});

router.get(
  "/payments/check-purchase/:recipeId",
  verifyToken,
  async (req, res) => {
    const purchase = await getDB()
      .collection("payments")
      .findOne({
        userEmail: req.user.email,
        recipeId: new ObjectId(req.params.recipeId),
        paymentStatus: "succeeded",
      });
    res.send({ purchased: !!purchase });
  },
);

module.exports = router;
