/**
 * Search handler — public entry point.
 *
 * Implementation lives in ./search/*; this module keeps the historical
 * import path (`handlers/search.ts`) stable for the search route and tests.
 */
export type { SearchResult, SearchResponse } from "./search/types.ts";
export { handleSearch } from "./search/handler.ts";
