require("dotenv").config();
const { MongoClient } = require("mongodb");

async function checkAllDatabases() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    
    // List all databases
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();
    console.log("Databases on this MongoDB connection:");
    
    for (const dbInfo of databases) {
      const name = dbInfo.name;
      if (["admin", "local", "config"].includes(name)) continue;
      
      console.log(`\n--- Database: ${name} ---`);
      const db = client.db(name);
      const collections = await db.listCollections().toArray();
      const colNames = collections.map(c => c.name);
      console.log("Collections:", colNames);
      
      if (colNames.includes("users")) {
        const u = await db.collection("users").findOne({ email: "admin@gmail.com" });
        if (u) {
          console.log(`Found admin@gmail.com in 'users' collection: Name=${u.name}, Role=${u.role}`);
        } else {
          console.log(`admin@gmail.com NOT found in 'users' collection`);
        }
      }
      
      if (colNames.includes("user")) {
        const u = await db.collection("user").findOne({ email: "admin@gmail.com" });
        if (u) {
          console.log(`Found admin@gmail.com in 'user' (better-auth) collection: Name=${u.name}, Role=${u.role}`);
        } else {
          console.log(`admin@gmail.com NOT found in 'user' collection`);
        }
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

checkAllDatabases();
