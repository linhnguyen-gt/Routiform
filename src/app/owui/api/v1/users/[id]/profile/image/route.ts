import { NextResponse } from "next/server";

/**
 * `GET /owui/api/v1/users/<id>/profile/image` — the avatar shown in the sidebar footer and
 * on every user turn. Open WebUI serves an uploaded PNG; Routiform has no user table and no
 * uploads, so it gets a generated initial instead of a broken image icon.
 */

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="32" fill="#262626"/>
  <text x="32" y="41" font-family="Archivo, Inter, sans-serif" font-size="26"
        font-weight="600" fill="#EBEBEB" text-anchor="middle">R</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
    },
  });
}
