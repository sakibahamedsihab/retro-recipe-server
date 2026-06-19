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

    const user = await users.findOne({ email });
    if (!user) {
      console.error(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    await users.updateOne(
      { email },
      { $set: { role: "admin", updatedAt: new Date() } }
    );

    console.log(`✅ Success! "${user.name}" (${email}) is now an ADMIN.`);
    console.log(`   Log in at http://localhost:3000/login to access the Admin Panel.`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
  }
}

makeAdmin();
