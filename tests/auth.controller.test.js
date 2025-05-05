const jwt = require("jsonwebtoken");
const { User } = require("../src/models");
const authController = require("../src/controllers/auth");

// Mock des modules
jest.mock("jsonwebtoken");
jest.mock("../src/models", () => {
  const mockUser = {
    id: 1,
    email: "test@example.com",
    password: "hashedpassword",
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
  });

  describe("login", () => {
    test("should return 400 if email or password is missing", async () => {
      // Test sans email
      req.body = { password: "password123" };
      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      
      // Reset mocks
      jest.clearAllMocks();
      res.status.mockReturnThis();
      
      // Test sans password
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
          role: { [Symbol('ne')]: null },
        },
      });
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("should return 401 if password is invalid", async () => {
      req.body = { email: "test@example.com", password: "wrongpassword" };
      const mockUser = {
        ...User.findOne(),
        checkPassword: jest.fn().mockResolvedValue(false)
      };
      User.findOne.mockResolvedValueOnce(mockUser);

      await authController.login(req, res);

      expect(mockUser.checkPassword).toHaveBeenCalledWith("wrongpassword");
      expect(res.status).toHaveBeenCalledWith(401);
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
      User.findOne.mockResolvedValueOnce(mockUser);
      jwt.sign.mockReturnValue("fake-token");

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
    });
  });
});