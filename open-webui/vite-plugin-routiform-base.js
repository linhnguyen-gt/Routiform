/**
 * ROUTIFORM PATCH — rewrite Open WebUI's hardcoded root navigations to live under /owui.
 *
 * Why this exists, and why it is a build-time codemod rather than 79 edited files:
 *
 * SvelteKit's `paths.base` prefixes the app's own asset URLs, but it does NOT prefix
 * `goto('/x')` or `href="/x"` — the framework expects you to write `{base}/x` yourself.
 * Upstream Open WebUI is always mounted at the root of its own origin, so it hardcodes
 * `/`, `/auth`, `/c/<id>`, `/workspace/...` in 192 places across 79 files. Dropped under
 * /owui as-is, the very first boot redirect lands on Routiform's `/auth` and dies.
 *
 * Editing those 192 sites in the vendored tree would mean a merge conflict on every
 * upstream bump. This plugin does it during the build instead: the checkout stays clean,
 * and the whole fork surface is this one file.
 *
 * What is deliberately NOT rewritten:
 *   - Backend calls. Those already go through `WEBUI_BASE_URL` in src/lib/constants.ts.
 *   - Anything external (`//`, `http:`, `https:`) or already prefixed with /owui.
 *   - Template literals whose leading segment is dynamic.
 */

const BASE = '/owui';

// Internal roots Open WebUI navigates to. Anything not on this list is left alone, so a
// stray `href="/something-else"` fails loudly rather than being silently rewritten.
const ROOTS = [
	'auth',
	'c',
	'channels',
	'notes',
	'workspace',
	'admin',
	'playground',
	'automations',
	'calendar',
	'home',
	's'
];

const ROOT_ALT = ROOTS.join('|');

/**
 * Build a rewriter for `<prefix>/<root>...`, where the path is opened by a quote of any kind.
 *
 * One factory rather than three hand-written regexes because the hand-written ones disagreed:
 * the goto pattern accepted backticks and the cheap gate in transform() did not, so a file whose
 * only navigation was goto(`/c/${id}`) was skipped outright — silently, since the plugin only
 * fails when it rewrites NOTHING at all.
 */
const navRegex = (prefix) => new RegExp(`(${prefix}['"\`])/(?:(${ROOT_ALT})\\b|(?=['"\`]))`, 'g');

// goto('/x'), goto("/x"), goto(`/x...`)  — and the bare goto('/') root.
const GOTO = navRegex('goto\\(\\s*');

// href="/x"  and  href={`/x...`}
const HREF_ATTR = navRegex('href=');
const HREF_TPL = navRegex('href=\\{');

// href: '/x'  — an object PROPERTY, not an attribute. The sidebar's nav items are declared as a
// config map (Sidebar.svelte:155), so every one of Workspace / Notes / Automations / Calendar /
// Playground carried a bare root path that the `href=` pattern above never looked at.
const HREF_PROP = navRegex('href:\\s*');

/**
 * window.history.replaceState(history.state, '', `/c/${id}`)
 *
 * The one that actually bit us. SvelteKit's `base` is invisible to the raw History API, and this
 * is how Chat.svelte stamps the chat id into the address bar (Chat.svelte:2665, :2942) — so the
 * URL silently became `/c/<id>` instead of `/owui/c/<id>`. Everything kept working until the user
 * pressed reload, at which point the browser asked Next for a path that does not exist: 404.
 *
 * Matches only the THIRD argument (the url), leaving `replaceState(null, '', '?temporary-chat=true')`
 * — a query-only change, no leading slash — alone.
 */
const REPLACE_STATE = navRegex('history\\.replaceState\\(\\s*[^,]*,\\s*[^,]*,\\s*');

// The broken-image placeholder is a ROOT path ('/favicon.png' — safeImageUrl.ts:3, and the
// onerror handlers in Placeholder.svelte / ChatPlaceholder.svelte). Routiform's site root has no
// such file, so the fallback 404s, which fires onerror AGAIN, which reassigns the same dead URL:
// an infinite request loop that hammers the server with hundreds of 404s per page. Pointing it at
// the SPA's own asset makes the fallback actually load, and the loop stops at the first miss.
const FAVICON = /(['"`])\/favicon\.png(['"`])/g;

// Every pattern must earn its keep. Counted individually because the interesting failure is not
// "nothing matched" but "ONE of these matched nothing" — the replaceState hole shipped while the
// other four patterns were happily rewriting, so an all-or-nothing check saw a healthy build.
const PATTERNS = {
	goto: GOTO,
	hrefAttr: HREF_ATTR,
	hrefTpl: HREF_TPL,
	hrefProp: HREF_PROP,
	replaceState: REPLACE_STATE,
	favicon: FAVICON
};

const hits = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));

function rewrite(code) {
	let out = code;

	for (const [name, pattern] of Object.entries(PATTERNS)) {
		out = out.replace(pattern, (...args) => {
			hits[name] += 1;
			if (name === 'favicon') {
				const [, q1, q2] = args;
				return `${q1}${BASE}/static/favicon.png${q2}`;
			}
			const [, prefix, root] = args;
			return `${prefix}${BASE}/${root ?? ''}`;
		});
	}

	return out;
}

// Cheap pre-filter, kept in lockstep with the patterns above. It exists only to skip files that
// cannot match; a form missing HERE means the file is never even offered to rewrite(), which is
// how the backtick-goto case went unnoticed.
const CANDIDATE = /goto\(\s*['"`]\/|href="\/|href=\{`\/|href:\s*['"`]\/|history\.replaceState\(/;

export function routiformBase() {
	let rewritten = 0;

	return {
		name: 'routiform-base',
		enforce: 'pre',

		transform(code, id) {
			if (!/\.(svelte|ts|js)$/.test(id)) return null;
			if (!id.includes('/src/')) return null;
			if (!CANDIDATE.test(code)) return null;

			const out = rewrite(code);
			if (out === code) return null;
			rewritten += 1;
			return { code: out, map: null };
		},

		// `/static/*` in app.html is emitted by the SvelteKit template, not by a component,
		// so the transform hook never sees it.
		transformIndexHtml(html) {
			return html.replace(/(href|src)="\/static\//g, `$1="${BASE}/static/`);
		},

		closeBundle() {
			const summary = Object.entries(hits)
				.map(([name, n]) => `${name}=${n}`)
				.join(' ');
			console.log(`[routiform-base] ${rewritten} modules -> ${BASE}  (${summary})`);

			// Silence is the failure mode. A pattern that matches nothing means upstream moved that
			// navigation form somewhere this plugin no longer sees — and the result is not a build
			// error but a link that 404s in the user's browser, days later.
			const dead = Object.entries(hits)
				.filter(([, n]) => n === 0)
				.map(([name]) => name);

			if (dead.length > 0) {
				throw new Error(
					`[routiform-base] these patterns matched NOTHING: ${dead.join(', ')}. ` +
						`Upstream changed how it navigates; fix the patterns before shipping a build that 404s.`
				);
			}
		}
	};
}
