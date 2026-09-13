#!/usr/bin/env node
/**
 * Write one version's complete CHANGELOG.md section to standard output.
 *
 * Usage: node .github/scripts/extract-changelog-section.mjs v1.2.3
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function extractChangelogSection(markdown, version) {
  const lines = markdown.split(/\r?\n/u);
  const heading = new RegExp(`^##\\s+\\[?${escapeRegExp(version)}\\]?(?:\\s+-.*)?$`, "u");
  const start = lines.findIndex((line) => heading.test(line));

  if (start < 0) return null;

  const after = lines.slice(start + 1).findIndex((line) => /^##\s+/u.test(line));
  const end = after < 0 ? lines.length : start + 1 + after;
  return lines.slice(start, end).join("\n");
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error("Usage: extract-changelog-section.mjs <tag>");
    process.exit(1);
  }

  const version = tag.replace(/^v/u, "");
  const section = extractChangelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
  if (section === null) {
    console.error(`No CHANGELOG.md section found for ${tag}.`);
    process.exit(1);
  }

  process.stdout.write(section);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
