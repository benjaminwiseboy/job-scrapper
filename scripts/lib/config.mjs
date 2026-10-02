// Where the local profile registry lives, shared by veille-config.mjs and
// setup.mjs. Outside the plugin on purpose: it must survive plugin updates.
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

export function defaultWorkspace(id) {
  const docs = join(homedir(), "Documents");
  return join(existsSync(docs) ? docs : homedir(), "Veille-Emploi", id);
}
