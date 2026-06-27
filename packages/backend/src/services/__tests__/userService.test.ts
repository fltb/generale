import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/client";
import { UserService } from "../userService";

// Mock the entire db client module
vi.mock("../../db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    run: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

// Mock the crypto module for deterministic salts
vi.mock("crypto", async (importOriginal) => {
  const actualCrypto = await importOriginal<typeof import("crypto")>();
  return {
    ...actualCrypto,
    randomBytes: () => Buffer.from("salt123456789012"), // Deterministic salt
    timingSafeEqual: vi.fn((a, b) => a.equals(b)),
  };
});

// We no longer need to mock 'bun' as the test will be more flexible.

describe("UserService", () => {
  let userService: UserService;
  const mockDb = db as unknown as {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    values: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks(); // Reset mocks before each test
  });

  describe("Password Hashing and Verification", () => {
    it("should hash a password and be able to verify it", () => {
      const password = "mySecurePassword123";
      const hashedPassword = (userService as unknown as { hashPassword: (password: string) => string }).hashPassword(password);

      expect(hashedPassword).toBeTypeOf("string");
      expect(hashedPassword.includes("$")).toBe(true);

      const isVerified = userService.verifyPassword(password, hashedPassword);
      expect(isVerified).toBe(true);
    });

    it("should fail to verify an incorrect password", () => {
      const password = "mySecurePassword123";
      const incorrectPassword = "wrongPassword";
      const hashedPassword = (userService as unknown as { hashPassword: (password: string) => string }).hashPassword(password);

      const isVerified = userService.verifyPassword(incorrectPassword, hashedPassword);
      expect(isVerified).toBe(false);
    });

    it("should handle invalid stored hash format", () => {
      expect(userService.verifyPassword("any", "invalidformat")).toBe(false);
    });
  });

  describe("User CRUD Operations", () => {
    // 👇 THIS IS THE CORRECTED TEST CASE
    it("should create a new user", async () => {
      const userData = { username: "tester", email: "test@example.com", password: "password" };
      const user = await userService.create(userData.username, userData.password, userData.email);

      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object)); // users table

      // Check that `values` was called with an object that has the correct shape
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String), // Accept any string for the ID
          username: userData.username,
          email: userData.email,
          password: expect.any(String),
          verified: false,
        }),
      );
      expect(mockDb.run).toHaveBeenCalled();

      // Check the returned user object
      expect(user.id).toEqual(expect.any(String)); // Check that an ID was returned
      expect(user.username).toBe(userData.username);
    });

    it("should find a user by id", async () => {
      const dbRow = {
        id: "user-1",
        username: "tester",
        email: "e@e.com",
        password: "hash",
        verified: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockDb.get.mockResolvedValue(dbRow);

      const user = await userService.findById("user-1");

      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(user).toBeDefined();
      expect(user?.id).toBe(dbRow.id);
      expect(user?.verified).toBe(true); // check mapping
    });

    it("should return undefined if user is not found by id", async () => {
      mockDb.get.mockResolvedValue(undefined);
      const user = await userService.findById("not-found");
      expect(user).toBeUndefined();
    });

    it("should find a user by username", async () => {
      const dbRow = {
        id: "user-1",
        username: "tester",
        email: "e@e.com",
        password: "hash",
        verified: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockDb.get.mockResolvedValue(dbRow);
      const user = await userService.findByUsername("tester");
      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(user).toBeDefined();
      expect(user?.username).toBe("tester");
      expect(user?.verified).toBe(false); // check mapping
    });

    it("should find a user by email", async () => {
      const dbRow = {
        id: "user-1",
        username: "tester",
        email: "e@e.com",
        password: "hash",
        verified: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockDb.get.mockResolvedValue(dbRow);
      const user = await userService.findByEmail("e@e.com");
      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(user).toBeDefined();
      expect(user?.email).toBe("e@e.com");
    });

    it("should mark a user as verified", async () => {
      await userService.markVerified("user-1");
      expect(mockDb.update).toHaveBeenCalledWith(expect.any(Object)); // users table
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          verified: true,
          updatedAt: expect.any(Date),
        }),
      );
      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.run).toHaveBeenCalled();
    });

    it("should update a user password", async () => {
      const hashSpy = vi.spyOn(userService as unknown as { hashPassword: (password: string) => string }, "hashPassword");
      await userService.updatePassword("user-1", "new-password");

      expect(hashSpy).toHaveBeenCalledWith("new-password");
      expect(mockDb.update).toHaveBeenCalledWith(expect.any(Object));
      expect(mockDb.set).toHaveBeenCalledWith({ password: expect.any(String) });
      expect(mockDb.where).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.run).toHaveBeenCalled();
    });
  });
});
