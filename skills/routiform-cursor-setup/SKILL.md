---
name: routiform-cursor-setup
description: "Point the Cursor editor at a running Routiform gateway through Settings → Models → OpenAI API Key, including the publicly reachable URL Cursor requires because it calls the endpoint from its own servers rather than from your machine. Use when someone asks to connect Cursor to Routiform, use custom or self-hosted models in Cursor, or override Cursor's OpenAI base URL."
---

# Connect Cursor to Routiform

Cursor has no config file to edit — the override lives in its settings UI. The part that trips
people up is where the request comes _from_.

## Read this before starting

**`http://localhost:20128` will not work.** Cursor sends chat requests from its own servers, not
from your machine, so the base URL has to be reachable from the public internet. A localhost URL
fails Cursor's verification step with no useful error. This is a property of Cursor, not of
Routiform, and no amount of local configuration works around it.

You need one of:

- Routiform's **Cloud Endpoint**, enabled in Settings, which gives you a public URL;
- Routiform deployed on a host with a domain and TLS;
- a tunnel (Cloudflare Tunnel, ngrok) in front of your local instance.

Anything you expose this way is an authenticated endpoint holding provider credentials. Use a
dedicated gateway key for Cursor so you can revoke it alone, and keep TLS on.

## Prerequisites

- A Cursor Pro account. The custom-OpenAI-key path is a Pro feature.
- Routiform reachable at a public HTTPS URL. Confirm from somewhere that is not your machine:
  `curl -s -o /dev/null -w '%{http_code}\n' https://your-domain.com/v1/models` → `200`.
- At least one provider connection configured at `/dashboard/providers`.

## Steps

**1. Create a gateway API key** scoped to this use. Dashboard → API Manager, or:

```bash
routiform key create cursor
```

**2. In Cursor: Settings → Models.** Enable **OpenAI API Key**.

**3. Set the base URL** to your public Routiform URL _with_ `/v1`:

```text
https://your-domain.com/v1
```

**4. Paste the gateway key** into the API key field.

**5. Add the model.** Click **View All Models → Add Custom Model** and enter an id Routiform can
resolve — list them with
`curl -H "Authorization: Bearer <key>" https://your-domain.com/v1/models`. Cursor will not offer
Routiform's catalogue on its own; the model name has to match what Routiform routes.

**6. Verify** with Cursor's own button next to the key field. `/dashboard/cli-tools` walks the same
six steps with your live values filled in, if you would rather copy than type.

## Verify

Cursor's verification only proves the key and URL. To prove requests actually route through
Routiform, send one chat message in Cursor and open `/dashboard/logs` — the request appears there
with the model and provider it resolved to. If Cursor answers but nothing shows in the logs, Cursor
served that request from its own backend and the override is not in effect for it.

## If it fails

| Symptom                                 | Cause                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Verification fails on a `localhost` URL | Expected. Cursor calls from its servers — see the top of this file.                               |
| Verification fails on a public URL      | TLS, DNS, or a firewall. Check the `curl` from a machine outside your network.                    |
| `401`                                   | Wrong or revoked key, or a key from a different Routiform instance.                               |
| Model not found                         | The custom model id does not match anything in `GET /v1/models`.                                  |
| Chat works, logs stay empty             | Cursor used its own backend for that request. Tab completion and indexing never use the override. |
