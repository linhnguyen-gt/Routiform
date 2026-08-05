import { githubCopilotCatalogModels } from "@/shared/constants/github-copilot-models";

/**
 * Derived view — the catalog itself lives in `src/shared/constants/github-copilot-models.ts`,
 * shared with `OAUTH_PROVIDERS.github.models` so the routing registry and this endpoint
 * cannot list different models. This file used to hold its own hand-maintained copy, and
 * the two had drifted to 23 vs 20 entries with five IDs in one and not the other.
 */
export const OFFICIAL_GITHUB_COPILOT_MODELS = githubCopilotCatalogModels();
