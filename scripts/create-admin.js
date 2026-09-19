// Usage: node scripts/create-admin.js <username> <password>
// Hashes the password and writes ADMIN_USERNAME / ADMIN_PASSWORD_HASH /
// SESSION_SECRET into .env — this file is never sent to the browser and is
// already excluded from git via .gitignore.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error("Usage: node scripts/create-admin.js <username> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password should be at least 8 characters.");
  process.exit(1);
}

const ENV_PATH = path.join(__dirname, "..", ".env");

let existing = {};
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) existing[match[1]] = match[2];
  });
}

const hash = bcrypt.hashSync(password, 12);
const sessionSecret = existing.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const updated = {
  ...existing,
  ADMIN_USERNAME: username,
  ADMIN_PASSWORD_HASH: hash,
  SESSION_SECRET: sessionSecret,
};

const out = Object.entries(updated)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");

fs.writeFileSync(ENV_PATH, out + "\n", "utf8");

console.log(`Admin account saved for username "${username}".`);
console.log("Log in at /admin/login after starting the server (npm start).");
