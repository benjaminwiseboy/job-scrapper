// Where the local profile registry lives, shared by veille-config.mjs and
// setup.mjs. Outside the app on purpose: it must survive updates.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.VEILLE_HOME || join(homedir(), ".veille-emploi");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return { active: null, profiles: {} };
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  return { active: raw.active || null, profiles: raw.profiles || {} };
}

export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

// Third-party API keys (Hunter...) live in their own file, beside the registry
// but never inside it, so that printing a profile can't leak them. An
// environment variable (HUNTER_API_KEY for "hunter") overrides the file.
export const SECRETS_PATH = join(CONFIG_DIR, "secrets.json");

function loadSecrets() {
  if (!existsSync(SECRETS_PATH)) return {};
  return JSON.parse(readFileSync(SECRETS_PATH, "utf8"));
}

export function getSecret(name) {
  return process.env[`${name.toUpperCase()}_API_KEY`] || loadSecrets()[name] || null;
}

export function setSecret(name, value) {
  const secrets = loadSecrets();
  if (value) secrets[name] = value;
  else delete secrets[name];
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });
}

export function defaultWorkspace(id) {
  const docs = join(homedir(), "Documents");
  return join(existsSync(docs) ? docs : homedir(), "Veille-Emploi", id);
}
