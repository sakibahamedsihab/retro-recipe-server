// make-admin.js — Run this ONCE to promote a user to admin
// Usage: node make-admin.js your@email.com

require("dotenv").config();
const { MongoClient } = require("mongodb");

const email = process.argv[2];

if (!email) {
  console.error("❌ Please provide an email: node make-admin.js your@email.com");
  process.exit(1);
}

async function makeAdmin() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "retro-recipe-db");
    const users = db.collection("users");

    let user = await users.findOne({ email });
    
    if (!user) {
      // Fallback: Check the singular "user" collection (better-auth)
      const authUser = await db.collection("user").findOne({ email });
      if (!authUser) {
        console.error(`❌ No user found with email: ${email} in either 'users' or 'user' collections.`);
        process.exit(1);
      }
      
      // Auto-create/sync user to the "users" collection
      console.log(`ℹ️ User found in better-auth 'user' collection. Syncing to 'users' collection...`);
      const newUser = {
        name: authUser.name || email.split("@")[0],
        email,
        image: authUser.image || "",
        role: "admin",
        isBlocked: false,
        isPremium: false,
        createdAt: authUser.createdAt || new Date(),
        updatedAt: new Date(),
      };
      
      await db.collection("users").insertOne(newUser);
      console.log(`✅ Success! "${newUser.name}" (${email}) has been synchronized and is now an ADMIN.`);
    } else {
      // Update existing user in the plural users collection
      await users.updateOne(
        { email },
        { $set: { role: "admin", updatedAt: new Date() } }
      );
      console.log(`✅ Success! "${user.name}" (${email}) is now an ADMIN.`);
    }
    console.log(`   Log in at http://localhost:3000/login to access the Admin Panel.`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
  }
}

makeAdmin();
