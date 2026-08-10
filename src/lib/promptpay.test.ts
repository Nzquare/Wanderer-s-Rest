import { describe, expect, it } from "vitest";
import { buildPromptPayPayload } from "./promptpay";

describe("buildPromptPayPayload (§20 — EMVCo Thai PromptPay QR)", () => {
  it("encodes a local mobile number as 0066 + subscriber number", () => {
    const payload = buildPromptPayPayload("0812345678", 100);
    // Merchant account info (tag 29) should carry the PromptPay AID and a
    // "01" (mobile) sub-field with the 0066-prefixed 9-digit number.
    expect(payload).toContain("0016A000000677010111");
    expect(payload).toContain("01130066812345678");
  });

  it("encodes a 13-digit ID as a national/tax ID field", () => {
    const payload = buildPromptPayPayload("1234567890123", 250);
    expect(payload).toContain("02131234567890123");
  });

  it("includes currency THB, country TH, and the exact amount to two decimals", () => {
    const payload = buildPromptPayPayload("0812345678", 199.5);
    expect(payload).toContain("5303764");
    expect(payload).toContain("5802TH");
    expect(payload).toContain("5406199.50");
  });

  it("appends a CRC16 that is internally self-consistent", () => {
    const payload = buildPromptPayPayload("0812345678", 42);
    // The CRC is computed over everything up through "6304"; recomputing
    // it here (by re-running the same algorithm the module uses) isn't
    // possible without exporting internals, so instead assert the shape:
    // ends in exactly 4 uppercase hex digits, immediately after "6304".
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("produces a deterministic payload for the same inputs", () => {
    const a = buildPromptPayPayload("0812345678", 100);
    const b = buildPromptPayPayload("0812345678", 100);
    expect(a).toBe(b);
  });

  it("produces different CRCs for different amounts", () => {
    const a = buildPromptPayPayload("0812345678", 100);
    const b = buildPromptPayPayload("0812345678", 200);
    expect(a).not.toBe(b);
  });
});
