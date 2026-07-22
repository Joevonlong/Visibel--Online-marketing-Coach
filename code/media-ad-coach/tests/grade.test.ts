import { describe, expect, it } from "vitest";

import { GRADE_LABEL, gradeOf } from "../lib/client/grade";

describe("gradeOf", () => {
  it("grades low / mid / high by threshold", () => {
    expect(gradeOf(0)).toBe("low");
    expect(gradeOf(39)).toBe("low");
    expect(gradeOf(40)).toBe("mid");
    expect(gradeOf(69)).toBe("mid");
    expect(gradeOf(70)).toBe("high");
    expect(gradeOf(100)).toBe("high");
  });

  it("clamps out-of-range input", () => {
    expect(gradeOf(-20)).toBe("low");
    expect(gradeOf(250)).toBe("high");
  });

  it("labels each grade", () => {
    expect(GRADE_LABEL[gradeOf(10)]).toBe("Weak");
    expect(GRADE_LABEL[gradeOf(55)]).toBe("Fair");
    expect(GRADE_LABEL[gradeOf(90)]).toBe("Strong");
  });
});
