import { describe, expect, it } from "vitest";
import { api2PoliciesToHooks, checkApi2Policies } from "@rpgm-tools/neo-angband-mod-sdk";
import epigraphs from "./epigraphs.json";
import plugin from "./plugin";

describe("memorial epigraphs", () => {
  it("contributes no line when disabled", () => {
    for (const flags of [{}, { "qol.memorialEpigraphs": false }]) {
      expect(plugin.hooks({ id: "qol", flags, settings: {} }).runEndLine).toBeUndefined();
    }
  });

  it.each([["death", "death"], ["retired", "retirement"], ["winner", "victory"]] as const)("selects %s lines with the host's deterministic key", (outcome, list) => {
    const lines = epigraphs[list].map((line) => line.slice(0, 72));
    expect(lines).toHaveLength(16);
    expect(checkApi2Policies({ runEndLine: lines })).toBeNull();
    const hook = plugin.hooks({ id: "qol", flags: { "qol.memorialEpigraphs": true }, settings: {} }).runEndLine!;
    const policy = api2PoliciesToHooks({ runEndLine: lines }).runEndLine!;
    const picked = new Set<string>();
    for (let seed = 0; seed < 256; seed++) {
      const report = Object.freeze({ outcome, name: "Aster", turn: 12345, seed });
      expect(hook(report)).toBe(policy(report));
      expect(hook(report)).toBe(hook({ ...report }));
      expect(lines).toContain(hook(report));
      picked.add(hook(report)!);
    }
    expect(picked.size).toBe(16);
    const unseeded = { outcome, name: "Aster", turn: 12345 };
    expect(hook(unseeded)).toBe(policy(unseeded));
  });
});
