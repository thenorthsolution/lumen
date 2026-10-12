import { describe, expect, it } from "vitest";
import { acceptsVoiceInput, unavailableVoiceSession } from "./interaction";

describe("voice interaction contracts", () => {
  it("reports a missing provider honestly", () => {
    expect(unavailableVoiceSession()).toEqual({ status: "unavailable", provider: null, message: "Realtime spraak is nog niet verbonden." });
  });

  it("accepts audio only while listening", () => {
    expect(acceptsVoiceInput({ status: "listening", provider: "test" })).toBe(true);
    expect(acceptsVoiceInput(unavailableVoiceSession())).toBe(false);
  });
});
