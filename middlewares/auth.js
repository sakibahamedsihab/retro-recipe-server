const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden: Invalid token" });
    }

    req.user = decoded;
    next();
  });
}

function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .send({ message: "Forbidden: Admin access required" });
  }
  next();
}

module.exports = { verifyToken, verifyAdmin };
