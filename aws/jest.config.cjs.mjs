/** @type {import('jest').Config} */
// CJS-mode config for the audio-api suite: the experimental VM ESM loader
// ("module is already linked") chokes on the express + zod + aws-sdk graph;
// CJS is jest's rock-solid path. The handler source stays ESM — the
// transform compiles it to CJS for the test run.
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/audio-api.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        sourceMaps: "inline",
        module: { type: "commonjs" },
        jsc: {
          parser: { syntax: "typescript" },
          target: "es2022",
        },
      },
    ],
  },
};
