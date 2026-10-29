import { optionalEnv, requireEnv, requireEnvInt } from "../../shared/config.js";

describe("config validation (crash-fast)", () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });

  afterAll(() => {
    process.env = ORIGINAL;
  });

  it("requireEnv returns the value when set", () => {
    process.env["X_TEST"] = "abc";
    expect(requireEnv("X_TEST")).toBe("abc");
  });

  it("requireEnv throws a clear error when missing or blank", () => {
    delete process.env["X_TEST"];
    expect(() => requireEnv("X_TEST")).toThrow("Missing required environment variable: X_TEST");
    process.env["X_TEST"] = "   ";
    expect(() => requireEnv("X_TEST")).toThrow("Missing required environment variable");
  });

  it("optionalEnv falls back when unset", () => {
    delete process.env["X_TEST"];
    expect(optionalEnv("X_TEST", "fb")).toBe("fb");
    process.env["X_TEST"] = "v";
    expect(optionalEnv("X_TEST", "fb")).toBe("v");
  });

  it("requireEnvInt parses integers and rejects garbage", () => {
    process.env["X_INT"] = "42";
    expect(requireEnvInt("X_INT")).toBe(42);
    process.env["X_INT"] = "4.5x";
    expect(() => requireEnvInt("X_INT")).toThrow("must be an integer");
  });
});
