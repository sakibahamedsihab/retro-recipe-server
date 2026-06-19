const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("Error: MONGODB_URI is not defined in the environment");
  process.exit(1);
}

const client = new MongoClient(uri);
let dbInstance = null;

async function connectDB() {
  if (dbInstance) return dbInstance;

  try {
    await client.connect();
    console.log("Connected to MongoDB...");
    dbInstance = client.db(process.env.DB_NAME || "retro-recipe-db");
    return dbInstance;
  } catch (error) {
    console.error("Failed to connect to MongoDB: ", error);
  }
}

module.exports = { connectDB };
