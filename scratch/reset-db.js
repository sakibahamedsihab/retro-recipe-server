require("dotenv").config();
const { MongoClient } = require("mongodb");

async function resetDB() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const dbName = process.env.DB_NAME || "retro-recipe-db";
    
    console.log(`⚠️ Warning: You are about to drop the database: "${dbName}"`);
    console.log(`Connecting to database and dropping it...`);
    
    const db = client.db(dbName);
    await db.dropDatabase();
    
    console.log(`\n✅ Success! The database "${dbName}" has been deleted.`);
    console.log(`A fresh database and its collections will be recreated automatically next time you run the app and sign up or add recipes.`);
  } catch (err) {
    console.error("❌ Error dropping database:", err);
  } finally {
    await client.close();
  }
}

resetDB();
