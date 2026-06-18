const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // স্ট্রাইপ এসডিকে ইনিশিয়ালাইজেশন
const { verifyToken } = require("../middlewares/auth");

// ১. স্ট্রাইপ চেকআউট সেশন তৈরি করা (POST /api/payments/create-checkout-session)
router.post(
  "/payments/create-checkout-session",
  verifyToken,
  async (req, res) => {
    try {
      const { type, recipeId } = req.body; // type হতে পারে 'premium' অথবা 'recipe'
      if (!type)
        return res.status(400).json({ message: "Payment type is required" });

      const db = req.app.get("db");
      const user = await db
        .collection("users")
        .findOne({ email: req.user.email });
      if (!user) return res.status(404).json({ message: "User not found" });

      let lineItems = [];
      // স্ট্রাইপ সেশনের ভেতর মেটাডেটা ট্র্যাকিং এর জন্য অবজেক্ট
      let metadata = {
        type,
        userEmail: user.email,
        userId: user._id.toString(),
      };

      // ক) প্রিমিয়াম মেম্বারশিপের হিসাব
      if (type === "premium") {
        if (user.isPremium)
          return res
            .status(400)
            .json({ message: "User is already a premium member" });

        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Retro RecipeHub Premium Membership",
                description:
                  "Unlock unlimited recipe uploads and get a sleek retro premium badge!",
              },
              unit_amount: 1499, // সেন্টে হিসাব করা হয় ($14.99)
            },
            quantity: 1,
          },
        ];
      }
      // খ) সিঙ্গেল রেসিপি পারচেজের হিসাব
      else if (type === "recipe") {
        if (!recipeId)
          return res
            .status(400)
            .json({ message: "Recipe ID is required for recipe purchase" });

        const recipe = await db
          .collection("recipes")
          .findOne({ _id: new ObjectId(recipeId) });
        if (!recipe)
          return res.status(404).json({ message: "Recipe not found" });

        // অলরেডি পারচেজ করা আছে কিনা চেক করা
        const alreadyPurchased = await db.collection("payments").findOne({
          userEmail: user.email,
          recipeId: new ObjectId(recipeId),
          paymentStatus: "succeeded",
        });
        if (alreadyPurchased)
          return res
            .status(400)
            .json({ message: "You have already purchased this recipe" });

        metadata.recipeId = recipeId;
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Recipe: ${recipe.recipeName}`,
                description: `Unlock full instructions for "${recipe.recipeName}" by ${recipe.authorName}`,
              },
              unit_amount: 499, // সেন্টে হিসাব করা হয় ($4.99)
            },
            quantity: 1,
          },
        ];
      } else {
        return res.status(400).json({ message: "Invalid payment type" });
      }

      // স্ট্রাইপ গেটওয়েতে সেশন রিকোয়েস্ট পাঠানো
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        metadata, // আমাদের কাস্টম ট্র্যাকিং ডেটা স্ট্রাইপের ঘরে জমা থাকবে
        success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}&type=${type}${recipeId ? "&recipeId=" + recipeId : ""}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard`,
      });

      res.json({ id: session.id, url: session.url });
    } catch (error) {
      console.error("Error creating Stripe session:", error);
      res.status(500).json({ message: "Stripe integration failed" });
    }
  },
);

// ২. পেমেন্ট কনফার্মেশন এবং ডাটাবেজ আপডেট (POST /api/payments/confirm)
router.post("/payments/confirm", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId)
      return res.status(400).json({ message: "Session ID is required" });

    // স্ট্রাইপ থেকে সেশনের রিয়েল ডেটা রিট্রিভ করা (সুরক্ষার জন্য)
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ message: "Session not paid or invalid" });
    }

    const db = req.app.get("db");
    const transactionId = session.payment_intent; // ইউনিক ট্রানজেকশন আইডি

    // ডাবল সাবমিশন ঠেকাতে চেক করা (ইডিমপোটেন্সি)
    const existing = await db.collection("payments").findOne({ transactionId });
    if (existing) {
      return res.json({
        success: true,
        alreadyProcessed: true,
        payment: existing,
      });
    }

    // নতুন পেমেন্ট ডকুমেন্ট তৈরি
    const paymentDoc = {
      userEmail: session.metadata.userEmail,
      userId: session.metadata.userId,
      amount: session.amount_total / 100, // সেন্ট থেকে ডলারে রূপান্তর
      recipeId: session.metadata.recipeId
        ? new ObjectId(session.metadata.recipeId)
        : null,
      transactionId,
      paymentStatus: "succeeded",
      paidAt: new Date(session.created * 1000),
    };

    await db.collection("payments").insertOne(paymentDoc);

    // যদি প্রিমিয়াম মেম্বারশিপ হয়, ইউজারের প্রোফাইলে মেম্বারশিপ ট্রু করে দেওয়া
    if (session.metadata.type === "premium") {
      await db
        .collection("users")
        .updateOne(
          { email: session.metadata.userEmail },
          { $set: { isPremium: true, updatedAt: new Date() } },
        );
    }

    res.json({ success: true, payment: paymentDoc });
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({ message: "Payment confirmation failed" });
  }
});

module.exports = router;
