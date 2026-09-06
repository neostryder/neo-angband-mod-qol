import { describe, expect, it } from "vitest";
import { defaultRepeatShortcuts } from "./repeat-shortcuts";

describe("repeated-action shortcuts", () => {
  it("uses one key to begin the run and conditional-rest command sequences", () => {
    expect(defaultRepeatShortcuts(false)).toEqual([
      { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
      { trigger: "F2", label: "Run north", action: ".8" },
      { trigger: "F3", label: "Run south", action: ".2" },
      { trigger: "F4", label: "Run west", action: ".4" },
      { trigger: "F5", label: "Run east", action: ".6" },
    ]);
    expect(defaultRepeatShortcuts(true)).toEqual([
      { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
    ]);
  });

});
