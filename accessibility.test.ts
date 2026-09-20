import { describe, expect, it, vi } from "vitest";
import {
  accessibilityFilter,
  COLORBLIND_FILTER_ID,
  installAccessibilityAccommodations,
} from "./accessibility";

describe("visual accessibility accommodations", () => {
  it("applies only the high-contrast filter when high contrast alone is selected", () => {
    expect(accessibilityFilter({
      "qol.accessibilityHighContrast": true,
    })).toBe("contrast(1.55) saturate(1.2)");
  });

  it("applies only the SVG colourblind correction when colourblind alone is selected", () => {
    expect(accessibilityFilter({
      "qol.accessibilityColorblind": true,
    })).toBe(`url("#${COLORBLIND_FILTER_ID}")`);
  });

  it("prioritizes the colourblind correction over high contrast when both are selected (#209)", () => {
    expect(accessibilityFilter({
      "qol.accessibilityColorblind": true,
      "qol.accessibilityHighContrast": true,
    })).toBe(`url("#${COLORBLIND_FILTER_ID}")`);
  });

  it("applies and clears the final-frame filter through the display seam", () => {
    const setVisualFilter = vi.fn();
    installAccessibilityAccommodations({
      flags: { "qol.accessibilityHighContrast": true },
      display: { setVisualFilter },
    });
    expect(setVisualFilter).toHaveBeenCalledWith("contrast(1.55) saturate(1.2)");

    installAccessibilityAccommodations({ flags: {}, display: { setVisualFilter } });
    expect(setVisualFilter).toHaveBeenLastCalledWith(null);
  });
});
