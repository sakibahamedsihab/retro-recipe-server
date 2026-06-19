const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Error: MONGODB_URI is not defined in the environment.");
  process.exit(1);
}

const client = new MongoClient(uri);
let db = null;

async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    console.log(`Connected to MongoDB successfully! Database: ${process.env.DB_NAME || "default (test)"}`);
    db = client.db(process.env.DB_NAME);
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return db;
}

module.exports = {
  connectDB,
  getDB,
  client,
};
