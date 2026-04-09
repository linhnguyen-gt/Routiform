import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";

/**
 * GET /api/oauth/kiro/auto-import
 * Auto-detect and extract Kiro refresh token from AWS SSO cache.
 *
 * 🔒 Auth-guarded: requires JWT cookie or Bearer API key (finding #258-5).
 */
export async function GET(request: Request) {
  if (await isAuthRequired()) {
    if (!(await isAuthenticated(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const dataDir = process.env.DATA_DIR || join(homedir(), ".routiform");
    const candidatePaths = [
      join(homedir(), ".aws/sso/cache"),
      join(dataDir, ".aws/sso/cache"),
      process.env.AWS_SSO_CACHE_PATH,
      "/root/.aws/sso/cache",
      "/app/.aws/sso/cache",
    ].filter((p): p is string => Boolean(p));

    let cachePath: string | null = null;
    let files: string[] = [];

    for (const candidate of candidatePaths) {
      try {
        files = await readdir(candidate);
        cachePath = candidate;
        break;
      } catch {
        continue;
      }
    }

    if (!cachePath || files.length === 0) {
      return NextResponse.json({
        found: false,
        error:
          "AWS SSO cache not found. Please login to Kiro IDE first or mount ~/.aws/sso/cache into the container.",
      });
    }

    // Look for kiro-auth-token.json or any .json file with refreshToken
    let refreshToken = null;
    let foundFile = null;

    // First try kiro-auth-token.json
    const kiroTokenFile = "kiro-auth-token.json";
    if (files.includes(kiroTokenFile)) {
      try {
        const content = await readFile(join(cachePath, kiroTokenFile), "utf-8");
        const data = JSON.parse(content);
        if (data.refreshToken && data.refreshToken.startsWith("aorAAAAAG")) {
          refreshToken = data.refreshToken;
          foundFile = kiroTokenFile;
        }
      } catch (error) {
        // Continue to search other files
      }
    }

    // If not found, search all .json files
    if (!refreshToken) {
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const content = await readFile(join(cachePath, file), "utf-8");
          const data = JSON.parse(content);

          // Look for Kiro refresh token (starts with aorAAAAAG)
          if (data.refreshToken && data.refreshToken.startsWith("aorAAAAAG")) {
            refreshToken = data.refreshToken;
            foundFile = file;
            break;
          }
        } catch (error) {
          // Skip invalid JSON files
          continue;
        }
      }
    }

    if (!refreshToken) {
      return NextResponse.json({
        found: false,
        error: "Kiro token not found in AWS SSO cache. Please login to Kiro IDE first.",
      });
    }

    return NextResponse.json({
      found: true,
      refreshToken,
      source: foundFile,
    });
  } catch (error) {
    console.log("Kiro auto-import error:", error);
    return NextResponse.json({ found: false, error: error.message }, { status: 500 });
  }
}
