import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";

// Mock the localDb functions used in the route
vi.mock("../../../../lib/localDb", () => {
  const original = vi.importActual("../../../../lib/localDb");
  return {
    ...original,
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  };
});

import { getSettings, updateSettings } from "../../../../lib/localDb";

// Helper to create a Request with JSON body
function createPatchRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("/api/settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default settings before each test
    vi.mocked(getSettings).mockResolvedValue({
      debugMode: false,
      hiddenSidebarItems: [],
    });
    // Mock updateSettings to merge updates into the original
    vi.mocked(updateSettings).mockImplementation(async (updates: Record<string, unknown>) => {
      const current = await getSettings();
      return { ...current, ...updates };
    });
  });

  it("returns no-store headers on GET", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("expires")).toBe("0");
  });

  it("toggles debugMode via PATCH", async () => {
    const req = createPatchRequest({ debugMode: true });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.debugMode).toBe(true);
    // Ensure password is not leaked
    expect(json).not.toHaveProperty("password");
    // Verify DB update called with correct payload
    expect(updateSettings).toHaveBeenCalledOnce();
    const calledWith = (updateSettings as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Record<string, unknown>;
    expect(calledWith.debugMode).toBe(true);
  });

  it("updates hiddenSidebarItems via PATCH", async () => {
    const req = createPatchRequest({ hiddenSidebarItems: [] });
    const res = await PATCH(req as Request);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hiddenSidebarItems).toEqual([]);
    expect(updateSettings).toHaveBeenCalledOnce();
    const calledWith = (updateSettings as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Record<string, unknown>;
    expect(calledWith.hiddenSidebarItems).toEqual([]);
  });

  it("updates autoBackupEnabled via PATCH", async () => {
    const req = createPatchRequest({ autoBackupEnabled: true });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.autoBackupEnabled).toBe(true);
    expect(updateSettings).toHaveBeenCalledOnce();
    const calledWith = (updateSettings as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Record<string, unknown>;
    expect(calledWith.autoBackupEnabled).toBe(true);
  });

  it("returns no-store headers on PATCH", async () => {
    const req = createPatchRequest({ debugMode: true });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("expires")).toBe("0");
  });
});
