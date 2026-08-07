import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The dashboard is behind auth on any instance that completed onboarding, which is why
 * dashboard specs skip outright rather than fail. Set E2E_DASHBOARD_PASSWORD to run them
 * for real against a throwaway DATA_DIR; without it the behaviour is unchanged.
 *
 * Call after navigating; re-navigates to `returnTo` once the session cookie is set.
 */
export async function signInIfNeeded(page: Page, returnTo: string): Promise<void> {
  if (!page.url().includes("/login")) return;

  const password = process.env.E2E_DASHBOARD_PASSWORD;
  if (!password) return;

  const response = await page.request.post("/api/auth/login", { data: { password } });
  expect(response.ok(), `login failed: ${response.status()}`).toBeTruthy();
  await page.goto(returnTo);
  await page.waitForLoadState("domcontentloaded");
}
