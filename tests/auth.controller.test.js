const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { User } = require("../src/models");
const authController = require("../src/controllers/auth");

// Mock des modules
jest.mock("jsonwebtoken");
jest.mock("../src/models", () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Op: { // Déplacer la définition de Op à l'intérieur du mock
    ne: Symbol('ne') // Utiliser Symbol directement au lieu de Op.ne
  }
}));

describe("Auth Controller", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    process.env.JWT_SECRET = "test-secret";
  });

  describe("login", () => {
    test("should return 400 if email or password is missing", async () => {
      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Email et mot de passe requis" });
    });

    test("should return 401 if user is not found", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      User.findOne.mockResolvedValue(null);

      await authController.login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({
        where: {
          email: "test@example.com",
          role: { [Op.ne]: null }, // Op est maintenant disponible via le mock
        },
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Email, mot de passe ou rôle incorrect" });
    });

    test("should return 401 if password is invalid", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      
      const mockUser = {
        id: 1,
        email: "test@example.com",
        role: "student",
        checkPassword: jest.fn().mockResolvedValue(false)
      };
      
      User.findOne.mockResolvedValue(mockUser);

      await authController.login(req, res);

      expect(mockUser.checkPassword).toHaveBeenCalledWith("password123");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Email, mot de passe ou rôle incorrect" });
    });

    test("should return user data and token if login is successful", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      
      const mockUser = {
        id: 1,
        name: "Test User",
        email: "test@example.com",
        role: "student",
        checkPassword: jest.fn().mockResolvedValue(true)
      };
      
      User.findOne.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue("fake-jwt-token");

      await authController.login(req, res);

      expect(mockUser.checkPassword).toHaveBeenCalledWith("password123");
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          id: 1,
          email: "test@example.com",
          role: "student",
          name: "Test User"
        },
        "test-secret",
        { expiresIn: "24h" }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 1,
        name: "Test User",
        email: "test@example.com",
        role: "student",
        token: "fake-jwt-token"
      });
    });
  });
});