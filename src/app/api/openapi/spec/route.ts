/**
 * API: OpenAPI Spec
 * GET — returns the parsed openapi.yaml as structured JSON catalog
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
// Named import, not default: js-yaml 5 dropped the default export. v4 exposes both, so
// this builds against either and unblocks the 4 → 5 bump.
import { load as loadYaml } from "js-yaml";

let cachedSpec: { data: unknown; mtime: number; specPath: string } | null = null;

const OPENAPI_SPEC_CANDIDATES = [
  ["docs", "openapi.yaml"],
  ["public", "docs", "openapi.yaml"],
  ["app", "docs", "openapi.yaml"],
  ["..", "docs", "openapi.yaml"],
] as const;

export function resolveOpenApiSpecPath(baseDir: string = process.cwd()): string | null {
  for (const candidate of OPENAPI_SPEC_CANDIDATES) {
    const candidatePath = path.resolve(baseDir, ...candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export async function GET() {
  try {
    const specPath = resolveOpenApiSpecPath();

    if (!specPath) {
      return NextResponse.json({ error: "openapi.yaml not found" }, { status: 404 });
    }

    const stat = fs.statSync(specPath);
    const mtime = stat.mtimeMs;

    // Use cache if file hasn't changed
    if (cachedSpec && cachedSpec.specPath === specPath && cachedSpec.mtime === mtime) {
      return NextResponse.json(cachedSpec.data);
    }

    const content = fs.readFileSync(specPath, "utf-8");
    const raw: Record<string, unknown> = loadYaml(content) as Record<string, unknown>;

    // Build a structured catalog
    const catalog: {
      info: unknown;
      servers: unknown[];
      tags: unknown[];
      endpoints: Array<{
        method: string;
        path: string;
        tags: unknown[];
        summary?: string;
        description?: string;
        operationId?: string;
        security: boolean;
        parameters: unknown[];
        requestBody: boolean;
        responses: string[];
      }>;
      schemas: string[];
    } = {
      info: (raw.info as Record<string, unknown>) || {},
      servers: (raw.servers as unknown[]) || [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      endpoints: [],
      schemas: Object.keys(
        ((raw.components as Record<string, unknown>)?.schemas as Record<string, unknown>) || {}
      ),
    };

    // Parse paths into flat endpoint list
    const paths = (raw.paths as Record<string, unknown>) || {};
    for (const [pathStr, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== "object") continue;
      for (const [method, spec] of Object.entries(methods as Record<string, unknown>)) {
        if (["get", "post", "put", "patch", "delete"].includes(method) && spec) {
          const specObj = spec as Record<string, unknown>;
          catalog.endpoints.push({
            method: method.toUpperCase(),
            path: pathStr,
            tags: Array.isArray(specObj.tags) ? specObj.tags : [],
            summary: (specObj.summary as string) || "",
            description: (specObj.description as string) || "",
            operationId: specObj.operationId as string | undefined,
            security: Array.isArray(specObj.security) && specObj.security.length > 0,
            parameters: Array.isArray(specObj.parameters) ? specObj.parameters : [],
            requestBody: Boolean(specObj.requestBody),
            responses: Object.keys(
              (specObj.responses as Record<string, unknown> | undefined) || {}
            ),
          });
        }
      }
    }

    cachedSpec = { data: catalog, mtime, specPath };

    return NextResponse.json(catalog);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : String(error) || "Failed to parse OpenAPI spec",
      },
      { status: 500 }
    );
  }
}
