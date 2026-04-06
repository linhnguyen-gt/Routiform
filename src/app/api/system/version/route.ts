/**
 * GET  /api/system/version  — Returns current version and latest available on npm
 * POST /api/system/version  — Triggers a deployment-aware background update
 *
 * Security: Requires admin authentication (same as other management routes).
 * Safety: Update only runs if a newer version is available on npm.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import {
  getAutoUpdateConfig,
  launchAutoUpdate,
  validateAutoUpdateRuntime,
} from "@/lib/system/autoUpdate";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

async function getLatestNpmVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npm", ["info", "routiform", "version", "--json"], {
      timeout: 10000,
    });
    const parsed = JSON.parse(stdout.trim());
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function getCurrentVersion(): string {
  try {
    return require("../../../../../package.json").version as string;
  } catch {
    return "unknown";
  }
}

function isNewer(a: string | null, b: string): boolean {
  if (!a) return false;
  const parse = (v: string) => v.split(".").map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = getCurrentVersion();
  const latest = await getLatestNpmVersion();
  const updateAvailable = isNewer(latest, current);
  const config = getAutoUpdateConfig();
  const validation = await validateAutoUpdateRuntime(config);

  return NextResponse.json({
    current,
    latest: latest ?? "unavailable",
    updateAvailable,
    channel: config.mode,
    autoUpdateSupported: validation.supported,
    autoUpdateError: validation.reason,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = getCurrentVersion();
  const latest = await getLatestNpmVersion();

  if (!latest) {
    return NextResponse.json(
      { success: false, error: "Could not reach npm registry" },
      { status: 503 }
    );
  }

  if (!isNewer(latest, current)) {
    return NextResponse.json({
      success: false,
      error: `Already on latest version (${current})`,
      current,
      latest,
    });
  }

  const config = getAutoUpdateConfig();
  const validation = await validateAutoUpdateRuntime(config);

  if (!validation.supported) {
    return NextResponse.json(
      {
        success: false,
        error: validation.reason || "Auto-update is not supported in this environment.",
      },
      { status: 400 }
    );
  }

  // If we are in docker-compose mode, use the detached shell script background updates
  if (config.mode === "docker-compose") {
    const launched = await launchAutoUpdate({ latest });
    if (!launched.started) {
      return NextResponse.json(
        {
          success: false,
          error: launched.error || "Failed to start auto-update.",
          channel: launched.channel,
          logPath: launched.logPath,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Update to v${latest} started. Docker rebuild is running in the background.`,
      from: current,
      to: latest,
      channel: launched.channel,
      logPath: launched.logPath,
    });
  }

  // Stream progress events so the frontend can show real-time status for NPM/PM2 mode
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1: Install
        send({ step: "install", status: "running", message: `Installing routiform@${latest}...` });
        await execFileAsync(
          "npm",
          ["install", "-g", `routiform@${latest}`, "--ignore-scripts", "--legacy-peer-deps"],
          {
            timeout: 300000,
          }
        );
        send({ step: "install", status: "done", message: `Installed routiform@${latest}` });

        // Step 2: Rebuild native modules (critical for better-sqlite3)
        send({
          step: "rebuild",
          status: "running",
          message: "Rebuilding native modules (better-sqlite3)...",
        });
        const globalRoot = (
          await execFileAsync("npm", ["root", "-g"], { timeout: 10000 })
        ).stdout.trim();
        const routiformPath = `${globalRoot}/routiform/app`;
        await execFileAsync("npm", ["rebuild", "better-sqlite3"], {
          cwd: routiformPath,
          timeout: 120000,
        });
        send({ step: "rebuild", status: "done", message: "Native modules rebuilt" });

        // Step 3: Restart PM2
        send({ step: "restart", status: "running", message: "Restarting service via PM2..." });
        try {
          await execFileAsync("pm2", ["restart", "routiform", "--update-env"], { timeout: 30000 });
          send({ step: "restart", status: "done", message: "Service restarted" });
        } catch {
          // PM2 may not be available (Docker/manual setups)
          send({
            step: "restart",
            status: "skipped",
            message: "PM2 not available — manual restart needed",
          });
        }

        send({
          step: "complete",
          status: "done",
          from: current,
          to: latest,
          message: `Update to v${latest} complete!`,
        });
        console.log(`[AutoUpdate] Successfully updated to v${latest}`);
      } catch (err: any) {
        const errMsg = err?.stderr || err?.message || String(err);
        send({ step: "error", status: "failed", message: errMsg });
        console.error(`[AutoUpdate] Update failed:`, err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
