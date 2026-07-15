export function isVercelRuntime(env = process.env) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}

export function hasRedisStorageEnv(env = process.env) {
  return Boolean(
    (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) ||
      (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  );
}

export function missingRequiredRedisOnVercel(env = process.env) {
  return isVercelRuntime(env) && !hasRedisStorageEnv(env);
}

export function missingRedisMessage() {
  return [
    "Redis/KV storage is required on Vercel.",
    "Install Upstash Redis from the Vercel Marketplace, ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL and KV_REST_API_TOKEN are present, then create a new deployment."
  ].join(" ");
}
