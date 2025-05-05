const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

// Mock des modules
jest.mock("jsonwebtoken");
jest.mock("../src/models", () => {
  const mockUser = {
    id: 1,
    email: "test@example.com",
    role: "student",
    checkPassword: jest.fn()
  };
  
  return {
    User: {
      findOne: jest.fn(() => mockUser),
      create: jest.fn(),
    },
    Op: {
      ne: Symbol('ne')
    }
  };
});

const { User } = require("../src/models");
const authController = require("../src/controllers/auth");

describe("Auth Controller", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    process.env.JWT_SECRET = "test-secret";
    
    // Configuration par défaut du mock User
    User.findOne.mockImplementation(() => ({
      id: 1,
      email: "test@example.com",
      role: "student",
      checkPassword: jest.fn().mockResolvedValue(true)
    }));
  });

  describe("login", () => {
    test("should return 400 if email or password is missing", async () => {
      // Test 1: Email manquant
      req.body = { password: "password123" };
      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Test 2: Password manquant
      req.body = { email: "test@example.com" };
      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("should return 401 if user is not found", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      User.findOne.mockResolvedValueOnce(null);

      await authController.login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({
        where: {
          email: "test@example.com",
          role: { [Op.ne]: null },
        },
      });
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("should return 401 if password is invalid", async () => {
      req.body = { email: "test@example.com", password: "wrongpassword" };
      const mockUser = {
        id: 1,
        email: "test@example.com",
        role: "student",
        checkPassword: jest.fn().mockResolvedValue(false)
      };
      User.findOne.mockResolvedValueOnce(mockUser);

      await authController.login(req, res);

      expect(mockUser.checkPassword).toHaveBeenCalledWith("wrongpassword");
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("should return user data and token if login is successful", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      const mockToken = "fake-jwt-token";
      jwt.sign.mockReturnValue(mockToken);

      await authController.login(req, res);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          role: "student"
        }),
        "test-secret",
        { expiresIn: "24h" }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          token: mockToken
        })
      );
    });
  });
});