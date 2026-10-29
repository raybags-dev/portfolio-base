// audio-api: API Gateway HTTP API -> Express via serverless-http.
// Routes: GET /tracks, GET /tracks/:id, POST /tracks (admin), PATCH /tracks/:id/progress

import serverless from "serverless-http";
import { createApp } from "./app.js";

// No basePath: with the API GW $default stage the rawPath already matches the
// express routes ("/tracks", ...). basePath:"/" would strip the leading slash
// and every route would 404 into the catch-all.
const handler = serverless(createApp());

export { handler };
