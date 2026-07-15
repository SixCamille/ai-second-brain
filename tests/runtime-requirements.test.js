import assert from "node:assert/strict";
import test from "node:test";
import { missingRequiredRedisOnVercel } from "../src/runtime-requirements.js";

test("Redis is required only on Vercel runtime", () => {
  assert.equal(missingRequiredRedisOnVercel({}), false);
  assert.equal(missingRequiredRedisOnVercel({ VERCEL: "1" }), true);
  assert.equal(
    missingRequiredRedisOnVercel({
      VERCEL: "1",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token"
    }),
    false
  );
  assert.equal(
    missingRequiredRedisOnVercel({
      VERCEL_ENV: "production",
      KV_REST_API_URL: "https://example.kv.vercel-storage.com",
      KV_REST_API_TOKEN: "token"
    }),
    false
  );
});
