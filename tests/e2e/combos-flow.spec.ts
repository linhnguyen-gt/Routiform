import { expect, test } from "@playwright/test";

type ComboStub = {
  id: string;
  name: string;
  strategy: string;
  models: unknown[];
  config: Record<string, unknown>;
  isActive: boolean;
};

type ComboCreatePayload = {
  name?: string;
  strategy?: string;
  models?: unknown[];
  config?: Record<string, unknown>;
};

test.describe("Combos flow", () => {
  test("applies template, creates combo, and runs quick test CTA", async ({ page }) => {
    const state: {
      combos: ComboStub[];
      nextId: number;
      comboTestRequests: number;
    } = {
      combos: [],
      nextId: 1,
      comboTestRequests: 0,
    };

    await page.route("**/api/combos/test", async (route) => {
      state.comboTestRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resolvedBy: "openai/qa-test-model",
          results: [{ model: "openai/qa-test-model", status: "ok", latencyMs: 42 }],
        }),
      });
    });

    await page.route("**/api/combos/metrics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ metrics: {} }),
      });
    });

    await page.route("**/api/settings/proxy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ combos: {} }),
      });
    });

    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connections: [{ id: "conn-openai", provider: "openai", testStatus: "active" }],
        }),
      });
    });

    await page.route("**/api/provider-nodes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ nodes: [] }),
      });
    });

    await page.route("**/api/models/alias", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ aliases: {} }),
      });
    });

    await page.route("**/api/provider-models", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: {
            openai: [{ id: "qa-test-model", name: "QA Test Model" }],
          },
        }),
      });
    });

    await page.route("**/api/pricing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          openai: {
            "qa-test-model": {
              input: 0.01,
              output: 0.02,
            },
          },
        }),
      });
    });

    await page.route("**/api/combos", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ combos: state.combos }),
        });
        return;
      }

      if (method === "POST") {
        const payloadRaw = route.request().postDataJSON();
        const payload =
          payloadRaw && typeof payloadRaw === "object" ? (payloadRaw as ComboCreatePayload) : {};
        const comboId = `combo-${state.nextId++}`;
        const createdCombo = {
          id: comboId,
          name: payload.name || comboId,
          strategy: payload.strategy || "priority",
          models: payload.models || [],
          config: payload.config || {},
          isActive: true,
        };
        state.combos.push(createdCombo);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ combo: createdCombo }),
        });
        return;
      }

      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method not allowed in test stub" }),
      });
    });

    await page.goto("/dashboard/combos");
    await page.waitForLoadState("domcontentloaded");

    const redirectedToLogin = page.url().includes("/login");
    test.skip(redirectedToLogin, "Authentication enabled without a login fixture.");

    await expect(page.getByTestId("combos-header-create")).toBeVisible();
    await page.getByTestId("combos-header-create").click();

    const comboDialog = page.getByRole("dialog").first();
    await expect(comboDialog).toBeVisible();
    const comboCreateButton = page.getByTestId("combo-form-submit");
    const readinessPanel = comboDialog.locator('[data-testid="combo-readiness-panel"]');
    const saveBlockers = comboDialog.locator('[data-testid="combo-save-blockers"]');

    await expect(readinessPanel).toBeVisible();
    await expect(saveBlockers).toBeVisible();
    await expect(comboCreateButton).toBeDisabled();
    const applyRecommendationsButton = comboDialog
      .getByRole("button", { name: /apply recommendations|aplicar recomendações/i })
      .first();

    await expect(applyRecommendationsButton).toBeVisible();
    await comboDialog.locator('[data-testid="strategy-option-weighted"]').click();
    await expect(comboDialog.locator('[data-testid="strategy-change-nudge"]')).toBeVisible();
    await comboDialog.locator('[data-testid="strategy-option-priority"]').click();
    await expect(comboDialog.locator('[data-testid="strategy-change-nudge"]')).toBeVisible();
    await applyRecommendationsButton.click();

    await comboDialog
      .getByRole("button", { name: /high availability|alta disponibilidade/i })
      .click();
    await comboDialog.getByRole("button", { name: /add model|adicionar modelo/i }).click();

    const modelDialog = page.getByRole("dialog").last();
    await expect(modelDialog.getByRole("button", { name: /qa test model/i })).toBeVisible();
    await modelDialog.getByRole("button", { name: /qa test model/i }).click();
    // ModelSelectModal uses multiSelect: stays open until dismissed; backdrop blocks the combo form.
    await modelDialog.getByRole("button", { name: /close|fechar/i }).click();
    await expect(modelDialog).toBeHidden();

    await expect(saveBlockers).toHaveCount(0);
    await expect(comboCreateButton).toBeEnabled();

    await comboCreateButton.scrollIntoViewIfNeeded();
    const createPost = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/combos") &&
        !res.url().includes("/metrics") &&
        !res.url().includes("/test") &&
        res.ok(),
      { timeout: 30_000 }
    );
    await comboCreateButton.click();
    await createPost;
    await expect(comboDialog).toBeHidden({ timeout: 15_000 });

    const quickTestButton = page.getByRole("button", { name: /test now|testar agora/i });
    await expect(quickTestButton).toBeVisible();
    await quickTestButton.click();

    await expect
      .poll(() => state.comboTestRequests, {
        message: "Expected the quick test CTA to hit /api/combos/test once",
      })
      .toBe(1);

    const testResultsModal = page.getByRole("dialog").last();
    await expect(testResultsModal).toContainText(/qa-test-model/i);
  });
});
