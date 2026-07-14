import { NextResponse } from "next/server";

import { internalOrigin } from "@/lib/owui/internal-origin";

import { OWUI_USER_ID } from "../v1/auths/session-user";

/**
 * `GET /owui/api/models` — the model list Open WebUI's selector renders.
 *
 * This is the seam where Open WebUI's UI meets Routiform's router: it translates
 * Routiform's `/api/models` (provider + model + availability + vision flag) into the
 * OpenAI-ish model object the SPA expects.
 *
 * The id is the FULL `provider/model` string, because that is what Routiform's gateway
 * needs on the way back out in a completion request. Using the bare model name here would
 * route the turn to whichever provider happened to match first.
 */

export const dynamic = "force-dynamic";

interface RoutiformModel {
  provider: string;
  model: string;
  name: string;
  fullModel: string;
  alias: string | null;
  available: boolean;
  supportsImages: boolean;
}

export async function GET(request: Request) {
  // Same-origin hop over loopback, NOT the request's Host header — see internal-origin.ts. The
  // middleware already authenticated the caller, and forwarding the cookie keeps that true.
  const res = await fetch(`${internalOrigin()}/api/models`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ data: [] });
  }

  const { models } = (await res.json()) as { models: RoutiformModel[] };

  const data = models
    // An unavailable model in the picker is a trap: you select it, you send, it fails.
    .filter((model) => model.available)
    .map((model) => ({
      id: model.fullModel,
      name: model.fullModel,
      object: "model",
      created: 0,
      owned_by: model.provider,

      // Open WebUI gates the image-attach button on this. Routiform computes it server-side
      // from the translator (some request formats DROP images before they reach the
      // provider), so it must be passed through, never guessed from the model name.
      info: {
        meta: {
          capabilities: {
            vision: model.supportsImages,
            // Gates the paperclip (MessageInput.svelte:625). Tied to vision rather than set
            // true for everything: the only attachments we can actually deliver are images and
            // inlined text, and offering uploads on a model that cannot see an image would let
            // the user attach a photo the model never receives — and answer about it anyway.
            file_upload: model.supportsImages,
            usage: true,
            citations: false,
          },
        },
      },

      // The SPA reads these off each model; absent, it renders "undefined" chips.
      actions: [],
      tags: [],
      user_id: OWUI_USER_ID,
    }));

  return NextResponse.json({ data });
}
