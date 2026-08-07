import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signInIfNeeded } from "./helpers/dashboard-auth";

/**
 * Covers the behaviour hardcoded preset arrays could not have: a template resolves against
 * the user's real connected providers, so the same button yields different models — or
 * refuses to apply — depending on what is connected.
 *
 * These assertions deliberately check *properties* of the result (which provider a model
 * came from, how many per provider) rather than specific model ids. The catalog is real and
 * changes; the invariants do not.
 */

type ProviderConnection = {
  id: string;
  provider: string;
  testStatus: string;
  credentialsConfigured: boolean;
  isActive: number;
};

type ComboPayload = {
  name?: string;
  models?: Array<Record<string, unknown>>;
};

type StubOptions = {
  connections: ProviderConnection[];
  providerModels?: Record<string, Array<{ id: string; name: string }>>;
  /** Per-connection live catalog, keyed by connection id. Only stubbed when supplied. */
  liveModels?: Record<string, Array<{ id: string; name: string }>>;
  pricing?: Record<string, Record<string, { input: number; output: number }>>;
  onCreate?: (payload: ComboPayload) => void;
};

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const connection = (provider: string, id: string): ProviderConnection => ({
  id,
  provider,
  testStatus: "success",
  credentialsConfigured: true,
  isActive: 1,
});

/** openai = paid API key, groq = free tier, claude = paid OAuth subscription. */
const ALL_PROVIDER_KINDS = [
  connection("openai", "conn-openai"),
  connection("groq", "conn-groq"),
  connection("claude", "conn-claude"),
];

async function stubDashboard(page: Page, options: StubOptions): Promise<void> {
  await page.route("**/api/combos/metrics", (route) => route.fulfill(json({ metrics: {} })));
  await page.route("**/api/settings/proxy", (route) => route.fulfill(json({ combos: {} })));
  await page.route("**/api/provider-nodes", (route) => route.fulfill(json({ nodes: [] })));
  await page.route("**/api/models/alias", (route) => route.fulfill(json({ aliases: {} })));
  await page.route("**/api/providers", (route) =>
    route.fulfill(json({ connections: options.connections }))
  );
  await page.route("**/api/provider-models", (route) =>
    route.fulfill(json({ models: options.providerModels ?? {} }))
  );
  await page.route("**/api/pricing", (route) => route.fulfill(json(options.pricing ?? {})));
  if (options.liveModels) {
    const live = options.liveModels;
    await page.route("**/api/providers/*/models", (route) => {
      const connectionId = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
      route.fulfill(json({ models: live[connectionId] ?? [] }));
    });
  }
  await page.route("**/api/combos", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(json({ combos: [] }));
      return;
    }
    if (route.request().method() === "POST") {
      const raw = route.request().postDataJSON();
      const payload = raw && typeof raw === "object" ? (raw as ComboPayload) : {};
      options.onCreate?.(payload);
      await route.fulfill(
        json({ combo: { id: "combo-1", ...payload, isActive: true, warnings: [] } })
      );
      return;
    }
    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "Method not allowed in test stub" }),
    });
  });
}

async function openCreateModal(page: Page) {
  await page.goto("/dashboard/combos");
  await page.waitForLoadState("domcontentloaded");
  await signInIfNeeded(page, "/dashboard/combos");
  test.skip(page.url().includes("/login"), "Authentication enabled without a login fixture.");

  await expect(page.getByTestId("combos-header-create")).toBeVisible();
  await page.getByTestId("combos-header-create").click();

  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The `provider/model` strings currently in the form's model list. */
async function appliedModels(dialog: ReturnType<Page["getByRole"]>): Promise<string[]> {
  const rows = dialog.locator('[data-testid^="combo-model-row-"]');
  const texts = await rows.allInnerTexts();
  return texts
    .map((text) => text.split("\n").find((line) => line.includes("/")) ?? "")
    .filter(Boolean)
    .map((line) => line.trim());
}

test.describe("Combo quick templates", () => {
  test("a template draws only from connected providers, one model each", async ({ page }) => {
    await stubDashboard(page, {
      connections: [connection("openai", "conn-openai"), connection("groq", "conn-groq")],
    });

    const dialog = await openCreateModal(page);
    const highAvailability = dialog.locator('[data-template-id="high-availability"]');
    await expect(highAvailability).toBeVisible();
    await expect(highAvailability).toHaveAttribute("aria-disabled", "false");

    await highAvailability.click();

    // maxPerProvider: 1 with two connected providers.
    await expect(dialog.locator('[data-testid^="combo-model-row-"]')).toHaveCount(2);

    const applied = await appliedModels(dialog);
    const prefixes = applied.map((value) => value.split("/")[0]).sort();
    expect(prefixes).toEqual(["groq", "openai"]);
  });

  test("the same template yields a different set when a different provider is connected", async ({
    page,
  }) => {
    await stubDashboard(page, { connections: [connection("groq", "conn-groq")] });

    const dialog = await openCreateModal(page);
    await dialog.locator('[data-template-id="high-availability"]').click();

    const applied = await appliedModels(dialog);
    expect(applied.length).toBeGreaterThan(0);
    for (const value of applied) {
      expect(value.startsWith("groq/"), `${value} is not from the connected provider`).toBeTruthy();
    }
  });

  test("an unsatisfiable template is disabled and explains why instead of pasting dead ids", async ({
    page,
  }) => {
    await stubDashboard(page, {
      // A paid API-key provider satisfies neither the free nor the paid-subscription filter.
      connections: [connection("openai", "conn-openai")],
    });

    const dialog = await openCreateModal(page);
    const paidPremium = dialog.locator('[data-template-id="paid-premium"]');
    await expect(paidPremium).toHaveAttribute("aria-disabled", "true");

    const reasonId = await paidPremium.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    const reason = dialog.locator(`#${reasonId}`);
    await expect(reason).toBeVisible();
    await expect(reason).not.toHaveText("");

    // force: aria-disabled makes Playwright consider the button un-actionable, but the click
    // must still be proven inert rather than merely unreachable.
    await paidPremium.click({ force: true });
    await expect(dialog.locator('[data-testid^="combo-model-row-"]')).toHaveCount(0);
  });

  test("with no eligible connection every template is disabled", async ({ page }) => {
    await stubDashboard(page, {
      connections: [{ ...connection("openai", "conn-openai"), credentialsConfigured: false }],
    });

    const dialog = await openCreateModal(page);
    const templates = dialog.locator("[data-template-id]");
    const count = await templates.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(templates.nth(index)).toHaveAttribute("aria-disabled", "true");
    }
  });

  test("a save with many model warnings raises exactly one toast", async ({ page }) => {
    const warnings = Array.from({ length: 8 }, (_, i) => `groq/made-up-model-${i}`);
    await stubDashboard(page, { connections: [connection("openai", "conn-openai")] });
    // Re-route POST last so this handler wins, and return the warned-save response shape.
    await page.route("**/api/combos", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const payload = route.request().postDataJSON() as ComboPayload;
      await route.fulfill(json({ id: "combo-1", ...payload, isActive: true, warnings }));
    });

    const dialog = await openCreateModal(page);
    await dialog.locator('[data-template-id="high-availability"]').click();
    await expect(dialog.locator('[data-testid^="combo-model-row-"]').first()).toBeVisible();

    const submit = page.getByTestId("combo-form-submit");
    await expect(submit).toBeEnabled();
    await submit.scrollIntoViewIfNeeded();
    const createPost = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/combos") &&
        !res.url().includes("/metrics") &&
        !res.url().includes("/test") &&
        res.ok(),
      { timeout: 30_000 }
    );
    await submit.click();
    await createPost;

    const warningToast = page
      .getByRole("alert")
      .filter({ hasText: /not in the known model list/i });
    await expect(warningToast).toHaveCount(1);
    // The copy must not assert the models are invalid — the validator does not know that.
    await expect(warningToast).not.toContainText(/invalid|will fail/i);
  });

  // The headline criterion: applying any enabled template leaves the form immediately
  // saveable, with no further user edits. Three of five templates previously applied no
  // models at all, which left Save blocked.
  for (const templateId of [
    "free-stack",
    "high-availability",
    "cost-saver",
    "balanced",
    "paid-premium",
  ]) {
    test(`applying "${templateId}" leaves the form saveable and saves cleanly`, async ({
      page,
    }) => {
      let created: ComboPayload | null = null;
      await stubDashboard(page, {
        connections: ALL_PROVIDER_KINDS,
        // cost-saver admits priced models only; a custom model is the one catalog entry
        // whose price this spec controls.
        providerModels: { openai: [{ id: "qa-priced-model", name: "QA Priced Model" }] },
        // Claude's catalog is fetched live per connection, not shipped in the static one,
        // so paid-premium has nothing to select without this.
        liveModels: {
          "conn-claude": [
            { id: "qa-claude-a", name: "QA Claude A" },
            { id: "qa-claude-b", name: "QA Claude B" },
          ],
        },
        pricing: { openai: { "qa-priced-model": { input: 0.001, output: 0.002 } } },
        onCreate: (payload) => {
          created = payload;
        },
      });

      const dialog = await openCreateModal(page);
      const template = dialog.locator(`[data-template-id="${templateId}"]`);
      await expect(template).toHaveAttribute("aria-disabled", "false");
      await template.click();

      await expect(dialog.locator('[data-testid^="combo-model-row-"]').first()).toBeVisible();
      await expect(dialog.locator('[data-testid="combo-save-blockers"]')).toHaveCount(0);

      const submit = page.getByTestId("combo-form-submit");
      await expect(submit).toBeEnabled();
      await submit.scrollIntoViewIfNeeded();

      const createPost = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/api/combos") &&
          !res.url().includes("/metrics") &&
          !res.url().includes("/test") &&
          res.ok(),
        { timeout: 30_000 }
      );
      await submit.click();
      await createPost;

      expect(created).not.toBeNull();
      const payload = created as unknown as ComboPayload;
      expect(payload.models?.length ?? 0).toBeGreaterThan(0);
      // limitedFreeTier is a UI-only provenance marker and must never reach the API.
      for (const model of payload.models ?? []) {
        expect(Object.keys(model)).not.toContain("limitedFreeTier");
      }
    });
  }
});
