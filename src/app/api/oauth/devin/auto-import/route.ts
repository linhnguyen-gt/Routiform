import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { isHostSecretAuthenticated } from "@/shared/utils/apiAuth";

export async function GET(request: Request) {
  if (!(await isHostSecretAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = findDevinToken();
    if (token) {
      return NextResponse.json({ found: true, accessToken: token });
    }

    return NextResponse.json({
      found: false,
      error: "Devin credentials not found. Run `devin auth login` to authenticate, then try again.",
    });
  } catch (error) {
    console.log("Devin auto-import error:", error);
    return NextResponse.json({ found: false, error: (error as Error).message }, { status: 500 });
  }
}

function findDevinToken(): string | null {
  const home = homedir();

  // Primary location: ~/.local/share/devin/credentials.toml (confirmed from devin auth status)
  const tomlPath = join(home, ".local/share/devin/credentials.toml");
  if (existsSync(tomlPath)) {
    const token = parseTomlWindsurfApiKey(readFileSync(tomlPath, "utf-8"));
    if (token) return token;
  }

  // Fallback locations
  const fallbackPaths = [
    join(home, ".config/devin/credentials.toml"),
    join(home, ".devin/credentials.toml"),
  ];

  for (const p of fallbackPaths) {
    try {
      if (existsSync(p)) {
        const token = parseTomlWindsurfApiKey(readFileSync(p, "utf-8"));
        if (token) return token;
      }
    } catch {
      // continue
    }
  }

  return null;
}

// Parse windsurf_api_key from TOML without a full TOML parser dependency.
// The credentials.toml format is: windsurf_api_key = "devin-session-token$..."
function parseTomlWindsurfApiKey(content: string): string | null {
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*windsurf_api_key\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}
