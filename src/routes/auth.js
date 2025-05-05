const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const { verifyToken } = require("../middlewares/auth");

// Public routes
router.post("/login", authController.login); // Changé de "/auth/login" à "/login"

// Protected routes
router.post("/register", verifyToken, authController.register);
router.get("/me", verifyToken, authController.me);

module.exports = router;