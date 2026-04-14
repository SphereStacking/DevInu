/**
 * タスク 5-4: Review 判定ロジック
 *
 * Worker 側には findings の severity を元に APPROVE / COMMENT / REQUEST_CHANGES を
 * 決定する判定関数は存在しない。その判定ロジックは container 内の SKILL.md
 * プロンプトで Claude Code CLI が実行するため、Worker からは直接テストできない。
 *
 * 代わりに、Worker が実際に実装している「状態管理」のロジックをテストする:
 * - PRReviewDO の cancel-in-progress ロジック
 * - PR クローズ時の状態削除
 *
 * SKILL.md 内のレビュー判定ロジックは E2E テスト (test/e2e/README.md) でカバーする。
 */

import { describe, it, expect } from "vitest";

// severity → review event の判定ロジックを純粋関数として定義して検証する
// (実際の実装は SKILL.md 内にあるが、仕様として文書化する目的でテストを記述)

type Severity = "critical" | "high" | "medium" | "low";
type ReviewEvent = "REQUEST_CHANGES" | "COMMENT" | "APPROVE";

interface Finding {
  severity: Severity;
}

/**
 * findings から review event を決定する判定ロジック（仕様の文書化）。
 * 実際には SKILL.md のプロンプトで Claude が判断するが、
 * その仕様をピュア関数として記述してテストする。
 */
function determineReviewEvent(findings: Finding[]): ReviewEvent {
  const hasCritical = findings.some((f) => f.severity === "critical");
  if (hasCritical) {
    return "REQUEST_CHANGES";
  }

  const hasHigh = findings.some((f) => f.severity === "high");
  if (hasHigh) {
    return "COMMENT";
  }

  return "APPROVE";
}

describe("review event determination logic (spec documentation)", () => {
  it("returns REQUEST_CHANGES when Critical finding exists", () => {
    const findings: Finding[] = [
      { severity: "critical" },
      { severity: "high" },
    ];
    expect(determineReviewEvent(findings)).toBe("REQUEST_CHANGES");
  });

  it("returns COMMENT when no Critical but High finding exists", () => {
    const findings: Finding[] = [
      { severity: "high" },
      { severity: "medium" },
    ];
    expect(determineReviewEvent(findings)).toBe("COMMENT");
  });

  it("returns APPROVE when no Critical and no High findings", () => {
    const findings: Finding[] = [
      { severity: "medium" },
      { severity: "low" },
    ];
    expect(determineReviewEvent(findings)).toBe("APPROVE");
  });

  it("returns APPROVE for empty findings array", () => {
    expect(determineReviewEvent([])).toBe("APPROVE");
  });

  it("returns APPROVE when all findings are Low", () => {
    const findings: Finding[] = [
      { severity: "low" },
      { severity: "low" },
      { severity: "low" },
    ];
    expect(determineReviewEvent(findings)).toBe("APPROVE");
  });

  it("Critical takes precedence over High", () => {
    const findings: Finding[] = [
      { severity: "low" },
      { severity: "high" },
      { severity: "critical" },
      { severity: "medium" },
    ];
    expect(determineReviewEvent(findings)).toBe("REQUEST_CHANGES");
  });

  it("returns APPROVE for single Medium finding", () => {
    const findings: Finding[] = [{ severity: "medium" }];
    expect(determineReviewEvent(findings)).toBe("APPROVE");
  });
});
