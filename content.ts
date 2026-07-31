/**
 * The game's content pack, for tests that boot a real game.
 *
 * WHY THIS IS AWKWARD, said plainly rather than hidden. These tests do not check a
 * plugin's shape - they run its hooks against a real level generated from real Angband
 * 4.2.6 gamedata, because a staircase-reachability fix proven against a hand-built cave
 * is a fix proven against a fixture. That data is `packages/content/pack/*.json` in the
 * game's repository, and `@rpgm-tools/neo-angband-content` is not published: only the
 * engine and the mod SDK are on npm.
 *
 * So the pack is read from a SIBLING CHECKOUT of the game. Two ways, in order:
 *
 *   NEO_ANGBAND_REPO=/path/to/neo-angband   an explicit path, for CI
 *   ../neo-angband                          a sibling of this repository, for a desktop
 *
 * IT THROWS RATHER THAN SKIPPING. A suite that skips itself when its data is missing
 * reports green, and a green skipped suite is indistinguishable from a green passing one
 * in the only place anybody looks. So the failure is loud and it names the remedy.
 *
 * If the content pack is ever published, this whole file collapses to one import - and
 * the duplicate of it in the bug-fixes mod goes with it. That is the argument for
 * publishing it; it is not a reason to pretend the dependency is not here today.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function findPackDir(): string {
  const candidates: string[] = [];
  const explicit = process.env["NEO_ANGBAND_REPO"];
  if (explicit !== undefined && explicit !== "") {
    candidates.push(join(explicit, "packages", "content", "pack"));
  }
  candidates.push(
    fileURLToPath(new URL("../neo-angband/packages/content/pack/", import.meta.url)),
  );
  for (const dir of candidates) {
    /* constants.json rather than the directory: an empty or partial checkout would
     * otherwise pass this test and fail later with a missing-file error naming one
     * record type, which points at the wrong thing entirely. */
    if (existsSync(join(dir, "constants.json"))) return dir;
  }
  throw new Error(
    "Cannot find the Neo Angband content pack. These tests boot a real game from the\n" +
      "gamedata in the game's repository, which is not published to npm. Either check\n" +
      "out https://github.com/neostryder/neo-angband as a sibling of this repository,\n" +
      "or set NEO_ANGBAND_REPO to where it already is.\n" +
      `Looked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
  );
}

const PACK_DIR = findPackDir();

export function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(PACK_DIR, `${name}.json`), "utf8")) as T;
}

export function loadRecords<T>(name: string): T[] {
  return loadJson<{ records: T[] }>(name).records;
}
