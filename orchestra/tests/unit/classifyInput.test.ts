import { describe, expect, it } from "vitest";

import { classifyInput, validateInput } from "@/lib/scan/classifyInput";

describe("classifyInput", () => {
  it("treats a bare domain as a url and adds https", () => {
    const result = classifyInput("stripe.com");
    expect(result).toEqual({ kind: "url", url: "https://stripe.com/", host: "stripe.com" });
  });

  it("keeps an explicit scheme and strips www from the host", () => {
    const result = classifyInput("http://www.example.co.uk/pricing");
    expect(result.kind).toBe("url");
    if (result.kind !== "url") throw new Error("expected url");
    expect(result.host).toBe("example.co.uk");
    expect(result.url).toBe("http://www.example.co.uk/pricing");
  });

  it("handles a subdomain with a path", () => {
    const result = classifyInput("app.linear.app/team");
    expect(result.kind).toBe("url");
    if (result.kind !== "url") throw new Error("expected url");
    expect(result.host).toBe("app.linear.app");
  });

  it("reads prose as a description even when it contains periods", () => {
    const result = classifyInput("we sell shoes. online. mostly.");
    expect(result.kind).toBe("description");
  });

  it("reads a single word with no tld as a description", () => {
    expect(classifyInput("bakery").kind).toBe("description");
  });

  it("reads a token with an unknown-shaped tld as a description", () => {
    expect(classifyInput("version.2").kind).toBe("description");
  });

  it("reports empty input", () => {
    expect(classifyInput("   ").kind).toBe("empty");
  });
});

describe("validateInput", () => {
  it("accepts a domain", () => {
    expect(validateInput("shopify.com")).toBeNull();
  });

  it("accepts a real description", () => {
    expect(validateInput("a coffee roaster with three cafes")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(validateInput("")).toMatch(/enter a company site/i);
  });

  it("rejects input that is too short", () => {
    expect(validateInput("ab")).toMatch(/too short/i);
  });

  it("rejects junk that is neither a url nor two real words", () => {
    expect(validateInput("$$$$ %%%%")).toMatch(/valid url/i);
  });

  it("rejects overlong input", () => {
    expect(validateInput("a".repeat(601))).toMatch(/600 characters/i);
  });
});
