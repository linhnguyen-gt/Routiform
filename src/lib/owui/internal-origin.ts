/**
 * A trusted base URL for the server to call ITSELF.
 *
 * The `/owui` config and models routes need to reach Routiform's own `/api/models`. The obvious
 * `new URL(request.url).origin` derives that target from the incoming Host header — so behind a
 * proxy that does not pin Host, an authenticated caller could set `Host: attacker.example` and
 * steer the follow-up fetch (which forwards the session cookie) at an arbitrary origin. Low-rated,
 * because it needs a misconfigured front proxy, but it is a genuine cookie-exfiltration seam and
 * there is no reason a same-origin hop should trust attacker-controlled input for its own address.
 *
 * Loopback + the port Next is actually serving is fixed and un-spoofable: the request cannot move
 * it. In Docker the app binds 0.0.0.0:PORT, so 127.0.0.1:PORT still reaches it.
 *
 * @module lib/owui/internal-origin
 */

import { getRuntimePorts } from "@/lib/runtime/ports";

export function internalOrigin(): string {
  const { dashboardPort } = getRuntimePorts();
  return `http://127.0.0.1:${dashboardPort}`;
}
