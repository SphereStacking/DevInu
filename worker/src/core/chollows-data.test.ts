import { describe, it, expect } from "vitest";
import { encodeChollowsData, decodeChollowsData } from "./chollows-data";
import type { ChollowsData, Finding } from "./chollows-data";

const sampleFinding: Finding = {
  severity: "high",
  file: "src/auth.ts",
  line: 42,
  title: "Hardcoded secret",
  description: "Secret is hardcoded in source code.",
  confidence: 90,
  suggestion: "Use environment variable instead.",
};

describe("encodeChollowsData / decodeChollowsData roundtrip", () => {
  it("encodes and decodes normal findings JSON back to original", () => {
    const original: ChollowsData = {
      version: "1",
      findings: [sampleFinding],
    };

    const b64 = encodeChollowsData(original);
    const decoded = decodeChollowsData(b64);

    expect(decoded).toEqual(original);
  });

  it("roundtrip with empty findings array", () => {
    const original: ChollowsData = { version: "1", findings: [] };

    const b64 = encodeChollowsData(original);
    const decoded = decodeChollowsData(b64);

    expect(decoded).toEqual(original);
  });

  it("roundtrip with Japanese text in findings", () => {
    const original: ChollowsData = {
      version: "1",
      findings: [
        {
          severity: "critical",
          file: "src/認証.ts",
          line: 10,
          title: "セキュリティ上の問題",
          description: "認証トークンが平文で保存されています。",
          confidence: 95,
          suggestion: "暗号化して保存してください。",
        },
      ],
    };

    const b64 = encodeChollowsData(original);
    const decoded = decodeChollowsData(b64);

    expect(decoded).toEqual(original);
    expect(decoded?.findings[0]?.title).toBe("セキュリティ上の問題");
  });

  it("roundtrip with multiple findings of different severities", () => {
    const original: ChollowsData = {
      version: "1",
      findings: [
        { ...sampleFinding, severity: "critical" },
        { ...sampleFinding, severity: "high" },
        { ...sampleFinding, severity: "medium" },
        { ...sampleFinding, severity: "low" },
      ],
    };

    const b64 = encodeChollowsData(original);
    const decoded = decodeChollowsData(b64);

    expect(decoded?.findings).toHaveLength(4);
    expect(decoded?.findings[0]?.severity).toBe("critical");
    expect(decoded?.findings[3]?.severity).toBe("low");
  });
});

describe("decodeChollowsData — invalid input", () => {
  it("returns null for empty string", () => {
    expect(decodeChollowsData("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(decodeChollowsData("   ")).toBeNull();
  });

  it("returns null for invalid Base64 (non-base64 chars)", () => {
    expect(decodeChollowsData("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for valid Base64 but not JSON", () => {
    // "hello" → base64
    const b64 = btoa("hello world not json");
    expect(decodeChollowsData(b64)).toBeNull();
  });

  it("returns null when version is '2' (unsupported)", () => {
    const json = JSON.stringify({ version: "2", findings: [] });
    const b64 = btoa(json);
    expect(decodeChollowsData(b64)).toBeNull();
  });

  it("returns null when version field is missing", () => {
    const json = JSON.stringify({ findings: [] });
    const b64 = btoa(json);
    expect(decodeChollowsData(b64)).toBeNull();
  });

  it("returns null when findings field is missing", () => {
    const json = JSON.stringify({ version: "1" });
    const b64 = btoa(json);
    expect(decodeChollowsData(b64)).toBeNull();
  });

  it("returns null when findings is not an array", () => {
    const json = JSON.stringify({ version: "1", findings: "not-an-array" });
    const b64 = btoa(json);
    expect(decodeChollowsData(b64)).toBeNull();
  });

  it("returns null for JSON null", () => {
    const b64 = btoa("null");
    expect(decodeChollowsData(b64)).toBeNull();
  });
});
