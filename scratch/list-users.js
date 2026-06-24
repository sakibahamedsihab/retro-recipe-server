require("dotenv").config();
const { MongoClient } = require("mongodb");

async function listUsers() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "retro-recipe-db");
    
    console.log("Listing users from 'users' collection:");
    const users = await db.collection("users").find({}).toArray();
    for (const u of users) {
      console.log(`Email: ${u.email}, Name: ${u.name}, Role: ${u.role}, isPremium: ${u.isPremium}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

listUsers();
