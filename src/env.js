import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadLocalEnv(file = ".env.local") {
  const envFile = path.resolve(process.cwd(), file);
  if (!existsSync(envFile)) return;
  const text = readFileSync(envFile, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] != null) continue;
    process.env[key] = unquoteEnvValue(match[2]);
  }
}

function unquoteEnvValue(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
