const jwt = require("jsonwebtoken");
const { User } = require("../models");
const bcrypt = require("bcrypt");

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Debug crucial
    console.log("Tentative de connexion pour:", email);
    console.log("Données reçues:", { email, role });

    // Normalisation de l'email
    const normalizedEmail = email.toLowerCase().trim();

    // Recherche de l'utilisateur SANS filtrer par rôle
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      console.log("Utilisateur non trouvé");
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    // Comparaison DEBUG du mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Résultat comparaison:", {
      input: password,
      hash: user.password,
      match: isMatch
    });

    if (!isMatch) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    // Vérification optionnelle du rôle
    if (role && user.role !== role) {
      console.log("Conflit de rôle:", {
        demandé: role,
        actuel: user.role
      });
      return res.status(403).json({ message: "Accès refusé pour ce rôle" });
    }

    // Génération du token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "168h" }
    );

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      token
    });

  } catch (error) {
    console.error("Erreur auth complète:", error);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// [Keep register and me methods unchanged...]

// Register controller (admin only can register new users)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nom, email et mot de passe requis" })
    }

    // Check if user is admin (from middleware)
    if (req.user && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès non autorisé" })
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } })

    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé" })
    }

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password, // Will be hashed by model hook
      role: role || "student", // Default to student if not specified
    })

    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    })
  } catch (error) {
    console.error("Register error:", error)
    res.status(500).json({ message: "Erreur lors de l'inscription" })
  }
}

// Get current user info
exports.me = async (req, res) => {
  try {
    const userId = req.user.id

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password"] },
    })

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    res.status(200).json(user)
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ message: "Erreur lors de la récupération des informations utilisateur" })
  }
}
