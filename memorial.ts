import type { Api2RunEndFacts } from "@rpgm-tools/neo-angband-mod-sdk";
import epigraphs from "./epigraphs.json";

export function memorialLine(report: Api2RunEndFacts): string {
  const lines = report.outcome === "winner" ? epigraphs.victory : report.outcome === "retired" ? epigraphs.retirement : epigraphs.death;
  // The policy's FNV-1a key keeps screen and dump choices independent of game randomness.
  let hash = 2166136261;
  for (const char of JSON.stringify([report.outcome, report.name, report.turn, report.seed ?? null])) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return lines[hash % lines.length]!.slice(0, 72);
}
