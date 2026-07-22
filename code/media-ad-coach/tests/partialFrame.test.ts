// FEA-115 guard. FEA-112 publishes a streamed partial against the channel
// (`generated_asset_id` set, `partial: true`) while the channel STAYS
// "improving". The report page ignored that and showed a spinner for ~40s over
// an image that already existed. These tests pin when an early frame may be
// shown — and, just as importantly, when it may not.
import { describe, expect, it } from "vitest";

import { resolvePartialFrame } from "../components/report/partialFrame";

const known = (id: string) => id === "asset-1";

describe("FEA-115 — early frames on the report page", () => {
  it("shows a published partial while the channel is still improving", () => {
    const frame = resolvePartialFrame(
      "improving",
      { generated_asset_id: "asset-1", partial: true, content_category: "work_result" },
      known
    );
    expect(frame).toEqual({ assetId: "asset-1", category: "work_result" });
  });

  it("does not double-render once the channel is improved", () => {
    // The full BeforeAfterInline reveal owns that state.
    expect(
      resolvePartialFrame("improved", { generated_asset_id: "asset-1", partial: true }, known)
    ).toBeNull();
    expect(resolvePartialFrame("todo", { generated_asset_id: "asset-1" }, known)).toBeNull();
  });

  it("shows nothing while a channel is improving with no image yet", () => {
    expect(resolvePartialFrame("improving", { generated_asset_id: null }, known)).toBeNull();
    expect(resolvePartialFrame("improving", {}, known)).toBeNull();
    expect(resolvePartialFrame("improving", null, known)).toBeNull();
    expect(resolvePartialFrame("improving", "nonsense", known)).toBeNull();
  });

  it("waits for the asset row to be readable in this render", () => {
    // ISS-032: the poll payload and the server-rendered asset list refresh
    // independently, so the id can be known a beat before the row is.
    expect(
      resolvePartialFrame("improving", { generated_asset_id: "asset-not-loaded-yet" }, known)
    ).toBeNull();
  });

  it("does not require the `partial` flag to show a published early frame", () => {
    // A published asset on an improving channel IS an early frame; treating a
    // missing flag as "not partial" would hide the very image this exists for.
    const frame = resolvePartialFrame("improving", { generated_asset_id: "asset-1" }, known);
    expect(frame?.assetId).toBe("asset-1");
  });
});
