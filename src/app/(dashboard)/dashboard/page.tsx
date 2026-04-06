import path from "path";
import { redirect } from "next/navigation";
import { getMachineId } from "@/shared/utils/machine";
import { getSettings } from "@/lib/localDb";
import { DATA_DIR } from "@/lib/db/core";
import { shouldShowZeroConfigBanner } from "@/lib/runtime/zeroConfigBanner";
import HomePageClient from "./HomePageClient";
import BootstrapBanner from "./BootstrapBanner";

// Must be dynamic — depends on DB state (setupComplete) that changes at runtime
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const settings = await getSettings();
  if (!settings.setupComplete) {
    redirect("/dashboard/onboarding");
  }
  const machineId = await getMachineId();
  const isBootstrapped =
    process.env.ROUTIFORM_BOOTSTRAPPED === "true" || process.env.OMNIROUTE_BOOTSTRAPPED === "true";
  const serverEnvPath = path.join(DATA_DIR, "server.env");
  const showBootstrapBanner = isBootstrapped && shouldShowZeroConfigBanner();
  return (
    <>
      {showBootstrapBanner && <BootstrapBanner serverEnvPath={serverEnvPath} />}
      <HomePageClient machineId={machineId} />
    </>
  );
}
