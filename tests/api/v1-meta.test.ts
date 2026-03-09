import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("/api/v1/meta", () => {
  it("returns filter dropdown values", async () => {
    const res = await fetch(`${BASE}/api/v1/meta`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty("countries");
    expect(data).toHaveProperty("sectors");
    expect(data).toHaveProperty("stages");
    expect(Array.isArray(data.countries)).toBe(true);
    expect(Array.isArray(data.sectors)).toBe(true);
    expect(Array.isArray(data.stages)).toBe(true);
  });

  it("countries are strings", async () => {
    const res = await fetch(`${BASE}/api/v1/meta`);
    const data = await res.json();
    for (const c of data.countries) expect(typeof c).toBe("string");
  });
});
