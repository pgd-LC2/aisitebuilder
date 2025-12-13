import fs from "node:fs";
import path from "node:path";

const info = {
  context: process.env.CONTEXT || "local",
  pr: process.env.REVIEW_ID || null,
  sha: (process.env.COMMIT_REF || "").slice(0, 7) || null,
  deployUrl: process.env.DEPLOY_URL || null,
  deployPrimeUrl: process.env.DEPLOY_PRIME_URL || null,
  builtAt: new Date().toISOString(),
};

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync(path.join("public", "version.json"), JSON.stringify(info, null, 2));
console.log("version.json written:", info);
