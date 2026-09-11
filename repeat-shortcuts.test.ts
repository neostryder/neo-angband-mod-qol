import { describe, expect, it } from "vitest";
import { defaultRepeatShortcuts } from "./repeat-shortcuts";

describe("repeated-action shortcuts", () => {
  it("offers one key for the conditional-rest command sequence only", () => {
    /* No run shortcuts: `.` plus a direction (original keyset) or one shifted
     * direction key (roguelike) are already as short as a bound key would
     * make them, so a run binding here would save nothing (#151). */
    expect(defaultRepeatShortcuts()).toEqual([
      { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
    ]);
  });
});
