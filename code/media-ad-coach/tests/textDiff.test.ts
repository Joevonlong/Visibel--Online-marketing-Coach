import { describe, expect, it } from "vitest";

import { diffAfter, diffBefore, diffWords, hasAddedWords } from "../lib/client/textDiff";

describe("diffWords", () => {
  it("marks every word unchanged for identical strings", () => {
    expect(diffWords("Fast reliable plumbing", "Fast reliable plumbing")).toEqual([
      { kind: "unchanged", value: "Fast reliable plumbing" },
    ]);
  });

  it("treats an empty before as all added", () => {
    expect(diffWords("", "Book a free quote today")).toEqual([
      { kind: "added", value: "Book a free quote today" },
    ]);
  });

  it("treats an empty after as all removed", () => {
    expect(diffWords("Old tired copy", "")).toEqual([
      { kind: "removed", value: "Old tired copy" },
    ]);
  });

  it("marks a word inserted in the middle without disturbing its neighbours", () => {
    expect(diffWords("licensed plumber Berlin", "licensed master plumber Berlin")).toEqual([
      { kind: "unchanged", value: "licensed" },
      { kind: "added", value: "master" },
      { kind: "unchanged", value: "plumber Berlin" },
    ]);
  });

  it("captures a replacement as a removal followed by an addition", () => {
    const segments = diffWords("cheap plumbing", "trusted plumbing");
    expect(segments).toEqual([
      { kind: "removed", value: "cheap" },
      { kind: "added", value: "trusted" },
      { kind: "unchanged", value: "plumbing" },
    ]);
  });

  it("collapses runs of adjacent same-kind words into one segment", () => {
    const segments = diffWords("we help", "we truly genuinely help");
    expect(segments).toEqual([
      { kind: "unchanged", value: "we" },
      { kind: "added", value: "truly genuinely" },
      { kind: "unchanged", value: "help" },
    ]);
  });
});

describe("diffAfter / diffBefore", () => {
  it("diffAfter drops removed words (renders the new copy)", () => {
    expect(diffAfter("cheap plumbing", "trusted plumbing")).toEqual([
      { kind: "added", value: "trusted" },
      { kind: "unchanged", value: "plumbing" },
    ]);
  });

  it("diffBefore drops added words (renders the old copy)", () => {
    expect(diffBefore("cheap plumbing", "trusted plumbing")).toEqual([
      { kind: "removed", value: "cheap" },
      { kind: "unchanged", value: "plumbing" },
    ]);
  });
});

describe("hasAddedWords", () => {
  it("is true when the after adds words", () => {
    expect(hasAddedWords("plumber", "licensed plumber")).toBe(true);
  });

  it("is false when nothing new was added", () => {
    expect(hasAddedWords("licensed plumber", "licensed plumber")).toBe(false);
    expect(hasAddedWords("licensed plumber Berlin", "licensed plumber")).toBe(false);
  });
});
