const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send({ status: "healthy", message: "Retro Recipe Server is running!" });
});

app.listen(PORT, () => {
  console.log(`Retro Server is listening on port ${PORT}`);
});
