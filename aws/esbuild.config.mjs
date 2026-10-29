// Bundles each handler to dist/<name>/index.mjs (the dirs terraform zips).
import { build } from "esbuild";

const handlers = [
  "vod-transcode",
  "vod-status",
  "audio-api",
  "telemetry-ingest",
  "telemetry-consumer",
];

await Promise.all(
  handlers.map((name) =>
    build({
      entryPoints: [`handlers/${name}/index.ts`],
      outfile: `dist/${name}/index.mjs`,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      sourcemap: false,
      minify: true,
      // AWS SDK v3 ships in the Lambda nodejs22.x runtime; keep it external
      // to keep bundles small and cold starts fast.
      external: ["@aws-sdk/*"],
      banner: {
        js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
      },
      logLevel: "info",
    }),
  ),
);
