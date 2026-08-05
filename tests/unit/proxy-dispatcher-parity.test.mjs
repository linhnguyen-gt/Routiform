import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { fetch as undiciFetch } from "undici";

const {
  getProxyDispatcherOptions,
  getDefaultDispatcher,
  createProxyDispatcher,
  clearDispatcherCache,
} = await import("../../open-sse/utils/proxyDispatcher.ts");

test("getProxyDispatcherOptions disables pipelining for proxy stability", () => {
  const opts = getProxyDispatcherOptions();
  assert.equal(opts.pipelining, 0);
  assert.ok(typeof opts.headersTimeout === "number");
  assert.ok(typeof opts.connectTimeout === "number");
});

test("default direct dispatcher is distinct export (proxy options not applied globally)", () => {
  const d = getDefaultDispatcher();
  assert.ok(d != null);
});

// Every outbound request goes through `patchedFetch`, which hands our dispatcher to the
// runtime's global `fetch`. That fetch is backed by the undici Node bundles, not the one in
// node_modules, so the two must agree on the Dispatcher handler interface. When they drift
// -- as with the undici 8 handler rewrite against Node 22's bundled 6.28.0 -- every request
// dies at argument validation with `UND_ERR_INVALID_ARG` and surfaces as a bare
// "fetch failed". Exercise the real pairing so a dependency bump cannot ship that silently.
test("default dispatcher is accepted by the runtime's global fetch", async () => {
  const target = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  const port = target.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      dispatcher: getDefaultDispatcher(),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  } catch (error) {
    assert.fail(
      `global fetch rejected our undici dispatcher: ${error.message} ` +
        `(cause: ${error.cause?.code ?? "none"} ${error.cause?.message ?? ""}). ` +
        `npm undici vs bundled undici ${process.versions.undici} are incompatible.`
    );
  } finally {
    target.close();
    clearDispatcherCache();
  }
});

test("createProxyDispatcher tunnels plain-HTTP via CONNECT (proxyTunnel)", async () => {
  const target = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  const targetPort = target.address().port;

  let sawConnect = false;
  let sawForward = false;
  const proxy = http.createServer((_req, res) => {
    sawForward = true;
    res.writeHead(501);
    res.end("CONNECT only");
  });
  proxy.on("connect", (req, socket) => {
    sawConnect = true;
    const [host, port] = String(req.url).split(":");
    const upstream = net.connect(Number(port), host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyPort = proxy.address().port;

  try {
    const dispatcher = createProxyDispatcher(`http://127.0.0.1:${proxyPort}`);
    const res = await undiciFetch(`http://127.0.0.1:${targetPort}/token`, {
      method: "POST",
      dispatcher,
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.status, 200);
    assert.equal(sawConnect, true);
    assert.equal(sawForward, false);
  } finally {
    proxy.close();
    target.close();
    clearDispatcherCache();
  }
});
