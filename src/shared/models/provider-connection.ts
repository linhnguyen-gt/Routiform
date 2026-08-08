/**
 * Shape returned by `GET /api/providers` → `{ connections }`.
 *
 * Fields are optional where the DDL (`src/lib/db/core.ts:59-98`) permits null or
 * where the row may predate the column. `id` and `provider` are required —
 * every consumer already assumes both.
 *
 * SECURITY: this type describes `/api/providers` ONLY, which strips `apiKey`,
 * `accessToken` and `refreshToken` (`src/app/api/providers/route.ts:132-141`).
 * Never apply it to `/api/providers/client` output — that route returns those
 * secrets unredacted (`src/app/api/providers/client/route.ts:17-29`), and typing
 * it with this interface would launder a secret through a safe-looking shape.
 */
export interface ProviderConnection {
  id: string;
  provider: string;
  name?: string;
  isActive?: number | boolean;
  testStatus?: string;
  priority?: number;
  authType?: string;
  credentialsConfigured?: boolean;
  /**
   * Requests this connection served in the recent window, and how many succeeded
   * (`src/lib/db/connectionUsageHealth.ts`). Both are absent when it served none — do not
   * default them to 0, which would read as "used and failed" for a brand-new connection.
   */
  recentAttempts?: number;
  recentSuccesses?: number;
  /**
   * Stored as JSON; may be a string or an already-parsed object depending on
   * row age. Narrow at the point of use, never with a cast.
   */
  providerSpecificData?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}
