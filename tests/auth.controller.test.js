const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { User } = require("../src/models");
const authController = require("../src/controllers/auth");


// Mock des modules
jest.mock("jsonwebtoken");
jest.mock("bcrypt");
jest.mock("../src/models", () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn()
  },
}));


describe("Auth Controller", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      user: { role: "admin", id: 1 }, // pour le test de register et me
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    process.env.JWT_SECRET = "test-secret";
  });

  describe("login", () => {
    test("should return 401 if user is not found", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      User.findOne.mockResolvedValue(null);

      await authController.login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: "test@example.com" }
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Identifiants incorrects" });
    });

    test("should return 401 if password is invalid", async () => {
      req.body = { email: "test@example.com", password: "wrongpass" };
      const mockUser = {
        id: 1,
        email: "test@example.com",
        password: "hashed-password",
        role: "student",
      };
      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith("wrongpass", "hashed-password");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Identifiants incorrects" });
    });

    test("should return 403 if role does not match", async () => {
      req.body = { email: "test@example.com", password: "password123", role: "admin" };
      const mockUser = {
        id: 1,
        email: "test@example.com",
        password: "hashed-password",
        role: "student",
      };
      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Accès refusé pour ce rôle" });
    });

    
  });
});

	
