const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const { sequelize } = require("./models");
const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3002

// Middlewares
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));

// Routes
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Auth service is running" });
});

app.use("/api", authRoutes);
app.use("/api/students", studentRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: "error", message: "Something went wrong!" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// Database connection and admin reset
const { User } = require("./models");
const bcrypt = require("bcrypt");

async function initializeServer() {
  try {
    // Synchroniser la base de données
    await sequelize.sync({ alter: process.env.NODE_ENV === "development" });
    console.log("Database connected");

    // Réinitialisation du compte admin
    const hashedPassword = await bcrypt.hash("admin123", 10);
    console.log("Nouveau hash généré pour admin:", hashedPassword);
    
    await User.upsert({
      email: "admin@iset.tn",
      password: hashedPassword,
      role: "admin",
      name: "Administrateur"
    });
    
    console.log("Compte admin réinitialisé avec succès");

    // Démarrer le serveur
    const server = app.listen(PORT, () => {
      console.log(`Auth service running on port ${PORT}`);
    });
    
    server.keepAliveTimeout = 10000;

  } catch (error) {
    console.error("Initialization error:", error);
    process.exit(1);
  }
}

// Démarrer l'application
initializeServer();

module.exports = app;