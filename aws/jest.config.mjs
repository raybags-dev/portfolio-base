/** @type {import('jest').Config} */
export default {
  // @swc/jest: fast, and its ESM/CJS interop does not hit the ts-jest
  // "module is already linked" dual-package hazard with zod/express.
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  // audio-api runs in CJS mode (see jest.config.cjs.mjs) - jest's experimental
  // VM ESM loader chokes on its express+zod graph ("module is already linked").
  testPathIgnorePatterns: ["audio-api\\.test\\.ts"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Allow ESM-style ".js" suffixes in TS imports.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        sourceMaps: "inline",
        module: { type: "es6" },
        jsc: {
          parser: { syntax: "typescript" },
          target: "es2022",
        },
      },
    ],
  },
};
