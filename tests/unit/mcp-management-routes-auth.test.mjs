import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "routiform-mcp-management-auth-"));

process.env.DATA_DIR = TEST_DATA_DIR;

const dbCore = await import("../../src/lib/db/core.ts");
const { updateSettings } = await import("../../src/lib/localDb.ts");
const statusRoute = await import("../../src/app/api/mcp/status/route.ts");
const toolsRoute = await import("../../src/app/api/mcp/tools/route.ts");
const auditRoute = await import("../../src/app/api/mcp/audit/route.ts");
const { closeAuditDb } = await import("../../open-sse/mcp-server/audit.ts");

async function createSessionToken(secretValue) {
  const secret = new TextEncoder().encode(secretValue);
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function resetStorage() {
  closeAuditDb();
  dbCore.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
  process.env.JWT_SECRET = "mcp-management-test-secret";
  process.env.INITIAL_PASSWORD = "mcp-management-bootstrap";
  await updateSettings({
    requireLogin: true,
    password: "hashed-password",
    mcpEnabled: true,
    mcpTransport: "stdio",
  });
});

test.after(() => {
  closeAuditDb();
  dbCore.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }

  if (ORIGINAL_JWT_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  }

  if (ORIGINAL_INITIAL_PASSWORD === undefined) {
    delete process.env.INITIAL_PASSWORD;
  } else {
    process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
});

test("MCP management routes reject unauthenticated requests when auth is enabled", async () => {
  const statusResponse = await statusRoute.GET(new Request("http://localhost/api/mcp/status"));
  const toolsResponse = await toolsRoute.GET(new Request("http://localhost/api/mcp/tools"));
  const auditResponse = await auditRoute.GET(new Request("http://localhost/api/mcp/audit?limit=5"));

  for (const response of [statusResponse, toolsResponse, auditResponse]) {
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body?.error?.message, "Authentication required");
  }
});

test("MCP management routes allow dashboard-session access when auth is enabled", async () => {
  const token = await createSessionToken(process.env.JWT_SECRET);
  const headers = { cookie: `auth_token=${token}` };

  const statusResponse = await statusRoute.GET(
    new Request("http://localhost/api/mcp/status", { headers })
  );
  const toolsResponse = await toolsRoute.GET(
    new Request("http://localhost/api/mcp/tools", { headers })
  );
  const auditResponse = await auditRoute.GET(
    new Request("http://localhost/api/mcp/audit?limit=5", { headers })
  );

  assert.equal(statusResponse.status, 200);
  assert.equal(toolsResponse.status, 200);
  assert.equal(auditResponse.status, 200);

  const toolsBody = await toolsResponse.json();
  assert.equal(Array.isArray(toolsBody?.tools), true);

  const auditBody = await auditResponse.json();
  assert.equal(Array.isArray(auditBody?.entries), true);
});

test("MCP management routes remain accessible when login auth is disabled", async () => {
  await updateSettings({ requireLogin: false, password: "" });
  delete process.env.INITIAL_PASSWORD;

  const statusResponse = await statusRoute.GET(new Request("http://localhost/api/mcp/status"));
  const toolsResponse = await toolsRoute.GET(new Request("http://localhost/api/mcp/tools"));
  const auditResponse = await auditRoute.GET(new Request("http://localhost/api/mcp/audit?limit=5"));

  assert.equal(statusResponse.status, 200);
  assert.equal(toolsResponse.status, 200);
  assert.equal(auditResponse.status, 200);
});
