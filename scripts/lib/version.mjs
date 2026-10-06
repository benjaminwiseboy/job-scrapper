// App version (package.json is the single source) and the GitHub repository
// its releases are published to. Writes nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Null when missing or unreadable: an odd previous install must never block a new one.
export function readPackage(root) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

export function appVersion(root) {
  return readPackage(root)?.version ?? null;
}

// "owner/name" from package.json's repository field.
export function releaseRepo(root) {
  const repo = readPackage(root)?.repository;
  const url = String(repo?.url ?? repo ?? "");
  return url.match(/github(?:\.com)?[:/]+([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] ?? null;
}

// Semver order: 1.2.0 < 1.10.0, and 1.2.0-beta.1 < 1.2.0. Negative when a < b.
export function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre = ""] = String(v).replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number(n) || 0), pre };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, "en", { numeric: true });
}

// Latest published release (drafts and pre-releases excluded by GitHub).
// Never throws: offline or rate-limited, it reports the error instead.
export async function latestRelease(repo) {
  if (!repo) return { latest: null, error: "dépôt inconnu (champ repository de package.json)" };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { "User-Agent": "veille-emploi", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return { latest: null, error: "aucune version publiée" };
    if (!res.ok) return { latest: null, error: `GitHub a répondu ${res.status}` };
    const { tag_name } = await res.json();
    return { latest: String(tag_name).replace(/^v/, "") };
  } catch (e) {
    return { latest: null, error: e.name === "TimeoutError" ? "GitHub injoignable" : e.message };
  }
}
