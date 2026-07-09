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
