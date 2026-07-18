import assert from "node:assert/strict";
import test from "node:test";
import { isViewAuthorized } from "../src/security.js";

test("BRAIN_ALLOW_UNPROTECTED_VIEW bypasses configured view password", () => {
  withViewSecurityEnv(
    {
      BRAIN_ALLOW_UNPROTECTED_VIEW: "true",
      BRAIN_VIEW_PASSWORD_HASH: "sha256:salt:hash"
    },
    () => {
      assert.equal(isViewAuthorized(createRequest()), true);
    }
  );
});

test("configured view password still protects the view by default", () => {
  withViewSecurityEnv(
    {
      BRAIN_VIEW_PASSWORD_HASH: "sha256:salt:hash"
    },
    () => {
      assert.equal(isViewAuthorized(createRequest()), false);
    }
  );
});

function createRequest() {
  return {
    url: "/",
    headers: {}
  };
}

function withViewSecurityEnv(values, callback) {
  const keys = [
    "BRAIN_ALLOW_UNPROTECTED_VIEW",
    "BRAIN_VIEW_PASSWORD_HASH",
    "BRAIN_VIEW_PASSWORD",
    "VIEW_PASSWORD_HASH",
    "VIEW_PASSWORD"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}
