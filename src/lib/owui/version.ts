/**
 * The version the embedded chat reports, in one place.
 *
 * It is load-bearing in a way the name does not suggest: the SPA shows its "What's New" modal
 * whenever `settings.version !== config.version` ((app)/+layout.svelte:323). Routiform has no
 * Open WebUI release notes to show, so the two must agree by default — otherwise every visitor
 * is greeted by a changelog for a product they are not running.
 *
 * @module lib/owui/version
 */

export const OWUI_CONFIG_VERSION = "1.0.0";
