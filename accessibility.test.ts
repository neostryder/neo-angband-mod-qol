import { describe, expect, it, vi } from "vitest";
import {
  accessibilityFilter,
  COLORBLIND_FILTER_ID,
  installAccessibilityAccommodations,
} from "./accessibility";

describe("visual accessibility accommodations", () => {
  it("combines the SVG colourblind correction with high contrast when both are selected", () => {
    expect(accessibilityFilter({
      "qol.accessibilityColorblind": true,
      "qol.accessibilityHighContrast": true,
    })).toBe(`url("#${COLORBLIND_FILTER_ID}") contrast(1.55) saturate(1.2)`);
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
