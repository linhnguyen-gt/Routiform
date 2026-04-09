# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [3.8.3](https://github.com/linhnguyen-gt/Routiform/compare/v3.8.2...v3.8.3) (2026-04-09)


### Bug Fixes

* **ci:** add debug logging to release notes extraction ([69f7a8f](https://github.com/linhnguyen-gt/Routiform/commit/69f7a8feef8f866fbf5b857ad4acd07c47571254))
* remove explicit any and update original project credits ([194a224](https://github.com/linhnguyen-gt/Routiform/commit/194a224a951e1742581ffa862f627b454a852b84))

### [3.8.2](https://github.com/linhnguyen-gt/Routiform/compare/v3.8.1...v3.8.2) (2026-04-09)


### Bug Fixes

* **kiro:** improve translator robustness and image handling ([3efd63c](https://github.com/linhnguyen-gt/Routiform/commit/3efd63cec9e14ea7806d899706221a36aecaf68a))

### [3.8.1](https://github.com/linhnguyen-gt/Routiform/compare/v3.8.0...v3.8.1) (2026-04-08)


### Bug Fixes

* **kiro:** harden openai-to-kiro payload translation ([10a0909](https://github.com/linhnguyen-gt/Routiform/commit/10a0909619a5d0be1ebb6e0586d6fddcac1a6426))

## [3.8.0](https://github.com/linhnguyen-gt/Routiform/compare/v3.7.2...v3.8.0) (2026-04-08)


### Features

* **context:** add context compression metrics tracking (Phase 4) ([e9c6c7c](https://github.com/linhnguyen-gt/Routiform/commit/e9c6c7c5a9a271df09ed1427c9e357f61e5ff145))
* **context:** implement context window validation and compression ([a6c29c6](https://github.com/linhnguyen-gt/Routiform/commit/a6c29c60796a767d1a81d9b8b653caa9c79d255d))


### Bug Fixes

* clean lint warnings and align provider integrations ([46674f8](https://github.com/linhnguyen-gt/Routiform/commit/46674f827c7f04d1d324612a82abea374d26dbf1))
* **codex:** sync live model catalogs across provider and combo UI ([e14abfa](https://github.com/linhnguyen-gt/Routiform/commit/e14abfa69fb664a7536852ea017e328a9ce9e2dd))
* **compat:** harden responses interoperability and oauth expiry UI ([4f0c68f](https://github.com/linhnguyen-gt/Routiform/commit/4f0c68fac8756690757ae26d80fb0a771ae45c5a))
* **qoder:** restore static model level mapping ([98effa9](https://github.com/linhnguyen-gt/Routiform/commit/98effa92af1c4ac59814d56a2680e5da34bb162e))
* **routing:** harden context compression and tool-call stability across providers ([c6d74b8](https://github.com/linhnguyen-gt/Routiform/commit/c6d74b8ab0cc6dd9065c7ce494531153b8f6942e))
* **settings:** align codex fast-tier copy with wire value ([b3262d9](https://github.com/linhnguyen-gt/Routiform/commit/b3262d9ce639552c4229cba1746a5307e4d12841))

### [3.7.2](https://github.com/linhnguyen-gt/Routiform/compare/v3.7.1...v3.7.2) (2026-04-07)


### Bug Fixes

* **cline:** skip forced local image tool enforcement ([4ca5e26](https://github.com/linhnguyen-gt/Routiform/commit/4ca5e260b0d045cebe9a0004c4c759a3c09738a6))

### [3.7.1](https://github.com/linhnguyen-gt/Routiform/compare/v3.7.0...v3.7.1) (2026-04-07)


### Bug Fixes

* **combo:** harden tool-choice compatibility fallback ([f7d71ce](https://github.com/linhnguyen-gt/Routiform/commit/f7d71ceea203994aa520e2b0fc97c89ac1b44bae))

## [3.7.0](https://github.com/linhnguyen-gt/Routiform/compare/v3.6.4...v3.7.0) (2026-04-07)


### Features

* **providers:** auto-sync and refresh available models ([1b2223f](https://github.com/linhnguyen-gt/Routiform/commit/1b2223f3f861d502093434283310795f03d904f5))


### Bug Fixes

* **combo:** improve fallback and provider model sync ([1a9d4ca](https://github.com/linhnguyen-gt/Routiform/commit/1a9d4cae653f3bcde7ecfc3ce6874c6c96ab3f09))

### [3.6.4](https://github.com/linhnguyen-gt/Routiform/compare/v3.6.3...v3.6.4) (2026-04-07)


### Bug Fixes

* **build:** handle EXDEV in isolated Next build ([12764d0](https://github.com/linhnguyen-gt/Routiform/commit/12764d0d58efe9cae6310e53dcef50d9facf29b3))
* **combo:** harden multimodal routing and retry fallbacks ([3af3420](https://github.com/linhnguyen-gt/Routiform/commit/3af34203d73593a6759b15358a06ddb8b120fbe9))
* **settings:** stabilize import-all secrets and combo 400 fallback ([54dfb7b](https://github.com/linhnguyen-gt/Routiform/commit/54dfb7b4657e4e581e058741eab796cb1b7b6439))

### [3.6.3](https://github.com/linhnguyen-gt/Routiform/compare/v3.6.2...v3.6.3) (2026-04-07)


### Bug Fixes

* **release:** generate concise notes from changelog section ([dcfc96b](https://github.com/linhnguyen-gt/Routiform/commit/dcfc96b4ffe9cd0cab2aaba09505805fe6556f82))

### [3.6.2](https://github.com/linhnguyen-gt/Routiform/compare/v3.6.1...v3.6.2) (2026-04-07)


### Bug Fixes

* **release:** parse linked changelog headings for notes ([7b19ac8](https://github.com/linhnguyen-gt/Routiform/commit/7b19ac82ef40841c70dadfc5798b4e0eb0560675))

### [3.6.1](https://github.com/linhnguyen-gt/Routiform/compare/v3.6.0...v3.6.1) (2026-04-07)


### Bug Fixes

* **publish:** compile MITM utilities with project TS settings ([b2fffed](https://github.com/linhnguyen-gt/Routiform/commit/b2fffede31da1927d655d1b7ff46a4259355493d))

## 3.6.0 (2026-04-07)


### Features

* **#248,#260:** TTS provider support + friendly display names ([#262](https://github.com/linhnguyen-gt/Routiform/issues/262)) ([44ee62e](https://github.com/linhnguyen-gt/Routiform/commit/44ee62e391d126fe1f3345893a00b54bb01e2f2b)), closes [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#260](https://github.com/linhnguyen-gt/Routiform/issues/260) [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#260](https://github.com/linhnguyen-gt/Routiform/issues/260) [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#260](https://github.com/linhnguyen-gt/Routiform/issues/260) [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#261](https://github.com/linhnguyen-gt/Routiform/issues/261) [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#261](https://github.com/linhnguyen-gt/Routiform/issues/261)
* 16 pain points docs, configurable User-Agent ([#155](https://github.com/linhnguyen-gt/Routiform/issues/155)), fix hardcoded $HOME ([#156](https://github.com/linhnguyen-gt/Routiform/issues/156)) ([afa2cea](https://github.com/linhnguyen-gt/Routiform/commit/afa2cea678cc23ea351fa7bde54ea66f1432cd02))
* **3.0.0-rc.3:** provider icons, model auto-sync, Gemini OAuth fix ([aa93a3f](https://github.com/linhnguyen-gt/Routiform/commit/aa93a3f2e266e8f0b673714c70f4751ec653542d)), closes [#529](https://github.com/linhnguyen-gt/Routiform/issues/529) [#488](https://github.com/linhnguyen-gt/Routiform/issues/488) [#537](https://github.com/linhnguyen-gt/Routiform/issues/537)
* **3.0.0-rc.4:** merge PR [#530](https://github.com/linhnguyen-gt/Routiform/issues/530) — OpenCode Zen and Go providers ([f3c5e55](https://github.com/linhnguyen-gt/Routiform/commit/f3c5e55b267d97c8e3471ad48fc513d7dccd3d62))
* **3.0.0-rc.5:** Registered Keys Provisioning API ([#464](https://github.com/linhnguyen-gt/Routiform/issues/464)) ([95ffc21](https://github.com/linhnguyen-gt/Routiform/commit/95ffc21b6001a56a4f1755e78cb1e8d30baece3d))
* ACP Agents dashboard + themeCoral i18n fix ([e4a11bd](https://github.com/linhnguyen-gt/Routiform/commit/e4a11bd6d0b59b2c7087e036fa27ff1ae401687b))
* add "Clear All Models" button on provider detail page ([8333f3d](https://github.com/linhnguyen-gt/Routiform/commit/8333f3d9de12ef44bb154b78d6fa96f233715f44))
* add /deploy-vps workflow for npm-based VPS deployment ([dc90211](https://github.com/linhnguyen-gt/Routiform/commit/dc902112227c3f53f6a096c10c7a298919aea9c7))
* add /v1/completions legacy endpoint + show all 3 OpenAI endpoints in dashboard ([1d7bc5f](https://github.com/linhnguyen-gt/Routiform/commit/1d7bc5fed736b93fe48d7dcf4cd694a23bbcdbae))
* add A2A protocol support and refactor API validation layer ([3510d8c](https://github.com/linhnguyen-gt/Routiform/commit/3510d8c0bcde52dcfcb8e48b7dca9c20c2512a3b))
* add alibaba cloud coding plan provider support ([#465](https://github.com/linhnguyen-gt/Routiform/issues/465)) ([3d0c8d8](https://github.com/linhnguyen-gt/Routiform/commit/3d0c8d8d4540318299db593b3081cfe32499f774))
* add API-key Kimi Coding provider path ([#463](https://github.com/linhnguyen-gt/Routiform/issues/463)) ([f89f407](https://github.com/linhnguyen-gt/Routiform/commit/f89f40778f53205ea70f6c84336efceab5598687))
* add authentication to alias API and improve model save error handling ([243cc4b](https://github.com/linhnguyen-gt/Routiform/commit/243cc4b60be461aeb94e38a96e179e86fe6918d3))
* add blackbox.ai to dashboard frontend ([#175](https://github.com/linhnguyen-gt/Routiform/issues/175)) ([7ba5763](https://github.com/linhnguyen-gt/Routiform/commit/7ba57634c16f60fa7a7a1c4fac483ad0fcbd9c5a))
* add cache control settings and token-based metrics ([26f7b36](https://github.com/linhnguyen-gt/Routiform/commit/26f7b36ce4aa19d05be76c5cbdea10264bb59778))
* add Codex auth.json export and apply-local buttons for CLI integration ([922dae8](https://github.com/linhnguyen-gt/Routiform/commit/922dae85461b5c09dd90841a160d89da4e44d724))
* add configurable context length to model metadata ([58264c8](https://github.com/linhnguyen-gt/Routiform/commit/58264c80dd50981a2358a324b7763795373a9431))
* add dashboard i18n with next-intl (EN + PT-BR), language selector in header ([f7fb68a](https://github.com/linhnguyen-gt/Routiform/commit/f7fb68a7987f72a08deb30bed61cbf506bb1bd7d))
* Add dashboard loading and error UIs, introduce standardized API response utilities, enhance call log redaction and configurable retention, and document architectural decisions. ([4c93f06](https://github.com/linhnguyen-gt/Routiform/commit/4c93f0618ca5b889dd0b854c686f1415e0f35bf0))
* add Electron desktop application support ([b004d04](https://github.com/linhnguyen-gt/Routiform/commit/b004d0472b3ff446c52d439a7f85e45d019c623b)), closes [#149](https://github.com/linhnguyen-gt/Routiform/issues/149)
* add enable/disable toggle to provider cards on main page ([4e37027](https://github.com/linhnguyen-gt/Routiform/commit/4e37027e1f88fcf2ac0a4e0ceb151c0190ce1109))
* add error pages, harden DB layer and compliance module ([85c6b63](https://github.com/linhnguyen-gt/Routiform/commit/85c6b63c8f6cf0204adfb4b917cfdcc667f7ae36))
* add GitHub issue templates for bug reports and feature requests ([ab0a905](https://github.com/linhnguyen-gt/Routiform/commit/ab0a90549912b8a29fc32bd5ca47d0419fbaca40))
* add GLM Coding usage/quota tracking with Z.AI session quota ([#698](https://github.com/linhnguyen-gt/Routiform/issues/698)) ([877cfa0](https://github.com/linhnguyen-gt/Routiform/commit/877cfa00719fcf5923bc8bf80b11f37b62879276))
* add GLM-5.1 to GLM Coding provider, update GLM-5 pricing ([abcf836](https://github.com/linhnguyen-gt/Routiform/commit/abcf836a0c3bebf3d74d100e2829787aad37fe0e))
* add global fallback provider support ([#689](https://github.com/linhnguyen-gt/Routiform/issues/689)) ([f1cddba](https://github.com/linhnguyen-gt/Routiform/commit/f1cddba938800343d485406c5b9cdc742272c302))
* add hidden Claude Code compatible provider ([190f02a](https://github.com/linhnguyen-gt/Routiform/commit/190f02a93910efda09833cc1d15d20cce1ba503e))
* Add i18n for new media and themes features, enhance combos with strategy guides and advanced settings, and introduce E2E tests for the combos flow. ([2b067c5](https://github.com/linhnguyen-gt/Routiform/commit/2b067c5d00a06cd693e9beeb30f31ac5e4a58df3))
* add i18n translations for Model Aliases & Background Degradation + restructure Endpoint page ([b7a6c56](https://github.com/linhnguyen-gt/Routiform/commit/b7a6c563acd31274f49ef454fe75469de7e98ad4))
* add Kiro credit tracking in usage fetcher ([#337](https://github.com/linhnguyen-gt/Routiform/issues/337)) ([4643c19](https://github.com/linhnguyen-gt/Routiform/commit/4643c19abc5e7c0447d25ecf5e906857d12260d3))
* add MCP multi-transport (stdio + SSE + Streamable HTTP) ([e09d4a0](https://github.com/linhnguyen-gt/Routiform/commit/e09d4a02a25dffde8dc002909140828245056cdc))
* add MCP server mode with --mcp flag for IDE integration ([7eb45b2](https://github.com/linhnguyen-gt/Routiform/commit/7eb45b2e197555c2b93d8702c2b2d27b858f497c))
* add MCP server, A2A protocol, auto-combo engine & VS Code extension ([bddec84](https://github.com/linhnguyen-gt/Routiform/commit/bddec84f4e57ad3861ed8fcd54cfc80d2c0620dd))
* add MCP/A2A enable/disable toggle switches on Endpoints page ([396ab2b](https://github.com/linhnguyen-gt/Routiform/commit/396ab2bab5858f9bd37740a7fb33c92dfb362005))
* add Memory & Skill Injection from Proxy (Network Level) ([e6e5482](https://github.com/linhnguyen-gt/Routiform/commit/e6e54822f58116a18958a3fe98f44064e44180bc)), closes [#812](https://github.com/linhnguyen-gt/Routiform/issues/812)
* add new internationalization message files for multiple languages and update Portuguese (Brazil) messages. ([3d7d02a](https://github.com/linhnguyen-gt/Routiform/commit/3d7d02a10a8510c868f05ee7a2eb5a6d9b39ee05))
* add new providers & modalities (TTS, STT, Image, Video, Music) ([4a779df](https://github.com/linhnguyen-gt/Routiform/commit/4a779dfe3cd275772a15c738bd005e9757ce874b))
* add per-provider auto-sync for model lists ([6eda0f4](https://github.com/linhnguyen-gt/Routiform/commit/6eda0f4d00dc257bf33902491e429042de829b3f))
* add Phase 3 advanced MCP tools and A2A smart routing skill ([e18cfe1](https://github.com/linhnguyen-gt/Routiform/commit/e18cfe1d80c63250c0401bc20bd04e9988de4ca5))
* add Plus tier as separate category in ProviderLimits ([93a220b](https://github.com/linhnguyen-gt/Routiform/commit/93a220ba83914f63ba0b6dc267a18852e40abbda))
* add provider-level proxy button in Connections header ([5a65585](https://github.com/linhnguyen-gt/Routiform/commit/5a65585c1656604e55ed67737e9810cfae61b81f))
* add Qwen compatibility with updated user agent and CLI fingerprint settings ([#352](https://github.com/linhnguyen-gt/Routiform/issues/352)) ([5cff98e](https://github.com/linhnguyen-gt/Routiform/commit/5cff98ea750c7cae8a001976863b438c8cf67018))
* add real Gemini CLI quota tracking via retrieveUserQuota API ([35e2892](https://github.com/linhnguyen-gt/Routiform/commit/35e2892b982b3d8585ddbe8a91267d3e446832b1))
* Add requested model to logs, enhance background task detection, and introduce AI SDK compatibility utilities. ([c34b3f4](https://github.com/linhnguyen-gt/Routiform/commit/c34b3f41bdc904bd3e48dff50a3ea3a22ff42c11))
* add responses subpath passthrough for codex ([#457](https://github.com/linhnguyen-gt/Routiform/issues/457)) ([8420e56](https://github.com/linhnguyen-gt/Routiform/commit/8420e565d4943277b2f3dafa3c931b3e1196cc89))
* add source code archives to releases ([876a5a9](https://github.com/linhnguyen-gt/Routiform/commit/876a5a98f480bd37ca39e4fe531c5b02f28902d5))
* add theme color settings and complete media/theme i18n ([6e2816f](https://github.com/linhnguyen-gt/Routiform/commit/6e2816f08b2031dfdb499abf1e4cba2ef8db152f))
* add Turkish translations ([8ed452d](https://github.com/linhnguyen-gt/Routiform/commit/8ed452d9ea9d3da365bb7395a4552442f157e328))
* add TypeScript types and modularize translator registry ([2086087](https://github.com/linhnguyen-gt/Routiform/commit/20860877b8d4573f5034c2163eaf42777db82ae4))
* add unit tests for registryUtils, media playground page, TypeScript fixes ([e11bcc2](https://github.com/linhnguyen-gt/Routiform/commit/e11bcc2848c40842d04536c78daec0551f601c28))
* add update notification banner to dashboard homepage (resolves [#552](https://github.com/linhnguyen-gt/Routiform/issues/552)) ([3cccc48](https://github.com/linhnguyen-gt/Routiform/commit/3cccc480fbffeef98c8fb96fe18591b6763f8947))
* add vision capability metadata to /v1/models response ([a6e78cd](https://github.com/linhnguyen-gt/Routiform/commit/a6e78cd5dcf4b6864becb1270ab3f907837e44e9))
* add Windows portable standalone exe ([c9cdd51](https://github.com/linhnguyen-gt/Routiform/commit/c9cdd5109b3f655bc8ed65144f24aa73eb073726))
* Add Zed IDE OAuth credential import support ([4ad66bf](https://github.com/linhnguyen-gt/Routiform/commit/4ad66bf7b91a61e0bde9b4d28cb491b047b4bdf7))
* allow custom User-Agent per provider connection ([#975](https://github.com/linhnguyen-gt/Routiform/issues/975)) ([dd556b4](https://github.com/linhnguyen-gt/Routiform/commit/dd556b44e80adf26036beb905a13e4481bba2969))
* **analytics:** add diversity score card UI and diversity API route ([11dfdbb](https://github.com/linhnguyen-gt/Routiform/commit/11dfdbb7a3afa580cb0071ee2d6bffa15a46f5d7))
* **analytics:** add subscription utilization analytics ([#847](https://github.com/linhnguyen-gt/Routiform/issues/847)) ([9227964](https://github.com/linhnguyen-gt/Routiform/commit/9227964cb6993601177193e56adaba5603616d84))
* API Endpoints dashboard — interactive catalog, webhooks, OpenAPI viewer ([80cc734](https://github.com/linhnguyen-gt/Routiform/commit/80cc7340ac7925d4629d599defecec4755e2cc4c))
* **api-compat:** response sanitization, role normalization, structured output for Gemini ([ed05599](https://github.com/linhnguyen-gt/Routiform/commit/ed05599cddcc2c0b836c91e228b998942137bcf6))
* **api-manager:** enhance with usage stats, status badges, and stats dashboard ([#118](https://github.com/linhnguyen-gt/Routiform/issues/118)) ([ce6d7dc](https://github.com/linhnguyen-gt/Routiform/commit/ce6d7dc6bffebca51c191e9a926ed20addb6df59))
* **api-manager:** implement API key management with new endpoints and UI ([d2bee37](https://github.com/linhnguyen-gt/Routiform/commit/d2bee37e7663f3f8282e9ad4007bc139a5c336ca))
* **api:** add custom endpoint paths for compatible provider nodes ([e250299](https://github.com/linhnguyen-gt/Routiform/commit/e25029939d006f7267630f7f11eed06cadb5da56))
* **api:** add external pricing sync with LiteLLM source ([192c06c](https://github.com/linhnguyen-gt/Routiform/commit/192c06cadf19e072b1b7cf6480d70eb01bff0c0d))
* **api:** add JWT session auth fallback for models endpoint ([a40c463](https://github.com/linhnguyen-gt/Routiform/commit/a40c463a879a2666d54f91fda7f8aefc0a48b6db))
* **api:** add Kilo Gateway provider (335+ models, 6 free, auto-routing) ([08256a3](https://github.com/linhnguyen-gt/Routiform/commit/08256a3502f8598342665f10e89a032c74ab1634))
* **api:** add Synthetic as a new API key provider ([d139b45](https://github.com/linhnguyen-gt/Routiform/commit/d139b4557f20f69d55010135905d55ed29fb0c75)), closes [#6366F1](https://github.com/linhnguyen-gt/Routiform/issues/6366F1)
* **api:** catalog and v1beta read from synced Gemini models ([5b140d2](https://github.com/linhnguyen-gt/Routiform/commit/5b140d26c30fbba73a48c981aa20089ad83b4725))
* **api:** JWT session auth for models endpoint + refactor (v1.2.0) ([a17583d](https://github.com/linhnguyen-gt/Routiform/commit/a17583d3fc797f465e9ee61f631d0caeffdc5ec2)), closes [#110](https://github.com/linhnguyen-gt/Routiform/issues/110) [#110](https://github.com/linhnguyen-gt/Routiform/issues/110)
* **audio:** route audio requests to local provider_nodes ([25aab8c](https://github.com/linhnguyen-gt/Routiform/commit/25aab8c55c6fb8a221b8f326917a32c4faa205dd))
* **auto-combo:** add tierPriority factor label + autoCombo i18n section (30 languages) ([9055fc2](https://github.com/linhnguyen-gt/Routiform/commit/9055fc21292d9cdc21ec0acb99b84b6b8eef8695))
* auto-disable banned accounts setting with UI toggle ([82dd4aa](https://github.com/linhnguyen-gt/Routiform/commit/82dd4aa403f718e22041d1bb781f33f66e466c2d))
* auto-disable permanently banned provider accounts (with Settings toggle) ([#765](https://github.com/linhnguyen-gt/Routiform/issues/765)) ([f0912fe](https://github.com/linhnguyen-gt/Routiform/commit/f0912feefb181132c15802e641c44bb329edb779))
* **bootstrap:** zero-config auto-generated secrets on first run ([af46f87](https://github.com/linhnguyen-gt/Routiform/commit/af46f87eed86bd4aa42cf803c7a0834462d75ca1)), closes [#252](https://github.com/linhnguyen-gt/Routiform/issues/252) [#249](https://github.com/linhnguyen-gt/Routiform/issues/249)
* **cache:** add OpenAI prompt_cache_key and Gemini cachedContent support ([f99c90d](https://github.com/linhnguyen-gt/Routiform/commit/f99c90dc85f4a91cfee648aa45fbbc3da66e8e57))
* **cache:** fix cache page to display prompt cache metrics and trend data ([d043e7a](https://github.com/linhnguyen-gt/Routiform/commit/d043e7a242831b1c4ebcc06ec089467789f270fb)), closes [#813](https://github.com/linhnguyen-gt/Routiform/issues/813)
* **cache:** fix cache page to display prompt cache metrics and trend data ([ae1a0f4](https://github.com/linhnguyen-gt/Routiform/commit/ae1a0f411b7f2e96c81faae7a018d90659c597a2)), closes [#813](https://github.com/linhnguyen-gt/Routiform/issues/813)
* **cache:** implement dynamic cache components with TDD ([3f7765f](https://github.com/linhnguyen-gt/Routiform/commit/3f7765fdc80ec9c954830d6a995f0b2f7312ef83))
* **cache:** persistent metrics, cache entry browser, settings UI, MCP tools, prefix analyzer ([6780485](https://github.com/linhnguyen-gt/Routiform/commit/678048505109d6795db459082e7a7e44097756f2)), closes [#813](https://github.com/linhnguyen-gt/Routiform/issues/813) [#813](https://github.com/linhnguyen-gt/Routiform/issues/813)
* **cache:** persistent metrics, cache entry browser, settings UI, MCP tools, prefix analyzer ([fec585e](https://github.com/linhnguyen-gt/Routiform/commit/fec585e44bc160d69d0181c5d693297cbb8f4d38)), closes [#813](https://github.com/linhnguyen-gt/Routiform/issues/813) [#813](https://github.com/linhnguyen-gt/Routiform/issues/813)
* call log response content, per-model tool call ID, key PATCH & validation ([#470](https://github.com/linhnguyen-gt/Routiform/issues/470)) ([601cc21](https://github.com/linhnguyen-gt/Routiform/commit/601cc21a441c813347f7702d0b3f388af4861a5a))
* **catalog:** use stored inputTokenLimit for custom model context_length ([49ac0ca](https://github.com/linhnguyen-gt/Routiform/commit/49ac0cadfbb01815a9341d9c44cb05963441da45))
* **claude:** support [1m] suffix for 1M context window ([623c63b](https://github.com/linhnguyen-gt/Routiform/commit/623c63baf6665d84f7595e4e4c0dd4d0e2f6d810))
* **clawrouter:** implement 14 ClawRouter-inspired features ([e063eae](https://github.com/linhnguyen-gt/Routiform/commit/e063eae7270fac408fb899419a11cc1e92ec111c))
* CLI fingerprint UI toggle + fix playground i18n ([#223](https://github.com/linhnguyen-gt/Routiform/issues/223)) ([2d80913](https://github.com/linhnguyen-gt/Routiform/commit/2d8091340f859af0a28695371a0e18b6af62d09a))
* **cli:** detect native binary platform from file header instead of dlopen ([69d28be](https://github.com/linhnguyen-gt/Routiform/commit/69d28bec4d39dd18b5994540f958c7fde82835dc))
* **cliproxyapi:** add DB schema, upstream proxy config & settings UI ([8fc97a7](https://github.com/linhnguyen-gt/Routiform/commit/8fc97a7f91e4a44152f5686fd24fd1c289dfdf6e)), closes [#902](https://github.com/linhnguyen-gt/Routiform/issues/902)
* **cliproxyapi:** add executor, proxy routing with SSRF guard & module-level cache ([d82a704](https://github.com/linhnguyen-gt/Routiform/commit/d82a7040f15f9e0776c2fc5b941fb35c886e9da4)), closes [#902](https://github.com/linhnguyen-gt/Routiform/issues/902)
* **cliproxyapi:** add version manager service, API routes, CLI Tools UI & Docker ([2e2afa6](https://github.com/linhnguyen-gt/Routiform/commit/2e2afa616d0ae8232a205bf08a98283b9366fae7)), closes [#902](https://github.com/linhnguyen-gt/Routiform/issues/902)
* **codex:** add account-level 5h/weekly quota policy and auto-rotation ([0e30d15](https://github.com/linhnguyen-gt/Routiform/commit/0e30d15c0112e68c3f003506c95353f7b6254114))
* **codex:** add fast tier settings toggle ([00188f7](https://github.com/linhnguyen-gt/Routiform/commit/00188f75ae7430fb7a338d5b98cfe3e3afffae9c))
* **codex:** add workspace binding via chatgpt-account-id header ([0610909](https://github.com/linhnguyen-gt/Routiform/commit/0610909116fb0f5e2e7ab41fabf0ef5da8ed1609))
* **codex:** enhance base64 decoding for UTF-8 compatibility in JWT parsing ([b26cc2a](https://github.com/linhnguyen-gt/Routiform/commit/b26cc2a82ea3a4c79980c8f466011d2c82861150))
* color-coded proxy badge with IP display ([4e3b363](https://github.com/linhnguyen-gt/Routiform/commit/4e3b363ba6ce39db3095adff184b5a1d79a283c6))
* combo agents, auto-update UI, detailed logs, MITM Kiro ([#399](https://github.com/linhnguyen-gt/Routiform/issues/399) [#401](https://github.com/linhnguyen-gt/Routiform/issues/401) [#320](https://github.com/linhnguyen-gt/Routiform/issues/320) [#378](https://github.com/linhnguyen-gt/Routiform/issues/378) [#336](https://github.com/linhnguyen-gt/Routiform/issues/336)) ([d56fae0](https://github.com/linhnguyen-gt/Routiform/commit/d56fae0a7b09611d622334c43c8220dc8f463822))
* combo enable/disable toggle + provider toggle always visible ([0deeaf5](https://github.com/linhnguyen-gt/Routiform/commit/0deeaf5ffbe1e27abe50b20f2d863c626c02c0f5))
* **combo:** response quality validation, circuit breaker fix, Cursor 4.6 models ([#762](https://github.com/linhnguyen-gt/Routiform/issues/762)) ([93bbe8e](https://github.com/linhnguyen-gt/Routiform/commit/93bbe8e7a853e171d2be212ffbaec5fa4d69bcbc))
* **compat:** per-protocol model compatibility config (V5) ([a2d7cbe](https://github.com/linhnguyen-gt/Routiform/commit/a2d7cbe8febe0c42b6c335bbbc6a9848207302ce))
* complete Auto-Combo CRUD and fix missing translations ([f516140](https://github.com/linhnguyen-gt/Routiform/commit/f5161404cbd05b5effdfdd7f826031dcc46bd086))
* complete i18n migration — 21 pages/components translated + PT-BR README section ([0d13f46](https://github.com/linhnguyen-gt/Routiform/commit/0d13f4645cc1e7b6c2705fc04abb00837d88f99d))
* complete memory and skills implementation for antigravity ([667bda6](https://github.com/linhnguyen-gt/Routiform/commit/667bda6afba4b240fbe7db7e32543f4b0523c5da))
* configurable tool name prefix ([#199](https://github.com/linhnguyen-gt/Routiform/issues/199)) and custom rpm/tpm rate limits ([#198](https://github.com/linhnguyen-gt/Routiform/issues/198)) ([5a53c17](https://github.com/linhnguyen-gt/Routiform/commit/5a53c17e812afbf9f250b638972caaa0e4ca5a6d))
* consolidate Endpoint, MCP, A2A into tabbed Endpoints page ([0f22f38](https://github.com/linhnguyen-gt/Routiform/commit/0f22f38f7eb5e3599e9b9c1792598cd08784a945))
* **core:** api key protection, provider blocking, windows fix, ui and docs ([340dcf9](https://github.com/linhnguyen-gt/Routiform/commit/340dcf9515027437aa725b470f4a4b689bba2163))
* **dashboard,sse,api:** per-model upstream headers, compat PATCH, chat alignment ([a8ca887](https://github.com/linhnguyen-gt/Routiform/commit/a8ca88797ad01d18ddea515862491c0a5d215404))
* **dashboard:** add Cache Management page with stats, hit rate, and targeted invalidation ([#701](https://github.com/linhnguyen-gt/Routiform/issues/701)) ([e6f0a78](https://github.com/linhnguyen-gt/Routiform/commit/e6f0a780b71afa259b6116fc875aae3f7f376b67))
* **dashboard:** bulk connection delete, model test, Qoder OAuth flags ([5d0de1d](https://github.com/linhnguyen-gt/Routiform/commit/5d0de1d75c4e54d2d1488e7ca03cde4152ec1ac2))
* **dashboard:** fix Playground account selector & CLI Tools dynamic model listing ([fb97c11](https://github.com/linhnguyen-gt/Routiform/commit/fb97c1114013ecc37ad91056f06f37760387ba78))
* **dashboard:** Gemini Available Models reads from API sync, hide Custom Models ([125fb81](https://github.com/linhnguyen-gt/Routiform/commit/125fb81fa39f6edcd3ac4fc95924618348a402ff))
* **dashboard:** multi-select and toggle models in Add Model to Combo ([4689ddf](https://github.com/linhnguyen-gt/Routiform/commit/4689ddf4c986c155eb0be4f85e244d9dd3a6251d))
* **dashboard:** Routiform analytics, provider diversity, charts UX ([327e7ae](https://github.com/linhnguyen-gt/Routiform/commit/327e7aeefb24569b79c7d33bc56315d5f903f22c))
* **db:** add syncedAvailableModels namespace and CRUD functions ([9e4132f](https://github.com/linhnguyen-gt/Routiform/commit/9e4132fd3f3e2e4a5dc92b4ff3657c664a88c39e))
* **db:** extend replaceCustomModels with metadata fields ([bd5f39e](https://github.com/linhnguyen-gt/Routiform/commit/bd5f39e1c6a89b948c5e147344813493bfe21310))
* **docs:** add i18n multi-language support for documentation ([0f49f82](https://github.com/linhnguyen-gt/Routiform/commit/0f49f824056f1c2a7358c348a6954dc3b88d25a8))
* **domain:** add configuration audit trail with diff detection and rollback ([94a5e43](https://github.com/linhnguyen-gt/Routiform/commit/94a5e43e5d126e1ff7a92d15cf70b46b2be0a8cb)), closes [#791](https://github.com/linhnguyen-gt/Routiform/issues/791)
* **domain:** add graceful degradation framework with multi-layer fallback ([67592d8](https://github.com/linhnguyen-gt/Routiform/commit/67592d80aa3c6285352d62d5f327dbd4b9c44080)), closes [#799](https://github.com/linhnguyen-gt/Routiform/issues/799)
* **domain:** add provider expiration tracking with proactive alerts ([26958f8](https://github.com/linhnguyen-gt/Routiform/commit/26958f8f701ba61e73648bd89674728cb5b40368)), closes [#790](https://github.com/linhnguyen-gt/Routiform/issues/790)
* **electron:** add auto-update functionality with electron-updater ([3342d5b](https://github.com/linhnguyen-gt/Routiform/commit/3342d5b9319c05b2ecd1d53f29ac1461e4ecce0f))
* **electron:** add official icons and release workflow ([#154](https://github.com/linhnguyen-gt/Routiform/issues/154)) ([2a79b83](https://github.com/linhnguyen-gt/Routiform/commit/2a79b833fb643b9e64cc20613adf51babe1a240e))
* **embeddings:** route embedding requests to local provider_nodes ([1e3a2e0](https://github.com/linhnguyen-gt/Routiform/commit/1e3a2e0a27115624c4a17254d87e0dbd5a270c53))
* endpoint-aware model management + fix 3 bugs ([#212](https://github.com/linhnguyen-gt/Routiform/issues/212), [#213](https://github.com/linhnguyen-gt/Routiform/issues/213), [#200](https://github.com/linhnguyen-gt/Routiform/issues/200)) ([228ebf4](https://github.com/linhnguyen-gt/Routiform/commit/228ebf436e3fed2f172cf249f7a26f0ea8ab505f)), closes [#204](https://github.com/linhnguyen-gt/Routiform/issues/204) [#205](https://github.com/linhnguyen-gt/Routiform/issues/205) [#206](https://github.com/linhnguyen-gt/Routiform/issues/206)
* enhance port configuration and API bridge support ([d0138a5](https://github.com/linhnguyen-gt/Routiform/commit/d0138a503741c3758431fc48e403b13f1ccb6a98))
* enhance runtime port management and configuration ([344e602](https://github.com/linhnguyen-gt/Routiform/commit/344e602b262c53ad92e519fbee7ff37eb524c9ca))
* extract shared auth utility a cooldown/availability checksnd fix custom provider model resolution ([4ea0426](https://github.com/linhnguyen-gt/Routiform/commit/4ea04260343510e65895b145b7a1094d6ed4d736))
* extract shared auth utility and fix custom provider model resolution ([2a90a05](https://github.com/linhnguyen-gt/Routiform/commit/2a90a0513226ef729c22266bb3277d49ad3a5e19))
* **favicon:** add custom favicon support ([1d47cad](https://github.com/linhnguyen-gt/Routiform/commit/1d47cadae881b7ad18259c66c60c0f49a6ef83f9))
* features 07/09/04/06 — codex clamp, openrouter cache, quota preflight & monitor ([1c2f553](https://github.com/linhnguyen-gt/Routiform/commit/1c2f553a7c43737fac8689b4df3b443217593e43))
* filter api/models by active providers + disabled indicator on provider cards (Closes [#81](https://github.com/linhnguyen-gt/Routiform/issues/81)) ([#85](https://github.com/linhnguyen-gt/Routiform/issues/85)) ([937a8f3](https://github.com/linhnguyen-gt/Routiform/commit/937a8f37141d30d8683fbd4970290dc65dc2b6fc))
* fix custom provider node matching in model resolution ([86c5666](https://github.com/linhnguyen-gt/Routiform/commit/86c566669c15f31bf557bb5162e9a8b9adfdf71b))
* free-stack combo, Deepgram transcription default, README free sections, provider hasFree badges ([1b6c502](https://github.com/linhnguyen-gt/Routiform/commit/1b6c502c7fbec7febec9db71cbd751d5257a7f32))
* **gemini:** auto-trigger model sync when API key is saved ([5c27e0f](https://github.com/linhnguyen-gt/Routiform/commit/5c27e0f9ef1fbe382f4f28d6029b09dba9b8372d))
* **gemini:** extract metadata from models API response ([f1805c8](https://github.com/linhnguyen-gt/Routiform/commit/f1805c853631c89421c65724f5a3d1f54fe1c9e2))
* **gemini:** per-connection model tracking with cleanup on key delete ([8ed0917](https://github.com/linhnguyen-gt/Routiform/commit/8ed091703fdf87cd10d03e689067312ad16f9903))
* **gemini:** per-model quota lockout instead of connection-wide ([0038fe5](https://github.com/linhnguyen-gt/Routiform/commit/0038fe5ff1c324294907e22bb56942d1117ab9b6))
* **gemini:** progress dialog on key save, remove hardcoded registry, categorize by endpoint ([2341bba](https://github.com/linhnguyen-gt/Routiform/commit/2341bba973cf725d86f8eb02420d4392d5248a20))
* GitHub Copilot config generator for CLI Tools ([#142](https://github.com/linhnguyen-gt/Routiform/issues/142)) ([a3153d8](https://github.com/linhnguyen-gt/Routiform/commit/a3153d893a2d1e094b5a5cfbb47d737d36d1066e))
* **github:** add gemini-3.1-pro-preview ([a7fa34c](https://github.com/linhnguyen-gt/Routiform/commit/a7fa34c2fcecfe71bdde16e935f4731d4fa803b1))
* **github:** Copilot parity, combo fallback, caps, CI fixes ([4505daa](https://github.com/linhnguyen-gt/Routiform/commit/4505daa1e9a496cfb731dd9f6161626081c33117))
* **google-cli:** add env escape hatch for body.project override ([c949214](https://github.com/linhnguyen-gt/Routiform/commit/c949214e99dbd08877b7952a301f312f85299497))
* **health:** add cryptography health check node ([#798](https://github.com/linhnguyen-gt/Routiform/issues/798)) ([20a72a0](https://github.com/linhnguyen-gt/Routiform/commit/20a72a0f451312f24a38ab42602af4291d6b83d4))
* **health:** background health check for local provider_nodes ([0aede2e](https://github.com/linhnguyen-gt/Routiform/commit/0aede2ef632335ba477c5b68f288f290cd27de60))
* **i18n:** add Arabic and Finnish translation files ([7bab9e0](https://github.com/linhnguyen-gt/Routiform/commit/7bab9e09d348d6731858d5be4b7a41d7f2ab6d8e))
* **i18n:** add placeholder validation to translation checker ([be6a53b](https://github.com/linhnguyen-gt/Routiform/commit/be6a53b3eb0638ef2e11ae2064944346f48be36a))
* **i18n:** add placeholder validation to translation checker ([d4b64ba](https://github.com/linhnguyen-gt/Routiform/commit/d4b64ba26b5fdf4122abc908ecd448b229821bb1))
* **i18n:** add strict-random strategy keys to all 33 languages ([ccabd09](https://github.com/linhnguyen-gt/Routiform/commit/ccabd0974235d4878ca13a66a8c56457e00c6d4a))
* **i18n:** add strict-random strategy keys to all 33 languages ([b1de2b1](https://github.com/linhnguyen-gt/Routiform/commit/b1de2b1a4a029c7a32d561367a460cd715045ec7))
* **i18n:** add windsurf guide steps to all 33 languages ([6f5c838](https://github.com/linhnguyen-gt/Routiform/commit/6f5c8389eba393ee2743857cdfcf48759a4b077c))
* **i18n:** add windsurf guide steps to all 33 languages ([ff00af6](https://github.com/linhnguyen-gt/Routiform/commit/ff00af60aeff3767df438c4d46e7d1a878b517bc))
* **i18n:** add windsurf guide steps to all 33 languages ([0f0a347](https://github.com/linhnguyen-gt/Routiform/commit/0f0a3474fd5ef9991c61598c5fb0728ae8eae5e8))
* **i18n:** internationalize dashboard and API manager components ([2126b0e](https://github.com/linhnguyen-gt/Routiform/commit/2126b0ee8dd1e8c5adc49e7c3b870d675b605448))
* **i18n:** migrate API Manager page (1008 lines, 43+ strings) ([e1fe304](https://github.com/linhnguyen-gt/Routiform/commit/e1fe304dd3c8db6e0a2a560e432061ac4350afdb))
* **i18n:** migrate audit-log, costs, logs, health pages + expand JSON keys ([1a98a6c](https://github.com/linhnguyen-gt/Routiform/commit/1a98a6c966a77468b160f19995fcb3f1518651a2))
* **i18n:** migrate CLI Tools main page ([d226d68](https://github.com/linhnguyen-gt/Routiform/commit/d226d682510593c2cf84076f91e07ee704fe4b62))
* **i18n:** migrate Combos page (1123 lines, 50+ strings) ([27b9c33](https://github.com/linhnguyen-gt/Routiform/commit/27b9c331b710a8b3b616395eff7d3e683a18a0b6))
* **i18n:** migrate Endpoint page (999 lines, 40+ strings) ([10d3120](https://github.com/linhnguyen-gt/Routiform/commit/10d3120cdf5034d7abeb4ebb4ca2b0d9ed041630))
* **i18n:** migrate onboarding wizard ([a601452](https://github.com/linhnguyen-gt/Routiform/commit/a6014524eff03197c9c35e0049bdf0a246ee4558))
* **i18n:** migrate Providers page (1110 lines, 30+ strings) ([87c7c83](https://github.com/linhnguyen-gt/Routiform/commit/87c7c83dd959ee0a6f96fd203cd8d4142384cb55))
* **i18n:** migrate providers/[id]/page.tsx — 30+ strings ([0844659](https://github.com/linhnguyen-gt/Routiform/commit/0844659e00c64f69af02aafa573666328869b943))
* **i18n:** migrate providers/new + AuditLogTab + remaining keys ([3d86ad7](https://github.com/linhnguyen-gt/Routiform/commit/3d86ad7dc85f71f26aac8bcd68ffdc29b67e5921))
* **i18n:** migrate Settings batch 2 — SecurityTab + RoutingTab (25+ strings) ([7f34835](https://github.com/linhnguyen-gt/Routiform/commit/7f34835693cd479233200d9c8f07a79506a77cd0))
* **i18n:** migrate Settings batch 3 — Session, IP, Compliance, Fallback (36+ strings) ([8592d02](https://github.com/linhnguyen-gt/Routiform/commit/8592d02951a1043f4063d9b994a3b21e097ec032))
* **i18n:** migrate Settings batch 4 — final 4 large tabs (80+ strings) ([481a630](https://github.com/linhnguyen-gt/Routiform/commit/481a630273fa70a5ea6a82a325a3acf52fb7e715))
* **i18n:** migrate Settings page batch 1 (7 files, 28+ strings) ([0ac264b](https://github.com/linhnguyen-gt/Routiform/commit/0ac264b39d3b9a5eb2da22abefa122e1d2bdaf13))
* **i18n:** migrate settings/pricing/page.tsx — full page (17 strings) ([e07edc6](https://github.com/linhnguyen-gt/Routiform/commit/e07edc663b31cc6898b5db91268d009143743e23))
* **i18n:** replace hardcoded strings with translation keys in HomePageClient ([107b9e8](https://github.com/linhnguyen-gt/Routiform/commit/107b9e8cd2fc47249ba918834756a61d52852012))
* **i18n:** replace remaining hardcoded strings with translation keys ([187aba0](https://github.com/linhnguyen-gt/Routiform/commit/187aba05140d0ac7b4cf936c430490f6495566e6))
* **i18n:** translation strings for memory and skills namespaces ([72203f2](https://github.com/linhnguyen-gt/Routiform/commit/72203f27213db40426149ab9b83463de2f1b60f9))
* Implement API authentication middleware, mask sensitive API keys, integrate prompt injection guard, and enhance onboarding error handling. ([16b7297](https://github.com/linhnguyen-gt/Routiform/commit/16b72970d721b0af037b1dc54c8cea53c8da5cbd))
* Implement graceful shutdown and body size guard middleware, and refine TypeScript typings across several routes and components. ([1a7b7e8](https://github.com/linhnguyen-gt/Routiform/commit/1a7b7e87999cc5f92b80a2a4da8c35bbb75dfa53))
* Implement historical model latency and success rate tracking for auto-combo routing and update Claude and Deepseek pricing and model registrations. ([a3deacd](https://github.com/linhnguyen-gt/Routiform/commit/a3deacd718496e4e2b90c1ff5dda89225417c098))
* Implement initial database schema and centralize CORS configuration across API routes. ([3aca5fa](https://github.com/linhnguyen-gt/Routiform/commit/3aca5fa691538950f4aac6850523017acc5cc568))
* implement proxy registry, management APIs, docs, and test hardening ([8091b6b](https://github.com/linhnguyen-gt/Routiform/commit/8091b6b50827b406afd677bb90e7dab03260f591))
* improve API configuration and script execution ([fb597c6](https://github.com/linhnguyen-gt/Routiform/commit/fb597c677e12713221e7b6850a804c0e990a2ebb))
* improve dashboard layout for smaller screens ([#659](https://github.com/linhnguyen-gt/Routiform/issues/659)) ([94a00cb](https://github.com/linhnguyen-gt/Routiform/commit/94a00cb6d618119f28766c424dfa2912dc1fd483))
* Improve the Chinese translation ([2722847](https://github.com/linhnguyen-gt/Routiform/commit/2722847a59f58029e605911fd898e7cffe148723))
* Improve the Chinese translation ([86cfc46](https://github.com/linhnguyen-gt/Routiform/commit/86cfc468bd141bad7ed82af2eb4eba41059767ad))
* Improve the Chinese translation ([#475](https://github.com/linhnguyen-gt/Routiform/issues/475)) ([102c42d](https://github.com/linhnguyen-gt/Routiform/commit/102c42dfe4336cd4ec7d4206269318d887b12dba))
* improvements from 9router analysis (T01/T08-T13) ([#351](https://github.com/linhnguyen-gt/Routiform/issues/351)) ([eaddb6f](https://github.com/linhnguyen-gt/Routiform/commit/eaddb6f0fa7a30c8e95a6c6c70409c110ef4d7d2)), closes [#276](https://github.com/linhnguyen-gt/Routiform/issues/276) [#296](https://github.com/linhnguyen-gt/Routiform/issues/296) [#340](https://github.com/linhnguyen-gt/Routiform/issues/340) [#341](https://github.com/linhnguyen-gt/Routiform/issues/341) [#344](https://github.com/linhnguyen-gt/Routiform/issues/344) [#302](https://github.com/linhnguyen-gt/Routiform/issues/302) [#73](https://github.com/linhnguyen-gt/Routiform/issues/73) [#302](https://github.com/linhnguyen-gt/Routiform/issues/302) [#73](https://github.com/linhnguyen-gt/Routiform/issues/73) [#73](https://github.com/linhnguyen-gt/Routiform/issues/73) [#302](https://github.com/linhnguyen-gt/Routiform/issues/302) [#74](https://github.com/linhnguyen-gt/Routiform/issues/74) [#180](https://github.com/linhnguyen-gt/Routiform/issues/180) [#73](https://github.com/linhnguyen-gt/Routiform/issues/73) [#74](https://github.com/linhnguyen-gt/Routiform/issues/74) [#180](https://github.com/linhnguyen-gt/Routiform/issues/180) [#360](https://github.com/linhnguyen-gt/Routiform/issues/360)
* integrate models.dev as authoritative model database with UI controls ([cc048e5](https://github.com/linhnguyen-gt/Routiform/commit/cc048e55bf8f0a1cf74ce971c37a951ce01a5e02)), closes [#979](https://github.com/linhnguyen-gt/Routiform/issues/979)
* **integration:** integrate ClawRouter services into active pipeline ([a3bc762](https://github.com/linhnguyen-gt/Routiform/commit/a3bc7620b115d52eb10712b2d3379a606282e7c1))
* Introduce A2A lifecycle management, add type safety to ComfyUI and stream handling, and update various handlers and translators. ([0d8f28a](https://github.com/linhnguyen-gt/Routiform/commit/0d8f28a4a4e68e8fda3a52f552bd5b9b88a71f67))
* Introduce combo readiness checks and strategy recommendations, updating i18n messages and e2e tests. ([0d3728e](https://github.com/linhnguyen-gt/Routiform/commit/0d3728efa4d378e5740b73e2f495a2c5a01cdf22))
* Introduce new A2A and MCP API routes, enhance dashboard UI, update READMEs, and add E2E tests. ([2113540](https://github.com/linhnguyen-gt/Routiform/commit/21135407af5ff28fd087dffff8faaa03cbf1adff))
* **kilocode:** add custom models endpoint and expanded model list ([5668e16](https://github.com/linhnguyen-gt/Routiform/commit/5668e16fbf9363fa0fdc11bddeef97585acb1a5e))
* **kimi-coding:** add Kimi Coding plan quota display ([#279](https://github.com/linhnguyen-gt/Routiform/issues/279)) ([ebd1e54](https://github.com/linhnguyen-gt/Routiform/commit/ebd1e5421bf10cc7ae7bd2d4d8d5cd9b03705ff9))
* **kimi-coding:** integrate Kimi Coding API for token refresh and usage tracking ([3991c96](https://github.com/linhnguyen-gt/Routiform/commit/3991c96c784bbe56ea717fcc560a2c0e8fa55041))
* **kimi-coding:** update platform and version for Kimi Coding integration ([6e1bf46](https://github.com/linhnguyen-gt/Routiform/commit/6e1bf4652d7293efc2aa0a51be7c108f9bf22135))
* **logging:** unify request log retention and artifacts ([f8d4e1a](https://github.com/linhnguyen-gt/Routiform/commit/f8d4e1a3077ee0c0e9f900a276633ffb4e861777))
* **logs:** add export button with time range dropdown (1h, 6h, 12h, 24h) ([7bcb58e](https://github.com/linhnguyen-gt/Routiform/commit/7bcb58e3db04734af2799fc7423226bffc4b367a))
* **logs:** add Logs Dashboard with real-time Console Viewer ([1e332ba](https://github.com/linhnguyen-gt/Routiform/commit/1e332babd65a95b2c19112ecde8ec1df798e018c))
* Make `providerId` nullable in `providersBatchTestSchema` and update validation to treat `null` as an absent value. ([7da23a9](https://github.com/linhnguyen-gt/Routiform/commit/7da23a90d4da5ffe01aac204bbbf9fea0c4292bc))
* make validate_translation.py support any language ([21ddcfc](https://github.com/linhnguyen-gt/Routiform/commit/21ddcfc866bdd4341a1d9dbf889234d4fdb9ddb9))
* **mcp:** add omniroute_web_search tool with execute:search scope ([a4d2b88](https://github.com/linhnguyen-gt/Routiform/commit/a4d2b8862b56b4e36c64569c6c38dfe5a27e1e84))
* **mcp:** register omniroute_web_search tool in MCP server ([#951](https://github.com/linhnguyen-gt/Routiform/issues/951)) ([a0cfae2](https://github.com/linhnguyen-gt/Routiform/commit/a0cfae214dca7fa9bfc4ce765ebc60ce3e5d8147))
* **media:** increase transcription file limit to 4GB with validation ([a655863](https://github.com/linhnguyen-gt/Routiform/commit/a655863855982390b0577917ec205e6e8acaf2e4))
* memory 500 fix, skills marketplace (SkillsMP), DB cleanup, LKGP toggle, and upstream 400 fixes ([0420144](https://github.com/linhnguyen-gt/Routiform/commit/04201441046ff7218c885f9902ed983cee3a223e)), closes [#949](https://github.com/linhnguyen-gt/Routiform/issues/949)
* **memory:** optimize RAM usage for low-memory deployments ([5a2fdac](https://github.com/linhnguyen-gt/Routiform/commit/5a2fdacebea23bfc8a67788c8c1d0644e3e9a4f9))
* migrate iFlow provider to Qoder AI ([#660](https://github.com/linhnguyen-gt/Routiform/issues/660)) ([a5393a3](https://github.com/linhnguyen-gt/Routiform/commit/a5393a3ec4e717f2ef97fe4f66f3bc836c996ba2))
* migrate tests to TypeScript and add MCP advanced tools test suite ([fe9d9a5](https://github.com/linhnguyen-gt/Routiform/commit/fe9d9a5a5cefc967058d819bb1ba9963206fc9dd))
* **models:** add pageSize=1000 and nextPageToken pagination for Gemini ([b1183c2](https://github.com/linhnguyen-gt/Routiform/commit/b1183c2c9db5b501024cf7c41acb1af24c4f2f28))
* normalize quota and combos API responses with shared contracts ([5ecef5c](https://github.com/linhnguyen-gt/Routiform/commit/5ecef5c90c4a52658c90c53c92ee0216ee9846a3))
* OmniRoute v1.0.0 — Intelligent AI Gateway & Universal LLM Proxy ([71d1420](https://github.com/linhnguyen-gt/Routiform/commit/71d14209a4c07c2bc8f05d8994114531c7651900))
* **open-sse:** add schema coercion and tool sanitization ([5532577](https://github.com/linhnguyen-gt/Routiform/commit/55325773dc68ffcd72f7a226e57dad19ddf43ed4))
* pass tools through CC compatible bridge ([a381e9a](https://github.com/linhnguyen-gt/Routiform/commit/a381e9aa3bf9dd3f07894e1653755f78bf704c3a))
* per-model combo routing support ([#563](https://github.com/linhnguyen-gt/Routiform/issues/563)) ([5dc3fd2](https://github.com/linhnguyen-gt/Routiform/commit/5dc3fd2ec0bd796ef0dc5d47462437121d6e6a71))
* Phase 1 & 2 implementation plan — T1-T10, T12 ([a87d643](https://github.com/linhnguyen-gt/Routiform/commit/a87d64372f1d2cc43d7c22f42ea18c9bc8e6a313))
* **phase2+3:** DI container, plugins, PII sanitizer, tool policy, audit log, cache invalidation, ARIA, CSS vars ([7efbfad](https://github.com/linhnguyen-gt/Routiform/commit/7efbfad9bde66ae0d0e3248f52a3f58ba5cbfc1d))
* **phase4:** focus indicators, session management, k6 load tests, remove [@ts-check](https://github.com/ts-check) ([0279341](https://github.com/linhnguyen-gt/Routiform/commit/0279341221c9a3476fa5a7727a55b1edfb6dd844))
* playground, CLI fingerprints, ACP support ([#234](https://github.com/linhnguyen-gt/Routiform/issues/234), [#223](https://github.com/linhnguyen-gt/Routiform/issues/223), [#235](https://github.com/linhnguyen-gt/Routiform/issues/235)) ([ac89069](https://github.com/linhnguyen-gt/Routiform/commit/ac89069671d321076bed4ededbb255f00b134e7e)), closes [#192](https://github.com/linhnguyen-gt/Routiform/issues/192) [#200](https://github.com/linhnguyen-gt/Routiform/issues/200)
* **playground:** add persistent Account/Key selector ([b2cabf0](https://github.com/linhnguyen-gt/Routiform/commit/b2cabf012200255c07e6c3da5b5d16a5c62ef254))
* protocol-scoped model compat (V3) ([13c4580](https://github.com/linhnguyen-gt/Routiform/commit/13c45807ef627a12dc6c9deb17bd9191eeb2dd56))
* **provider:** add Alibaba Cloud DashScope + path validation for custom endpoint paths ([605c3f9](https://github.com/linhnguyen-gt/Routiform/commit/605c3f9be12187a4f428bf797d24cb6179713ced)), closes [#400](https://github.com/linhnguyen-gt/Routiform/issues/400) [#400](https://github.com/linhnguyen-gt/Routiform/issues/400)
* **providers/logos:** add logos for 5 new free providers ([81b3034](https://github.com/linhnguyen-gt/Routiform/commit/81b3034c2f7b6e8b99d2b45fdfa6fc8b5c8cbd58))
* **providers:** add 4 free models to opencode-zen ([28c2fb9](https://github.com/linhnguyen-gt/Routiform/commit/28c2fb92a8a2419bb51a7de08dd66bfa82deeef1))
* **providers:** add Bailian Coding Plan provider with editable base URL ([#467](https://github.com/linhnguyen-gt/Routiform/issues/467)) ([246fd05](https://github.com/linhnguyen-gt/Routiform/commit/246fd05fae8a2f15536d70462b917a699d2d3449))
* **providers:** add contextLength for all opencode-zen models ([641f84e](https://github.com/linhnguyen-gt/Routiform/commit/641f84e9f8fad00140d1b1885adf832cb130ac32))
* **providers:** add explicit contextLength for opencode-zen free models ([1f0a584](https://github.com/linhnguyen-gt/Routiform/commit/1f0a5842f93b9e92fb5b4b56bfe8438508fadd62))
* **providers:** add LongCat AI, Pollinations, Cloudflare AI, Scaleway, AI/ML API ([6b9c275](https://github.com/linhnguyen-gt/Routiform/commit/6b9c2754e8766ffb0c57cee153039c627becfe58))
* **providers:** add OpenCode Zen and Go providers ([#530](https://github.com/linhnguyen-gt/Routiform/issues/530)) ([9c9d9b5](https://github.com/linhnguyen-gt/Routiform/commit/9c9d9b5a8dae42445b891d03e05cd6c545275f24))
* **providers:** add OpencodeExecutor for opencode-zen/go multi-format routing ([1aa1bc7](https://github.com/linhnguyen-gt/Routiform/commit/1aa1bc7a26d1bc2ffbd01c8f12ac1750989407d0))
* **providers:** adicionar provedor Puter AI com 500+ modelos ([7d7e9da](https://github.com/linhnguyen-gt/Routiform/commit/7d7e9da28ce9f5b9f886d517f7c3e5dd6e25571e))
* **providers:** register image/video/audio providers from community list ([0f8b9ca](https://github.com/linhnguyen-gt/Routiform/commit/0f8b9ca55b05e30b8e9cb2410a02978280e47b50))
* **providers:** register opencode executors and add UI metadata ([e08d661](https://github.com/linhnguyen-gt/Routiform/commit/e08d6616005378f2235059454edebb6b1a636e86)), closes [#6366f1](https://github.com/linhnguyen-gt/Routiform/issues/6366f1)
* **providers:** register opencode-zen and opencode-go in provider registry ([da1ed1b](https://github.com/linhnguyen-gt/Routiform/commit/da1ed1b5b27f867075d4fd136ef9e25fddcf67b3))
* proxy badge shows for all proxy levels (key/provider/global) ([f1d421b](https://github.com/linhnguyen-gt/Routiform/commit/f1d421bd8aba761aa9da08666d63e6ba96bf98e8))
* **proxy:** add model name prefix stripping option ([#568](https://github.com/linhnguyen-gt/Routiform/issues/568)) ([18a3741](https://github.com/linhnguyen-gt/Routiform/commit/18a3741fc29afccbae75dc81b3dd5e18ffaf5108))
* **proxy:** add proxy support for OAuth, token refresh, and model sync ([#953](https://github.com/linhnguyen-gt/Routiform/issues/953)) ([6daa065](https://github.com/linhnguyen-gt/Routiform/commit/6daa065b1ec38a2405761956c584b883c4719051))
* **qoder:** support PAT via qodercli ([5789c1a](https://github.com/linhnguyen-gt/Routiform/commit/5789c1ae7d224ec8e49f49ed12ac282b12a32d59))
* quota-aware account selection + fix premature model unavailability ([11bcdd8](https://github.com/linhnguyen-gt/Routiform/commit/11bcdd810a1c971a54aab43563e672a02a4d6c7d))
* **registry:** add new models to the provider registry ([e7b1975](https://github.com/linhnguyen-gt/Routiform/commit/e7b19758f3df65edb90bb745742b83afd03d5bde))
* **release:** merge feat/clawrouter-improvements — v2.7.0 ([44e4d55](https://github.com/linhnguyen-gt/Routiform/commit/44e4d55a66bcca23bd89d94b4469c6a37d3305eb))
* **release:** v1.7.3 — model deprecation, background degradation, rate limit persistence, thinking improvements, circuit breaker ([4a1acb1](https://github.com/linhnguyen-gt/Routiform/commit/4a1acb1446b152aab66a6427e8246915278ef74a))
* **release:** v1.7.4 — OpenCode CLI integration, endpoint page restructure, i18n translations ([5ffa141](https://github.com/linhnguyen-gt/Routiform/commit/5ffa14190a29e5c88c6c530f4e63fd108ec6f9e4)), closes [#169](https://github.com/linhnguyen-gt/Routiform/issues/169)
* **release:** v1.7.5 — OAuth re-auth duplicate fix ([#170](https://github.com/linhnguyen-gt/Routiform/issues/170)) ([8fbae5e](https://github.com/linhnguyen-gt/Routiform/commit/8fbae5e467be10f4e47a588572be87082e13f578))
* **release:** v1.8.0 — empty tool_use.name validation, Windows electron fix ([f21ba7d](https://github.com/linhnguyen-gt/Routiform/commit/f21ba7df6488af4634e09c417373641e68756aae))
* **release:** v1.8.1 — usage API proxy support ([70465ad](https://github.com/linhnguyen-gt/Routiform/commit/70465ada4dcb2c2283d0621edb5381f1dd0ac08d))
* **release:** v2.0.1 — endpoint-aware models, 3 bug fixes ([#212](https://github.com/linhnguyen-gt/Routiform/issues/212), [#213](https://github.com/linhnguyen-gt/Routiform/issues/213), [#200](https://github.com/linhnguyen-gt/Routiform/issues/200)), 3 features ([#204](https://github.com/linhnguyen-gt/Routiform/issues/204), [#205](https://github.com/linhnguyen-gt/Routiform/issues/205), [#206](https://github.com/linhnguyen-gt/Routiform/issues/206)) ([b081940](https://github.com/linhnguyen-gt/Routiform/commit/b0819404c70fe4db0edaa260f91d93259c2c60be))
* **release:** v2.0.1 — MCP multi-transport (stdio/SSE/Streamable HTTP), service toggles, endpoints consolidation ([ecb0774](https://github.com/linhnguyen-gt/Routiform/commit/ecb0774b7b54f69400f17f085aefbc9fc62e8705))
* **release:** v2.0.10 — CLI fingerprint UI toggle ([cbd60c8](https://github.com/linhnguyen-gt/Routiform/commit/cbd60c853ea04b8c9e8d6e6ebe17b89edfe7e29e))
* **release:** v2.0.11 — ACP Agents Dashboard + Anti-Ban Docs ([8963c62](https://github.com/linhnguyen-gt/Routiform/commit/8963c62adb4d24583389db9c472badf4c9f4dbdc))
* **release:** v2.0.14 — fix model name stripping, multimodal image_url, electron release workflow ([049ddff](https://github.com/linhnguyen-gt/Routiform/commit/049ddff6fee19e0656dd5651276569fd8725f490)), closes [#243](https://github.com/linhnguyen-gt/Routiform/issues/243) [#242](https://github.com/linhnguyen-gt/Routiform/issues/242) [#241](https://github.com/linhnguyen-gt/Routiform/issues/241)
* **release:** v2.0.16 — NanoBanana async polling + Electron CI fix + CI hardening ([db0bda2](https://github.com/linhnguyen-gt/Routiform/commit/db0bda28109f350cfc2f691834086c62305209e1)), closes [#247](https://github.com/linhnguyen-gt/Routiform/issues/247)
* **release:** v2.0.17 — Antigravity streaming fix + OpenCode integration + Electron CI ([2ba46a6](https://github.com/linhnguyen-gt/Routiform/commit/2ba46a622b4fca78a585c8693636603b91f96bf1)), closes [#253](https://github.com/linhnguyen-gt/Routiform/issues/253) [#162](https://github.com/linhnguyen-gt/Routiform/issues/162)
* **release:** v2.0.18 — cursor decompression + codex token refresh + password setup fix ([9aaebbc](https://github.com/linhnguyen-gt/Routiform/commit/9aaebbcd2a74aa701e5bbd9497e753e7e85d8e7c))
* **release:** v2.0.19 — Ollama Cloud provider + security hardening ([47445eb](https://github.com/linhnguyen-gt/Routiform/commit/47445ebf5ca750a62edd3ba7305ece16a1d0064c))
* **release:** v2.0.20 — TTS Expansion + Mobile UX + Friendly Names ([743cfcb](https://github.com/linhnguyen-gt/Routiform/commit/743cfcbb3c645d4ef54db8342323cf35251b833d)), closes [#248](https://github.com/linhnguyen-gt/Routiform/issues/248) [#260](https://github.com/linhnguyen-gt/Routiform/issues/260) [#261](https://github.com/linhnguyen-gt/Routiform/issues/261)
* **release:** v2.0.3 — deferred tools cache_control fix, quota system hardening ([1ffa58b](https://github.com/linhnguyen-gt/Routiform/commit/1ffa58be76bd1dbc99923b4ad2521e73d92be57c))
* **release:** v2.0.4 — round-robin lastUsedAt persistence, zod standalone build fix ([f96ee44](https://github.com/linhnguyen-gt/Routiform/commit/f96ee44213ee2b71b0e3380669a345de757ed217))
* **release:** v2.0.5 — fix Chat→Responses reasoning IDs, electron auto-update, dependency bumps ([e080c4a](https://github.com/linhnguyen-gt/Routiform/commit/e080c4a16a643bb2929996cdc8125a9120389c81))
* **release:** v2.0.6 — custom model apiFormat routing fix ([30fba39](https://github.com/linhnguyen-gt/Routiform/commit/30fba39b35c9161503a21471b7954a3510fb7533))
* **release:** v2.0.7 — custom image model routing + Codex OAuth workspace isolation ([fb87df1](https://github.com/linhnguyen-gt/Routiform/commit/fb87df14fd6fbf7a6510c150521739692c56326a))
* **release:** v2.0.8 — custom image model handler resolution ([7cb420d](https://github.com/linhnguyen-gt/Routiform/commit/7cb420d8e65db91f6fdb4f9c828a05e9a2b06d1d))
* **release:** v2.0.9 — playground, CLI fingerprints, ACP ([a2bd32e](https://github.com/linhnguyen-gt/Routiform/commit/a2bd32e76c53240cca794e67f3bca3fe924d8d6f))
* **release:** v2.1.0 — Full Provider-UI Gap Audit ([9865401](https://github.com/linhnguyen-gt/Routiform/commit/986540163683ca589d28f2241fd284974db082de))
* **release:** v2.1.1 — CI fix + docs reorganization ([ace3e47](https://github.com/linhnguyen-gt/Routiform/commit/ace3e47d22ea706cb458f13f89ada27813aae11f))
* **release:** v2.1.2 — CI green: all 5 workflow fixes + .deb ([0a59ef4](https://github.com/linhnguyen-gt/Routiform/commit/0a59ef49969408d776e20cae2c2d195f6a56bf91))
* **release:** v2.2.1 — bug fixes, security patches, CI hardening ([82a621e](https://github.com/linhnguyen-gt/Routiform/commit/82a621ec087c14ebdecb21ec77ec953c237451c4)), closes [#273](https://github.com/linhnguyen-gt/Routiform/issues/273) [#276](https://github.com/linhnguyen-gt/Routiform/issues/276) [#277](https://github.com/linhnguyen-gt/Routiform/issues/277)
* **release:** v2.2.2 — system-info script, Kimi/Mistral/Llama aliases ([d9d0640](https://github.com/linhnguyen-gt/Routiform/commit/d9d0640f6e91f093d4570e424eaa4e531921924d)), closes [#280](https://github.com/linhnguyen-gt/Routiform/issues/280) [#265](https://github.com/linhnguyen-gt/Routiform/issues/265) [#278](https://github.com/linhnguyen-gt/Routiform/issues/278)
* **release:** v2.2.3 — bug fixes from community PRs ([ac68022](https://github.com/linhnguyen-gt/Routiform/commit/ac680222338d354f421e6592c8e17927cdabdd30)), closes [#285](https://github.com/linhnguyen-gt/Routiform/issues/285) [#288](https://github.com/linhnguyen-gt/Routiform/issues/288)
* **release:** v2.2.4 — CI fixes (docs-sync, electron fpm, docker) ([5763609](https://github.com/linhnguyen-gt/Routiform/commit/57636090089000f5131da204e861e4f8a6750af6))
* **release:** v2.3.13 — tiered quota scoring, model fallback, auth fixes, pnpm fix ([f6c0744](https://github.com/linhnguyen-gt/Routiform/commit/f6c0744d677c52882524af0bc919a396cb87fe42))
* **release:** v2.3.14 — iFlow fix, MITM compile, GeminiCLI fallback, new models, tier scoring API ([b8fec94](https://github.com/linhnguyen-gt/Routiform/commit/b8fec94b0ded4042e033915e28bd0d159c930d60))
* **release:** v2.4.2 — task-aware routing, HuggingFace/Vertex providers, streaming fixes, token tracking, playground uploads ([b0f5f92](https://github.com/linhnguyen-gt/Routiform/commit/b0f5f92f1a19a9cb1f939cf06eb69db9d96e59bc)), closes [#180](https://github.com/linhnguyen-gt/Routiform/issues/180) [#73](https://github.com/linhnguyen-gt/Routiform/issues/73) [#74](https://github.com/linhnguyen-gt/Routiform/issues/74) [#302](https://github.com/linhnguyen-gt/Routiform/issues/302) [#349](https://github.com/linhnguyen-gt/Routiform/issues/349) [#352](https://github.com/linhnguyen-gt/Routiform/issues/352)
* **release:** v2.7.1 — unified web search routing + Next.js 16.1.7 security ([928b712](https://github.com/linhnguyen-gt/Routiform/commit/928b7120f45c7112d76897c3e1b2dc2bafe2e086))
* **release:** v2.7.10 — Alibaba Cloud Coding, Kimi Coding API-key, Docker pino fix ([a09b298](https://github.com/linhnguyen-gt/Routiform/commit/a09b298127e2510e30ec553cc96f01cc24f0eaeb))
* **release:** v2.7.2 — fix light mode contrast in logs UI ([d3dfd9c](https://github.com/linhnguyen-gt/Routiform/commit/d3dfd9ce5762628eef2500a559dcb83e838f715a))
* **release:** v2.7.3 — fix Codex direct API weekly quota fallback ([896ce9c](https://github.com/linhnguyen-gt/Routiform/commit/896ce9c0e260db21fbc7a26dbeadf84d9be67474)), closes [#440](https://github.com/linhnguyen-gt/Routiform/issues/440)
* **release:** v2.7.4 — search playground, i18n fixes, Copilot limits, Serper validation ([684b81d](https://github.com/linhnguyen-gt/Routiform/commit/684b81d8358a866c4f687900032a692a3ec94d39)), closes [#443](https://github.com/linhnguyen-gt/Routiform/issues/443) [#444](https://github.com/linhnguyen-gt/Routiform/issues/444) [#445](https://github.com/linhnguyen-gt/Routiform/issues/445) [#446](https://github.com/linhnguyen-gt/Routiform/issues/446)
* **release:** v2.7.5 — login UX + Windows CLI healthcheck ([146a491](https://github.com/linhnguyen-gt/Routiform/commit/146a4917699a07ddbb4fc10fd40ab9a1c74986ca)), closes [#437](https://github.com/linhnguyen-gt/Routiform/issues/437) [#447](https://github.com/linhnguyen-gt/Routiform/issues/447)
* **release:** v2.7.7 — Docker pino crash fix + Codex responses worker fix ([718be83](https://github.com/linhnguyen-gt/Routiform/commit/718be831afb64f9b62e51ce8b8bacd20812c0cbd)), closes [#449](https://github.com/linhnguyen-gt/Routiform/issues/449) [#450](https://github.com/linhnguyen-gt/Routiform/issues/450)
* **release:** v2.7.8 — budget save fix + combo agent UI + omniModel tag strip ([1b68deb](https://github.com/linhnguyen-gt/Routiform/commit/1b68deb0f6bc6a62aa420ff127c0d5303a263b0a)), closes [#451](https://github.com/linhnguyen-gt/Routiform/issues/451) [#454](https://github.com/linhnguyen-gt/Routiform/issues/454) [#454](https://github.com/linhnguyen-gt/Routiform/issues/454)
* **release:** v2.8.0 — Bailian Coding Plan, editable provider URLs, 812 tests ([fe5c20a](https://github.com/linhnguyen-gt/Routiform/commit/fe5c20a04e391971b6acd67348980a2401ccc2e9))
* **release:** v2.8.1 — streaming log fix, Kiro compat, cache tokens, Chinese i18n, configurable tool call ID ([a265c70](https://github.com/linhnguyen-gt/Routiform/commit/a265c7096e2d596720e993fa10af0f1ee3c43623))
* **release:** v2.8.2 — model alias routing fix, log export, 2 merged PRs ([659e2b4](https://github.com/linhnguyen-gt/Routiform/commit/659e2b414db6864334c3345459f18b8824edd46f))
* Return only accessible models from /models for restricted API keys ([#781](https://github.com/linhnguyen-gt/Routiform/issues/781)) ([bcb87f5](https://github.com/linhnguyen-gt/Routiform/commit/bcb87f5d554da84f267f71ab46973f93d5e7c17e))
* **routing:** implement Last Known Good Provider (LKGP) strategy ([#919](https://github.com/linhnguyen-gt/Routiform/issues/919)) ([b777b15](https://github.com/linhnguyen-gt/Routiform/commit/b777b15ee897c72eced49564a113ebfac5bc4acc))
* save compatible provider models to customModels DB for /v1/models listing ([ddb02d6](https://github.com/linhnguyen-gt/Routiform/commit/ddb02d64646cd7738a28c19dce43276e1eef7c68))
* **search/analytics:** add Search tab to analytics dashboard + GET /api/v1/search/analytics ([41d91d6](https://github.com/linhnguyen-gt/Routiform/commit/41d91d628aa25a3770296d919a1c200864df51eb))
* **search:** add search playground, search tools, and local rerank routing ([e3ed29a](https://github.com/linhnguyen-gt/Routiform/commit/e3ed29aab6c051fda308d1201c9766ebbf48f2df)), closes [#432](https://github.com/linhnguyen-gt/Routiform/issues/432)
* **search:** add unified web search routing with 5 providers ([564e983](https://github.com/linhnguyen-gt/Routiform/commit/564e983c68a82529a659b837d3e6059689e7c2ae))
* **settings:** add appearance tab and whitelabeling features ([ac10d25](https://github.com/linhnguyen-gt/Routiform/commit/ac10d25f5f30e89793371bfbf88ce9f871db393c))
* **settings:** add debug toggle and sidebar visibility toggle ([35f96d4](https://github.com/linhnguyen-gt/Routiform/commit/35f96d4a40ff561f5886da128db219efbab6860b))
* **settings:** add toggle to hide health check logs with caching ([4b137d8](https://github.com/linhnguyen-gt/Routiform/commit/4b137d8e723200a7a5786315493d6dba4a6b51ca))
* **settings:** full backup import/export, routing i18n, proxy fixes ([9c3fdca](https://github.com/linhnguyen-gt/Routiform/commit/9c3fdca51a822e349b5baef8470d60939bee6bca))
* show user-defined provider labels and full API key names ([#121](https://github.com/linhnguyen-gt/Routiform/issues/121)) ([d55b6e0](https://github.com/linhnguyen-gt/Routiform/commit/d55b6e0b7a9f5539b57655df24f8842d8f87f524))
* sidebar reorganization + CLI fingerprint to Agents page ([2306081](https://github.com/linhnguyen-gt/Routiform/commit/2306081dab2d5619ad02b7c9d7f2882a27262c7e))
* **sidebar:** wire whitelabeling settings to sidebar ([47cb9e8](https://github.com/linhnguyen-gt/Routiform/commit/47cb9e8e44f10c4de63a8e906e5acdaf5190e4ba))
* **sse:** add adaptive volume/complexity detector for routing strategy override ([a427d21](https://github.com/linhnguyen-gt/Routiform/commit/a427d215e3a662d46ce59f245d987b26d161a42f)), closes [#789](https://github.com/linhnguyen-gt/Routiform/issues/789)
* **sse:** add deterministic FSM orchestrator for multi-step workflows ([ae96fb6](https://github.com/linhnguyen-gt/Routiform/commit/ae96fb6f63f0dd4e0b81c56886ca7ab3d444a45e)), closes [#800](https://github.com/linhnguyen-gt/Routiform/issues/800) [#802](https://github.com/linhnguyen-gt/Routiform/issues/802)
* **sse:** add provider diversity scoring via Shannon entropy ([271cf37](https://github.com/linhnguyen-gt/Routiform/commit/271cf37b8a0d5d8d7eab5e0a9432f3de3d534c61)), closes [#788](https://github.com/linhnguyen-gt/Routiform/issues/788)
* **sse:** preserve client cache_control for Claude Code with deterministic routing ([0bc557f](https://github.com/linhnguyen-gt/Routiform/commit/0bc557fb8b5ca640626793ce474e22f3948b34cf))
* sub2api T05/T08/T09/T13/T14 + bump to 3.0.0-rc.7 ([e47740e](https://github.com/linhnguyen-gt/Routiform/commit/e47740e02e9281fffdef0b02ad14791a86de6ba7))
* **sub2api:** implement T01-T15 gap analysis tasks (3.0.0-rc.6) ([7a7f3be](https://github.com/linhnguyen-gt/Routiform/commit/7a7f3be0d262bc25a41e179ebd62b4970ff521de))
* **sync:** carry Gemini metadata through model sync ([325d048](https://github.com/linhnguyen-gt/Routiform/commit/325d048340f6d21b416c97ceb43f2d554a80b533))
* **sync:** write Gemini models to syncedAvailableModels with union logic ([7607cec](https://github.com/linhnguyen-gt/Routiform/commit/7607cec7a252793db231d2a395c2bdca3c3e0d1b))
* system-info.mjs script + Kimi/Mistral/Llama model aliases ([#280](https://github.com/linhnguyen-gt/Routiform/issues/280) [#265](https://github.com/linhnguyen-gt/Routiform/issues/265) [#278](https://github.com/linhnguyen-gt/Routiform/issues/278)) ([#284](https://github.com/linhnguyen-gt/Routiform/issues/284)) ([e190461](https://github.com/linhnguyen-gt/Routiform/commit/e19046116ac399475ce7ebd517b8629ede0d6336))
* T07 — API Key Round-Robin per provider connection ([1b354be](https://github.com/linhnguyen-gt/Routiform/commit/1b354be8273f4c7bcc8eb91d9a7a743743cd6c03))
* **tokenHealthCheck:** add request coalescing to shouldHideLogs ([f0a0c97](https://github.com/linhnguyen-gt/Routiform/commit/f0a0c97b5ec831da9553fde10d8a2037e523f962))
* **ui:** add AutoDisableCard to Resilience settings ([#765](https://github.com/linhnguyen-gt/Routiform/issues/765)) ([d0c1728](https://github.com/linhnguyen-gt/Routiform/commit/d0c172830c3031f97ee08f9ac4c6de851e4b578e))
* **ui:** endpoint page music section, fixed action buttons, provider logos ([4383e7d](https://github.com/linhnguyen-gt/Routiform/commit/4383e7d8073ccd29eff8889c494500f59bdf0dfa))
* **ui:** full provider-UI gap fixes ([1343768](https://github.com/linhnguyen-gt/Routiform/commit/1343768de16d5784649557983cae8b4131a26081))
* **ui:** group limits dashboard connections by tag field to improve configuration visibility ([8a11242](https://github.com/linhnguyen-gt/Routiform/commit/8a11242d7f7c77925d0a0ddd936c37760d23352d))
* **ui:** integrate FSM, adaptive routing, and provider diversity ([a864258](https://github.com/linhnguyen-gt/Routiform/commit/a864258cb8319a4c1f09848078265357f7382374))
* **ui:** standardize auto-combo layout and global routing strategies ([77d8dce](https://github.com/linhnguyen-gt/Routiform/commit/77d8dce81cabf9f0b91a6d299c21d27a43955786))
* update agent workflows to use PR-based flow with user verification ([ccb314e](https://github.com/linhnguyen-gt/Routiform/commit/ccb314e06540c57fa22f9d2514d20da49f48c6c7))
* update Antigravity model list and enable passthrough ([#628](https://github.com/linhnguyen-gt/Routiform/issues/628)) ([aad510a](https://github.com/linhnguyen-gt/Routiform/commit/aad510a9d558014f393338c6349afb789f5d45de))
* usage UI, OpenCode CLI, and OpenAI-compatible API key handling ([9dbec81](https://github.com/linhnguyen-gt/Routiform/commit/9dbec811f0728da408c2c992231a4cdd00b8fcee))
* **usageTracking:** make usage token buffer configurable ([f7fbe39](https://github.com/linhnguyen-gt/Routiform/commit/f7fbe3946d79d264d9a4c26858530f3cecb944c4))
* use getModelInfo for proper custom provider resolution in availability checks ([619c99c](https://github.com/linhnguyen-gt/Routiform/commit/619c99ce4c00289f56e76b0f7bbd7ddf8714e130))
* use provider node prefixes for custom model alias generatiovv ([ad1cc64](https://github.com/linhnguyen-gt/Routiform/commit/ad1cc64e5a0d6ba139cb4b7b61a931ee4096d5e6))
* use provider node type for active provider resolution ([6afceba](https://github.com/linhnguyen-gt/Routiform/commit/6afcebababe6e826b576272cecddf633dbbd1b2b))
* use provider prefix for model value resolution ([9aad413](https://github.com/linhnguyen-gt/Routiform/commit/9aad413809005156e477006c4bea3fbad9c72b26))
* **v1beta:** use stored token limits and metadata in Gemini models endpoint ([faae82e](https://github.com/linhnguyen-gt/Routiform/commit/faae82eae1b8ed0d1322213d9116bb7398fae334))
* v2.0.0 - MCP server, A2A agent, proxy improvements and docs update ([baa0208](https://github.com/linhnguyen-gt/Routiform/commit/baa0208fa93c9887a90097314765e5bcd168f509))
* **zws-v2:** model compat, provider-models hardening, provider page types ([1a099ea](https://github.com/linhnguyen-gt/Routiform/commit/1a099ea2f2fb4701eb3c1567c24af03d31a87b8b))


### Bug Fixes

* (cli) secure CLI tool detection via known installation paths (Win… ([#544](https://github.com/linhnguyen-gt/Routiform/issues/544)) ([0fa3f9a](https://github.com/linhnguyen-gt/Routiform/commit/0fa3f9a0578dc3ed2be46c8649908e0daade561b))
* [object Object] error display in TTS/transcription upstream errors ([5f8d774](https://github.com/linhnguyen-gt/Routiform/commit/5f8d774e198e0ce4203a7476361185c3890fef38))
* /v1/models only shows models from configured providers ([87c7c92](https://github.com/linhnguyen-gt/Routiform/commit/87c7c92ddd52179362a34af74acfc59d5fe9bb0c))
* /v1/models respects disabled providers — track total connections before filter ([f12b90f](https://github.com/linhnguyen-gt/Routiform/commit/f12b90f373b35f99ab4c9db58af8fe94a2050760))
* **#549:** resolve real API key from keyId in codex/droid/kilo settings ([b2f0820](https://github.com/linhnguyen-gt/Routiform/commit/b2f08205609cc7079d8080550c0e9515ff99ee70)), closes [#549](https://github.com/linhnguyen-gt/Routiform/issues/549)
* **3.0.0-rc.2:** resolve issues [#536](https://github.com/linhnguyen-gt/Routiform/issues/536), [#535](https://github.com/linhnguyen-gt/Routiform/issues/535), [#524](https://github.com/linhnguyen-gt/Routiform/issues/524) ([8b9abcb](https://github.com/linhnguyen-gt/Routiform/commit/8b9abcb6ccbfe8ee2e6abf60c66d1af6aab518b9))
* **3.0.0-rc/batch1:** resolve issues [#521](https://github.com/linhnguyen-gt/Routiform/issues/521), [#522](https://github.com/linhnguyen-gt/Routiform/issues/522), [#525](https://github.com/linhnguyen-gt/Routiform/issues/525), [#532](https://github.com/linhnguyen-gt/Routiform/issues/532), [#489](https://github.com/linhnguyen-gt/Routiform/issues/489) ([43046ee](https://github.com/linhnguyen-gt/Routiform/commit/43046ee649f82d9bf7cbdbe80ac206d984b11c64)), closes [#513](https://github.com/linhnguyen-gt/Routiform/issues/513)
* **3.0.0-rc/batch2:** resolve issues [#510](https://github.com/linhnguyen-gt/Routiform/issues/510), [#492](https://github.com/linhnguyen-gt/Routiform/issues/492), and improve [#520](https://github.com/linhnguyen-gt/Routiform/issues/520), [#529](https://github.com/linhnguyen-gt/Routiform/issues/529) ([0acef57](https://github.com/linhnguyen-gt/Routiform/commit/0acef57865dff989622846f2ad8e50a2b40819a0))
* **3.0.0-rc/batch3:** convert tool_result blocks to text to stop Codex loop ([#527](https://github.com/linhnguyen-gt/Routiform/issues/527)) ([6a2c7b4](https://github.com/linhnguyen-gt/Routiform/commit/6a2c7b467d2471768e46bab04c43d63716e1e6aa)), closes [#509](https://github.com/linhnguyen-gt/Routiform/issues/509) [#508](https://github.com/linhnguyen-gt/Routiform/issues/508) [#464](https://github.com/linhnguyen-gt/Routiform/issues/464)
* **429:** parse long quota reset times from error body ([a405f2e](https://github.com/linhnguyen-gt/Routiform/commit/a405f2e81e5e834308c287012efe5ec8cb539f33)), closes [#858](https://github.com/linhnguyen-gt/Routiform/issues/858) [#832](https://github.com/linhnguyen-gt/Routiform/issues/832)
* **account-selector:** enhance round-robin logic to handle excluded accounts and maintain state ([#349](https://github.com/linhnguyen-gt/Routiform/issues/349)) ([7612741](https://github.com/linhnguyen-gt/Routiform/commit/76127415a4c46694dd76958cb2bfcdc8a333552b))
* add Antigravity OAuth clientSecret fallback — empty string caused 'client_secret is missing' ([#383](https://github.com/linhnguyen-gt/Routiform/issues/383)) ([5506071](https://github.com/linhnguyen-gt/Routiform/commit/5506071e9a0808fb5c790a8f994653fdca1a2890))
* add app/ to .gitignore — prevents Next.js App Router conflict ([21137bd](https://github.com/linhnguyen-gt/Routiform/commit/21137bd84a55d123fd67590539f239e948e4234e))
* add four-stage request log payloads ([04de492](https://github.com/linhnguyen-gt/Routiform/commit/04de492019676fff3733ed659999eeff5c4e0ec4))
* add four-stage request log payloads ([1832946](https://github.com/linhnguyen-gt/Routiform/commit/1832946d4116cd426e5f996a345968c3a9e51769))
* add GLM-4.7-FlashX model and correct GLM-4.7 tool calling support ([0f4a7b2](https://github.com/linhnguyen-gt/Routiform/commit/0f4a7b24051adce056bb1a41368684b9990f7c5a))
* add JWT_SECRET env to electron release build step ([11f43ca](https://github.com/linhnguyen-gt/Routiform/commit/11f43ca65c0b60d0105fed908b203702a38ed7b9))
* add missing cloudflaredUrlNotice i18n keys ([#823](https://github.com/linhnguyen-gt/Routiform/issues/823)) ([fbdce04](https://github.com/linhnguyen-gt/Routiform/commit/fbdce049b204d6aa060491de9b4259d61efc98ba))
* add missing cloudflaredUrlNotice i18n keys to prevent MISSING_MESSAGE console errors ([#823](https://github.com/linhnguyen-gt/Routiform/issues/823)) ([9a8520a](https://github.com/linhnguyen-gt/Routiform/commit/9a8520a2defd1ad80ad4822ec55d8e7ecea3bbf7))
* add missing i18n keys for windsurf/copilot and apply fetch timeout to streaming requests ([#748](https://github.com/linhnguyen-gt/Routiform/issues/748), [#769](https://github.com/linhnguyen-gt/Routiform/issues/769)) ([1c070d1](https://github.com/linhnguyen-gt/Routiform/commit/1c070d16a65e893e2dbb3bf2ee2037972cb10d46))
* add missing yazl dependency for build ([5899b0f](https://github.com/linhnguyen-gt/Routiform/commit/5899b0f1e435ca1213b99ab1b7002db9cc6c4403))
* add Ollama Cloud provider + security hardening ([#255](https://github.com/linhnguyen-gt/Routiform/issues/255) [#258](https://github.com/linhnguyen-gt/Routiform/issues/258)) ([74a0585](https://github.com/linhnguyen-gt/Routiform/commit/74a058568314b65db06df2df5c844861403ae1ff)), closes [#1](https://github.com/linhnguyen-gt/Routiform/issues/1)
* add opencode-zen to PROVIDER_MODELS_CONFIG ([#667](https://github.com/linhnguyen-gt/Routiform/issues/667)) ([c5f344f](https://github.com/linhnguyen-gt/Routiform/commit/c5f344f3330d1cd5887fc02aeb22743e685caf85))
* add projectId warning logs and blackbox.ai provider ([#175](https://github.com/linhnguyen-gt/Routiform/issues/175), [#176](https://github.com/linhnguyen-gt/Routiform/issues/176)) ([212bca2](https://github.com/linhnguyen-gt/Routiform/commit/212bca2e1eb85b3decae81d0405a55b0b144a77b))
* add provider-specific max_tokens cap ([#711](https://github.com/linhnguyen-gt/Routiform/issues/711)) ([8915a7c](https://github.com/linhnguyen-gt/Routiform/commit/8915a7c2cd0db0bb87bb3df684fef4217952f9dc))
* add SVG fallback to ProviderIcon component ([fe033cd](https://github.com/linhnguyen-gt/Routiform/commit/fe033cd0b339e9a00f0212ce250c5a4afd620170))
* add workflow_dispatch to docker-publish, update action versions ([#392](https://github.com/linhnguyen-gt/Routiform/issues/392)) ([df1105d](https://github.com/linhnguyen-gt/Routiform/commit/df1105d0c6f5b49a1728f59a1410db95ea5fb05a))
* add Zod validation to models-dev API route ([6dcde9f](https://github.com/linhnguyen-gt/Routiform/commit/6dcde9fcbe6112b04836bb7dcbeeb5f4783eea31))
* address agent review issues for theme color settings ([#174](https://github.com/linhnguyen-gt/Routiform/issues/174)) ([c4f1990](https://github.com/linhnguyen-gt/Routiform/commit/c4f1990aff9184c7f684b53b78a732d6c788aa5d))
* Address all 4 bot review warnings ([5fa9784](https://github.com/linhnguyen-gt/Routiform/commit/5fa97841b2a4f9c99c022230131b2b516e655d5b)), closes [#1](https://github.com/linhnguyen-gt/Routiform/issues/1) [#2](https://github.com/linhnguyen-gt/Routiform/issues/2) [#3](https://github.com/linhnguyen-gt/Routiform/issues/3) [#4](https://github.com/linhnguyen-gt/Routiform/issues/4)
* address code review issues ([fe2aaa8](https://github.com/linhnguyen-gt/Routiform/commit/fe2aaa81cae9e91b67d3eaa99012732381478455))
* address code review issues (SSRF, saveCallLog, deduplication) ([d97a11a](https://github.com/linhnguyen-gt/Routiform/commit/d97a11a54fbaeecdd143e3fc436ae77100f78e07))
* address Gemini code review — use execFileSync and optional chaining ([3e0c322](https://github.com/linhnguyen-gt/Routiform/commit/3e0c322fd44e06742cce187b3df2439593687dea))
* address PR [#831](https://github.com/linhnguyen-gt/Routiform/issues/831) review feedback ([e2eb4ef](https://github.com/linhnguyen-gt/Routiform/commit/e2eb4ef29d6c87f45081b11252cd74149d6d6e9b))
* address PR review — timeouts, pagination safety, standardized cooldowns ([a069df4](https://github.com/linhnguyen-gt/Routiform/commit/a069df41b86136d3be7d3efe05f4f71517ed0523))
* address PR review comments ([95260f5](https://github.com/linhnguyen-gt/Routiform/commit/95260f56bade9ece5c82de4f993c0c6ab6b0a7e6))
* address PR review comments ([a3d15cf](https://github.com/linhnguyen-gt/Routiform/commit/a3d15cf9719f9342fd8395e75149fe0b5c0bb15c)), closes [#150](https://github.com/linhnguyen-gt/Routiform/issues/150)
* address PR review feedback ([2df8b23](https://github.com/linhnguyen-gt/Routiform/commit/2df8b234fec96dbac6d2f0311af0849e830cefdc))
* address PR review findings for Antigravity 429 cascade fix ([c7da922](https://github.com/linhnguyen-gt/Routiform/commit/c7da9223836097603ed250be4b34d0119ac2091d))
* address review — break after first portable exe, remove debug ls ([b8272c5](https://github.com/linhnguyen-gt/Routiform/commit/b8272c55d7ffa05fa36aba91cf040f7da3d96bb3))
* address reviewer comments for auto-disable (use getCachedSettings, immediate disable on permanent bans) ([d5bf0d1](https://github.com/linhnguyen-gt/Routiform/commit/d5bf0d1199731dba72a8db1a10cc6ca1f0591176))
* **aliases:** resolve custom model aliases before routing + restore on startup ([#315](https://github.com/linhnguyen-gt/Routiform/issues/315), [#316](https://github.com/linhnguyen-gt/Routiform/issues/316)) ([afe2ab3](https://github.com/linhnguyen-gt/Routiform/commit/afe2ab37e45f3b7303367cabfe6f9600b7e990c2))
* allow multiple Codex accounts from same workspace (Team/Business) ([bc55911](https://github.com/linhnguyen-gt/Routiform/commit/bc55911d0f0c593c22adde2a7817beaed07d0fb2))
* **analytics:** localize most active day and weekly labels ([bd39e01](https://github.com/linhnguyen-gt/Routiform/commit/bd39e01ee1e1aa5eb734d8573025ee4656ad0a8d))
* Antigravity model access — registry, 404 lockout, and non-streaming requests ([adb8127](https://github.com/linhnguyen-gt/Routiform/commit/adb8127a30e76d5c7fe36029f66995ff62645a55))
* Antigravity token refresh clientSecret and OpenCode Zen modelsUrl ([#588](https://github.com/linhnguyen-gt/Routiform/issues/588), [#612](https://github.com/linhnguyen-gt/Routiform/issues/612)) ([9852a80](https://github.com/linhnguyen-gt/Routiform/commit/9852a805a1c84d85171f462ee9a4c3abd7252a27))
* **antigravity:** add image passthrough for Claude models ([afefee2](https://github.com/linhnguyen-gt/Routiform/commit/afefee2357a276605707bc1432c49fc8d50bc527))
* **api-bridge:** make proxy timeout configurable via env ([d1c6242](https://github.com/linhnguyen-gt/Routiform/commit/d1c62420bfc0ccff2eaba7e3948fe675eb6e2508))
* **api-bridge:** make proxy timeout configurable via env ([#332](https://github.com/linhnguyen-gt/Routiform/issues/332)) ([dba1636](https://github.com/linhnguyen-gt/Routiform/commit/dba16363b762e08a0c2480d1d0f9ec6f59c7e97f))
* **api-bridge:** validate configured proxy timeout value ([7f9ec72](https://github.com/linhnguyen-gt/Routiform/commit/7f9ec724aea9ee9da8b73dc4e046e208c65214aa))
* **api,zed:** T06 validateBody on JSON routes; lazy-load keytar for CI build ([3e9fdc7](https://github.com/linhnguyen-gt/Routiform/commit/3e9fdc777ee59ae46921b357aac546b0476c1264))
* **api:** add refreshable: true to claude OAuth test config ([ceda2e7](https://github.com/linhnguyen-gt/Routiform/commit/ceda2e70c10c0ed9e6fd10a91f6c4cd1dcc4a1ec))
* **api:** address review feedback on pricing sync ([7db280e](https://github.com/linhnguyen-gt/Routiform/commit/7db280ee643c772b3f89bb38e762f10bdc61060f))
* **api:** enhance authentication for /models endpoint with stricter checks ([02dc8ea](https://github.com/linhnguyen-gt/Routiform/commit/02dc8ea0f3b4fef023e30e015208a6e58829963e))
* **api:** validate pricing sync and task routing routes ([7c992ff](https://github.com/linhnguyen-gt/Routiform/commit/7c992ffd21c941f38115b38b9ea1db24d400325f))
* **api:** validate pricing sync and task routing routes ([fc2af8b](https://github.com/linhnguyen-gt/Routiform/commit/fc2af8ba87dda8497fd5dadee4e75f153f5beef6))
* **api:** validate pricing sync and task routing routes ([b7cdaa6](https://github.com/linhnguyen-gt/Routiform/commit/b7cdaa662a7ff56680937271ed2c5246496647a5))
* apply PR review feedback for Gemini CLI quota ([c5d9b5f](https://github.com/linhnguyen-gt/Routiform/commit/c5d9b5f51d3693e4090722f8bce9686d4f135b78))
* **auth:** accept INITIAL_PASSWORD when changing first password ([#333](https://github.com/linhnguyen-gt/Routiform/issues/333)) ([d20a2b3](https://github.com/linhnguyen-gt/Routiform/commit/d20a2b3e44fe6bb6ddcf2fd926ad047fbb5f33af))
* **auth:** allow INITIAL_PASSWORD when updating first password ([daaa3a8](https://github.com/linhnguyen-gt/Routiform/commit/daaa3a8782dc54ce60a31e3a48737c05dfd6d2b8))
* **auth:** clear stale provider error metadata ([9c82b3d](https://github.com/linhnguyen-gt/Routiform/commit/9c82b3d4ca4e4573514cf3837d712e833c0b5b11))
* **auth:** clear stale state on non-chat success ([86105a5](https://github.com/linhnguyen-gt/Routiform/commit/86105a547ca3be15c99f2dd07de2a9b7517739b6))
* **auth:** fix NVIDIA credential lookup failure ([#931](https://github.com/linhnguyen-gt/Routiform/issues/931)) ([f0e1f18](https://github.com/linhnguyen-gt/Routiform/commit/f0e1f18c79a919c97ef8c72034103486f80e9ca4))
* **auth:** harden login bootstrap checks ([b0d6c15](https://github.com/linhnguyen-gt/Routiform/commit/b0d6c15e633ee6fc5f05b2ff55af066721a0a10c))
* **auth:** include error fields in recovery path ([6186bab](https://github.com/linhnguyen-gt/Routiform/commit/6186babdb338892213c6abd71b347b863e855612))
* **auth:** normalize codex alias credential lookup ([a668ac7](https://github.com/linhnguyen-gt/Routiform/commit/a668ac7235f53db6f097a0835849a2fcb0794937))
* **auth:** require explicit INITIAL_PASSWORD match on first password change ([e62be7e](https://github.com/linhnguyen-gt/Routiform/commit/e62be7e6b3cac6fdb0356a64f65bd86f846d2356))
* **auth:** type recovered state helpers ([8fd944c](https://github.com/linhnguyen-gt/Routiform/commit/8fd944ccf77c07186bda20dbfcfdd2d03b5134f4))
* **auth:** use timing-safe compare for INITIAL_PASSWORD check ([55a9e31](https://github.com/linhnguyen-gt/Routiform/commit/55a9e3193278b4f55bda25d2b36697969a856074))
* auto-decay backoffLevel when rate limit window has passed ([7df0c16](https://github.com/linhnguyen-gt/Routiform/commit/7df0c1607eadde399775ce0c5f0ec9dd2569ec9c))
* auto-rebuild better-sqlite3 for cross-platform npm installs ([#129](https://github.com/linhnguyen-gt/Routiform/issues/129)) ([3286f05](https://github.com/linhnguyen-gt/Routiform/commit/3286f05b3bbe927d4c2d6c209399b31bb344caca))
* budget warningThreshold fraction mismatch + combo agent UI fields + omniModel tag strip ([03d4cbf](https://github.com/linhnguyen-gt/Routiform/commit/03d4cbf6d5e11e72b3cc927f568efbeac9358ce8)), closes [#451](https://github.com/linhnguyen-gt/Routiform/issues/451) [#399](https://github.com/linhnguyen-gt/Routiform/issues/399) [#401](https://github.com/linhnguyen-gt/Routiform/issues/401) [#454](https://github.com/linhnguyen-gt/Routiform/issues/454) [#454](https://github.com/linhnguyen-gt/Routiform/issues/454)
* **build:** add pino and pino-pretty to serverExternalPackages ([0f703c9](https://github.com/linhnguyen-gt/Routiform/commit/0f703c95dd4aedcde34b984b8848bcd9ddc2303c))
* **build:** add webpack IgnorePlugin for thread-stream test files; exclude compiled app/ dir from git ([e003b17](https://github.com/linhnguyen-gt/Routiform/commit/e003b1728063e78385f4278608389230b25b4d4c))
* **build:** extend externals hash-strip to cover ALL packages, not just better-sqlite3 ([#396](https://github.com/linhnguyen-gt/Routiform/issues/396), [#398](https://github.com/linhnguyen-gt/Routiform/issues/398)) ([7d72f17](https://github.com/linhnguyen-gt/Routiform/commit/7d72f1711fdb4e95bcbb6b45fb99f0ca97916b88))
* **build:** fix Next.js 16 Turbopack standalone build for npm publish ([1854711](https://github.com/linhnguyen-gt/Routiform/commit/1854711affba6e13b76109e8361548357dfd668b))
* **build:** force better-sqlite3 webpack external to prevent hash-based module name in instrumentation hook ([#394](https://github.com/linhnguyen-gt/Routiform/issues/394)) ([f9df72c](https://github.com/linhnguyen-gt/Routiform/commit/f9df72c4d7f0e7971f59c1c03d38e4c3d694511f))
* **build:** remove --webpack from prepublish.mjs — fixes VPS app/server.js missing in npm package ([c905119](https://github.com/linhnguyen-gt/Routiform/commit/c905119d82c23c100777ada58b6a30ff9b8a7271))
* **build:** remove deprecated --webpack flag from next build script ([c581ca8](https://github.com/linhnguyen-gt/Routiform/commit/c581ca8339a24687862c8378e798daeadcffe431))
* **build:** remove node: protocol prefix from all src/ imports (#turbopack-compat) ([a9f6971](https://github.com/linhnguyen-gt/Routiform/commit/a9f69711c618621ecbdcf4e63ac14f65d7f10978))
* **build:** resolve all TypeScript compilation errors and Next.js 15 dynamic route slug conflicts ([92e0f24](https://github.com/linhnguyen-gt/Routiform/commit/92e0f242c7263064d042ee1bebde558df7f695ac)), closes [#560](https://github.com/linhnguyen-gt/Routiform/issues/560)
* **build:** restore webpack production build ([8643f40](https://github.com/linhnguyen-gt/Routiform/commit/8643f4015f1a4d5ba9fb1c1dab4190cd4bae1b25))
* **build:** strip Turbopack hashed require() from compiled server chunks in prepublish ([bb3fe1c](https://github.com/linhnguyen-gt/Routiform/commit/bb3fe1cd48c7ff4ca6af490c963491db0c8495bd))
* **cache:** address code review issues ([5437d69](https://github.com/linhnguyen-gt/Routiform/commit/5437d691b5ffb101563dda85262fcf52652b077f))
* **cache:** fix trends chart data mismatch and remove redundant metrics card ([b5c84a9](https://github.com/linhnguyen-gt/Routiform/commit/b5c84a91fb12f2ec1c4cb5dc93ce00e7494ef58b))
* **cache:** only inject prompt_cache_key for supported providers ([ac37a44](https://github.com/linhnguyen-gt/Routiform/commit/ac37a44ffae004525eb7e7124ead1928619e4bc1)), closes [#848](https://github.com/linhnguyen-gt/Routiform/issues/848)
* **cache:** resolve code review issues (namespace, unused props) ([b912116](https://github.com/linhnguyen-gt/Routiform/commit/b912116a2fd37e8db69c7f8ee56aeb4e0078a5ff))
* **callLogs:** support Claude format usage and include cache tokens ([#476](https://github.com/linhnguyen-gt/Routiform/issues/476)) ([4953727](https://github.com/linhnguyen-gt/Routiform/commit/4953727aa718b99045d74a086e5be42fe823baca))
* cap gemini-3.1-pro maxOutputTokens and filter live models ([5df8abc](https://github.com/linhnguyen-gt/Routiform/commit/5df8abcddf641fa82a373868f08280d40ea36d49))
* capture usage and accumulate output in response.completed event ([dce355c](https://github.com/linhnguyen-gt/Routiform/commit/dce355cce67ec19adf5009db756ab7024983a67e))
* catch stop() already called on concurrent 429s ([b29456c](https://github.com/linhnguyen-gt/Routiform/commit/b29456c8e5914469ea5404c02487c31427254fa0))
* **cc-compatible:** keep cache ttl ordering valid ([#948](https://github.com/linhnguyen-gt/Routiform/issues/948)) ([be2f7cb](https://github.com/linhnguyen-gt/Routiform/commit/be2f7cb3e57b2f50c8880cacb4c2e60631baafd5))
* **chatCore:** remove explicit any from comment to pass t11 budget check ([671ac56](https://github.com/linhnguyen-gt/Routiform/commit/671ac562e79cc76221e3007aa175bbf69f00afbd))
* **chatCore:** remove explicit any from comment to pass t11 budget check ([e7d978e](https://github.com/linhnguyen-gt/Routiform/commit/e7d978e0273473a4c40b6245173fdad409c3416e))
* **chat:** handle Anthropic-format tools in empty-name filter ([#346](https://github.com/linhnguyen-gt/Routiform/issues/346)) ([53de274](https://github.com/linhnguyen-gt/Routiform/commit/53de27417d4f2e4acec63ff86f8b02a6a1544617))
* **chat:** strip empty name fields from messages/input before upstream ([#291](https://github.com/linhnguyen-gt/Routiform/issues/291)) ([6a7a602](https://github.com/linhnguyen-gt/Routiform/commit/6a7a6022d4c2a7b4a50a5b847762b43a2e19a38c))
* cherry-pick PR [#542](https://github.com/linhnguyen-gt/Routiform/issues/542) (light mode contrast) + fix TDZ in cliRuntime.ts ([3912734](https://github.com/linhnguyen-gt/Routiform/commit/3912734498398b83f0a73f8ce7573ffa197c3472))
* **ci:** add missing dependencies for build ([29bb713](https://github.com/linhnguyen-gt/Routiform/commit/29bb71373eb609ee4943a532f35a2ee4be5841a7))
* **ci:** add missing dependencies for build ([ad153c2](https://github.com/linhnguyen-gt/Routiform/commit/ad153c226e4a40443e809312745a81bc3b7afbc8))
* **ci:** bump openapi.yaml version to 2.2.4 ([cf13e95](https://github.com/linhnguyen-gt/Routiform/commit/cf13e9561046bcd6be5c9f15d8fbdcc542e753fe))
* **ci:** correct security test import, add validateBody to acp/agents, deploy-vps continue-on-error ([62995b6](https://github.com/linhnguyen-gt/Routiform/commit/62995b640d048d23546ff6ae3f34b34f6ff5b3dd))
* **ci:** docs-sync, electron linux fpm, docker cache env ([6d672ab](https://github.com/linhnguyen-gt/Routiform/commit/6d672ab09a6e395df16a8a0346d6ea1e14fbcb0d))
* **ci:** docs-sync, openapi version, changelog format, pre-commit hook ([45424ca](https://github.com/linhnguyen-gt/Routiform/commit/45424ca22691c7589ea94715d85a9c42bc75a96a))
* **ci:** fix any-budget validation by using typecast correctly and adjust npm audit step so it never fails the workflow ([763da97](https://github.com/linhnguyen-gt/Routiform/commit/763da979a884585121b45f3599de6f736233bc08))
* **ci:** fix eslint OOM, failing tests, and strengthen pre-commit hook ([2c1488e](https://github.com/linhnguyen-gt/Routiform/commit/2c1488e65afb8975b0555b22c9c859e4a420d834))
* **ci:** fix jq command with -R raw input flag ([31783c0](https://github.com/linhnguyen-gt/Routiform/commit/31783c0d0a53a4494630054eaf5fe053097d11df))
* **ci:** fix jq command with -R raw input flag ([5bb99f9](https://github.com/linhnguyen-gt/Routiform/commit/5bb99f941c88432fdc23cebd314d6212743247f3))
* **ci:** Fix language list ([3d4b3bd](https://github.com/linhnguyen-gt/Routiform/commit/3d4b3bd0893344e81e1fc32971481161e5d9d2dd))
* **ci:** Fix language list ([971d2df](https://github.com/linhnguyen-gt/Routiform/commit/971d2dfc3171b2af1fd5b279bc57cffba9c82452))
* **ci:** i18n validation ([a91f8c4](https://github.com/linhnguyen-gt/Routiform/commit/a91f8c4d51db4dcf3aa65d4a2fe857358b30d25a))
* **ci:** i18n validation ([895e393](https://github.com/linhnguyen-gt/Routiform/commit/895e3931bd47fc1f39c8818e1e4b42d196feeb23))
* **ci:** make i18n validation soft-fail — return 0 on missing/untranslated keys ([e1868bd](https://github.com/linhnguyen-gt/Routiform/commit/e1868bdb78354cf12ce01f3995bce6629bc5f553))
* **ci:** push sync to correct fork repo ([3571421](https://github.com/linhnguyen-gt/Routiform/commit/3571421a0e1676def3fbdbadb6d9487b717163cd))
* **ci:** regenerate package-lock.json after removing @swc/helpers override ([639b49f](https://github.com/linhnguyen-gt/Routiform/commit/639b49fc5bf89394b505e77b17edb2baba06bad8))
* **ci:** register [@typescript-eslint](https://github.com/typescript-eslint) plugin in ESLint flat config ([de2ef14](https://github.com/linhnguyen-gt/Routiform/commit/de2ef14bc353f96f2844f08440b1bbaf30cbd63d))
* **ci:** remove duplicate OmniRoute.exe entry in electron release workflow ([bbcd1d3](https://github.com/linhnguyen-gt/Routiform/commit/bbcd1d3a08dee6636b5441af2fa0ac4efd20eff9))
* **ci:** repair unit, e2e and i18n failures ([f697c56](https://github.com/linhnguyen-gt/Routiform/commit/f697c569223f1848d91cf4b951f1b1685de8a0c3))
* **ci:** resolve 3 GitHub Actions workflow failures ([2c1da9e](https://github.com/linhnguyen-gt/Routiform/commit/2c1da9e14637f42be9dceb060902c27fc39f9bec))
* **ci:** resolve t11 any-budget false positive and e2e bailian validation test ([7fcdd4a](https://github.com/linhnguyen-gt/Routiform/commit/7fcdd4abdde5012c47eb5fc5fca3ffbfd06b763b))
* **ci:** reword comment in default.ts to avoid t11 any-budget false positive ([e96b023](https://github.com/linhnguyen-gt/Routiform/commit/e96b023d04574c09166ce4167a4181edfd80bd41))
* **ci:** route validation, CodeQL alerts, Docker workflow ([9248ab4](https://github.com/linhnguyen-gt/Routiform/commit/9248ab4dfdd7533a6d69186ef37eefdf2698d231))
* **ci:** skip npm publish if version already exists on npm registry ([2a620b1](https://github.com/linhnguyen-gt/Routiform/commit/2a620b178dd1f0cc7994c5222e4bbf72485c83ee))
* **ci:** sync package-lock.json — add @swc/helpers override + regenerate lock ([5aaaad5](https://github.com/linhnguyen-gt/Routiform/commit/5aaaad529b47adf47ff85f69e8d9f415ef9f2fa1))
* **ci:** Update action/setup-python@v6.2.0 ([1c0ba24](https://github.com/linhnguyen-gt/Routiform/commit/1c0ba24e48a09576de3e39b6d2d008a142676297))
* **ci:** Update action/setup-python@v6.2.0 ([a987425](https://github.com/linhnguyen-gt/Routiform/commit/a987425f4af3b7f9868e837d481122867bb728b1))
* **ci:** use npm install in npm-publish to survive lock file drift on old tags ([f900a81](https://github.com/linhnguyen-gt/Routiform/commit/f900a81ec99f025758169360e8e8468886dfd81d))
* Claude Code OAuth redirect_uri and scope for remote deployments ([#124](https://github.com/linhnguyen-gt/Routiform/issues/124)) ([ff96523](https://github.com/linhnguyen-gt/Routiform/commit/ff965234c9c65dac652a009ed63060fdf7e02d65))
* Claude token refresh, Antigravity quota, and 429 rate-limit handling ([c0f9b33](https://github.com/linhnguyen-gt/Routiform/commit/c0f9b33bbac6822916e3b79beb06c97b1ea31a49)), closes [#836](https://github.com/linhnguyen-gt/Routiform/issues/836) [#857](https://github.com/linhnguyen-gt/Routiform/issues/857) [#858](https://github.com/linhnguyen-gt/Routiform/issues/858) [#832](https://github.com/linhnguyen-gt/Routiform/issues/832)
* **claude:** correct utilization inversion and propagate remainingPercentage ([2ec0cd1](https://github.com/linhnguyen-gt/Routiform/commit/2ec0cd13cd07eb7a66e324525e2c6f9243a7485a))
* **claude:** correct utilization semantics, harden quota cache, fix premature model unavailability ([bfe4959](https://github.com/linhnguyen-gt/Routiform/commit/bfe495931fa8d6d1e40f929f5fdc125a168aa09e))
* cleanup PR [#494](https://github.com/linhnguyen-gt/Routiform/issues/494) — remove ZWS_README, fix KIRO MITM card ([#487](https://github.com/linhnguyen-gt/Routiform/issues/487)), generify AntigravityToolCard ([c54a578](https://github.com/linhnguyen-gt/Routiform/commit/c54a57838e6dca24f8d293b92e1e4156eba27bac))
* Clear All Models button now also removes associated aliases ([8121238](https://github.com/linhnguyen-gt/Routiform/commit/81212388727afa27d89fcb3f3042003e55144a87))
* CLI tools page hangs — add timeout to runtime status checks ([fb840d6](https://github.com/linhnguyen-gt/Routiform/commit/fb840d63929be844c4fe272d38678dbe3c45267d))
* **cli-tools:** add missing step 5 translation for opencode guide ([9771e95](https://github.com/linhnguyen-gt/Routiform/commit/9771e956f4fbdb9d61f42e6e45eef95aed15752c))
* **cli-tools:** add missing step 5 translation for opencode guide ([5bae4db](https://github.com/linhnguyen-gt/Routiform/commit/5bae4dbf9db8f862732b0d7e460fce96dbefc0c4))
* **cli-tools:** add opencode to cliRuntime, increase timeouts for slow-start CLIs ([8dad2d3](https://github.com/linhnguyen-gt/Routiform/commit/8dad2d32b68ae5e3a90044a192f5aca6a1e5113f))
* **cli-tools:** increase kilocode healthcheck timeout from 4s to 15s ([d07a5f0](https://github.com/linhnguyen-gt/Routiform/commit/d07a5f0df7cc4c6a0a41a34e2ecf6a64db680744))
* **cli:** address review feedback on native binary detection and postinstall ([a22f0a4](https://github.com/linhnguyen-gt/Routiform/commit/a22f0a4e7bc5c1156b25792099033516d8a82005))
* **cli:** copy native binary from root node_modules instead of rebuilding ([#321](https://github.com/linhnguyen-gt/Routiform/issues/321)) ([c859665](https://github.com/linhnguyen-gt/Routiform/commit/c859665c6b35dbf2f475e02b7ac0b1ee7a896709)), closes [#312](https://github.com/linhnguyen-gt/Routiform/issues/312)
* **cli:** cross-platform CLI tool detection ([7ee0938](https://github.com/linhnguyen-gt/Routiform/commit/7ee09388fa27a3b16a18924fb8416c78a54cf156))
* **cli:** guard against empty where output on Windows ([1121b81](https://github.com/linhnguyen-gt/Routiform/commit/1121b81f12d51428d7eca62859918d6415e72ee3))
* **cli:** improve better-sqlite3 postinstall rebuild for cross-platform installs ([#312](https://github.com/linhnguyen-gt/Routiform/issues/312)) ([f523894](https://github.com/linhnguyen-gt/Routiform/commit/f5238944b442f871fcbc3567ca5300648120b986))
* **cli:** include native-binary-compat.mjs in published package files ([5a244aa](https://github.com/linhnguyen-gt/Routiform/commit/5a244aa12aa0f5ecd763eff62aad4c90e59a78d5))
* Cline OAuth base64 parsing + name=email fallback for all OAuth accounts ([2042dcf](https://github.com/linhnguyen-gt/Routiform/commit/2042dcf99121e929db3a8362a8b59b56a6fff9be))
* **cli:** parse where output on Windows to prefer .cmd/.exe wrappers ([921bfbb](https://github.com/linhnguyen-gt/Routiform/commit/921bfbbe3c25cb0a2bd0dafd795b1baee7070726)), closes [#935](https://github.com/linhnguyen-gt/Routiform/issues/935) [#863](https://github.com/linhnguyen-gt/Routiform/issues/863)
* **cliproxyapi:** address PR [#914](https://github.com/linhnguyen-gt/Routiform/issues/914) review — types, SSRF, SQL injection ([90ed616](https://github.com/linhnguyen-gt/Routiform/commit/90ed6163f521e1234e84dbb8aa76057b73f5a4e2))
* **cliproxyapi:** address PR [#915](https://github.com/linhnguyen-gt/Routiform/issues/915) review — executor flexibility, fallback error logging ([dd33dc1](https://github.com/linhnguyen-gt/Routiform/commit/dd33dc1f9bb786f9996a27d0ae65517d4ec1b229))
* **cliproxyapi:** address PR [#916](https://github.com/linhnguyen-gt/Routiform/issues/916) review — auth on all version-manager routes, Docker healthcheck ([adf7705](https://github.com/linhnguyen-gt/Routiform/commit/adf77053c58be71854533a15304c92dad9b5b6f7))
* **cliproxyapi:** address remaining Kilo review issues ([ad676af](https://github.com/linhnguyen-gt/Routiform/commit/ad676af3f0dedb7dec4c3cf747baea8edc83142f))
* **cliproxyapi:** wire validateProxyUrl and sync settings to upstream_proxy_config ([1251353](https://github.com/linhnguyen-gt/Routiform/commit/12513536941452901cbe6f1bb6f4a39ac53c557c))
* **cli:** resolve --version returning 'unknown' on Windows ([#546](https://github.com/linhnguyen-gt/Routiform/issues/546)) ([67b7ae9](https://github.com/linhnguyen-gt/Routiform/commit/67b7ae98a63d0cd001c1e4cfcc0393414e535f24))
* cloud proxy endpoint shows undefined/v1 when env var not set ([#171](https://github.com/linhnguyen-gt/Routiform/issues/171)) ([527c542](https://github.com/linhnguyen-gt/Routiform/commit/527c542d6d047ed5368fcac9647505226c8bc175))
* **cloudflared:** avoid stale restart state ([ed72ddc](https://github.com/linhnguyen-gt/Routiform/commit/ed72ddc4d3afdc732d8cf6c2d27a8f6c9e412679))
* **codex:** address PR review feedback for quota policy flow ([1555883](https://github.com/linhnguyen-gt/Routiform/commit/1555883633427d804bcc42ba867d246274058a3e))
* **codex:** advertise gpt-5.4 models ([8f2c0ac](https://github.com/linhnguyen-gt/Routiform/commit/8f2c0acc7e2fa973ae10d9e69db2c424348e8a41))
* **codex:** avoid mutating request body ([b1c713d](https://github.com/linhnguyen-gt/Routiform/commit/b1c713de6077da9d137baac321bdeb3201160d89))
* **codex:** enforce weekly quota blocking for direct API fallback ([bcfeba8](https://github.com/linhnguyen-gt/Routiform/commit/bcfeba8a57b41c02af42ced910b125965c6779e3))
* **codex:** persist fast-tier toggle before applying runtime state ([c009c99](https://github.com/linhnguyen-gt/Routiform/commit/c009c993c3bef5570ddd1f3593a4e83be0a50b05))
* **codex:** preserve native responses payloads ([8642e2b](https://github.com/linhnguyen-gt/Routiform/commit/8642e2b7219dc0567e30ab6265b151cc1394116a))
* collect portable exe by pattern instead of hardcoded filename ([8d93c13](https://github.com/linhnguyen-gt/Routiform/commit/8d93c13f9a2fb95c0ddcfa69ff278b0eaaf3c6a1))
* **combo:** guard against empty text in sanitize transform ([600149f](https://github.com/linhnguyen-gt/Routiform/commit/600149fc2b499a7fc1c1d6f4e02a05e41444cc7c)), closes [#614](https://github.com/linhnguyen-gt/Routiform/issues/614)
* **combo:** sanitize TransformStream TextDecoder state corruption ([f4de3c8](https://github.com/linhnguyen-gt/Routiform/commit/f4de3c87484f1d758948448966c205a55af26f19))
* **combos:** free-stack template first, 2x2 grid, green highlight badge ([92d302a](https://github.com/linhnguyen-gt/Routiform/commit/92d302aed3c29c72050b14183311eb8d373cd503))
* **combo:** strip omniModel tags from outbound streaming responses ([#585](https://github.com/linhnguyen-gt/Routiform/issues/585)) ([5a8c644](https://github.com/linhnguyen-gt/Routiform/commit/5a8c6440f0f5456465cae9746a236df57415de19))
* **compat:** store explicit false for per-protocol normalizeToolCallId ([33b6c58](https://github.com/linhnguyen-gt/Routiform/commit/33b6c580872cd08137546d0f51aa0a85788c99ac))
* complete bugfixes for UI, OAuth fallbacks, cliRuntime Windows constraints and Codex non-streaming integration ([f810b13](https://github.com/linhnguyen-gt/Routiform/commit/f810b13bca28ab937b87f3b6f2fdee95b5a11e8b))
* context pinning bypass during tool-call responses ([#721](https://github.com/linhnguyen-gt/Routiform/issues/721)) ([a0acdfd](https://github.com/linhnguyen-gt/Routiform/commit/a0acdfdcb9cc995be31079f079973b762042d94d))
* convert reasoning_effort to Claude thinking format & proactive token refresh ([#627](https://github.com/linhnguyen-gt/Routiform/issues/627), [#631](https://github.com/linhnguyen-gt/Routiform/issues/631)) ([3976c79](https://github.com/linhnguyen-gt/Routiform/commit/3976c79e12c70f5ed3180d13560a7a3fda845b09))
* **core:** hidden models flag, antigravity streaming, and i18n translation sync ([#681](https://github.com/linhnguyen-gt/Routiform/issues/681), [#684](https://github.com/linhnguyen-gt/Routiform/issues/684), [#685](https://github.com/linhnguyen-gt/Routiform/issues/685)) ([f380d44](https://github.com/linhnguyen-gt/Routiform/commit/f380d446976b0c3dad59e8eea87477bd966a5232))
* **core:** prevent emergency fallback from masking original errors ([d23b19c](https://github.com/linhnguyen-gt/Routiform/commit/d23b19c4669e7108c37ef56c913e16ee9f8a0ea7))
* **core:** remove extra arg in claude passthrough translateRequest call ([682fd55](https://github.com/linhnguyen-gt/Routiform/commit/682fd550fad8742364777c8067a696703f38829e))
* **core:** resolve routing schemas, CLI streaming leaks, and thinking tag extraction ([b9c7fd8](https://github.com/linhnguyen-gt/Routiform/commit/b9c7fd879fc63cd73415a1a2b193d729447a36cd))
* **core:** v3.4.1 stabilization (QWEN OAuth, ZAI null content, Codex payload, NIM 404) ([b38351a](https://github.com/linhnguyen-gt/Routiform/commit/b38351a47000a31b087387a0fcc6dcea7384d610))
* correct GLM context windows for glm-4.6v (128K) and glm-4.5v (16K) per Z.AI docs ([231a02e](https://github.com/linhnguyen-gt/Routiform/commit/231a02eb10f5213bd346eba878562143e9df344a))
* correct LongCat API base URL path ([58df1c0](https://github.com/linhnguyen-gt/Routiform/commit/58df1c06ee720ec5a5ef875ca10ac77a2359643f))
* correct Ollama Cloud URL and add Gemini 3.1 to Antigravity ([#643](https://github.com/linhnguyen-gt/Routiform/issues/643), [#645](https://github.com/linhnguyen-gt/Routiform/issues/645)) ([c1835cd](https://github.com/linhnguyen-gt/Routiform/commit/c1835cd9cca8a5a9bd015119882c51514b16d717))
* CORS headers on early-return error responses + auto-combo validation ([#208](https://github.com/linhnguyen-gt/Routiform/issues/208), [#209](https://github.com/linhnguyen-gt/Routiform/issues/209)) ([084b206](https://github.com/linhnguyen-gt/Routiform/commit/084b206ae6b705bdce595964963e5a7bd93e21e2))
* cross-platform machineId without process.platform branching ([#506](https://github.com/linhnguyen-gt/Routiform/issues/506)) ([6c8501f](https://github.com/linhnguyen-gt/Routiform/commit/6c8501f1227b17758d6f61e106b03592ca7fd8ad))
* cursor decompression fallback + codex token refresh + password setup bypass ([#250](https://github.com/linhnguyen-gt/Routiform/issues/250), [#251](https://github.com/linhnguyen-gt/Routiform/issues/251), [#256](https://github.com/linhnguyen-gt/Routiform/issues/256)) ([59a8b8d](https://github.com/linhnguyen-gt/Routiform/commit/59a8b8db358c05d5bf2c929ff0e27dd213dd9f2e))
* **cursor:** stabilize tool result handoff for Cursor tool calls ([#275](https://github.com/linhnguyen-gt/Routiform/issues/275)) ([9233edb](https://github.com/linhnguyen-gt/Routiform/commit/9233edb6cd030866de4296fb2cb94601c42a4b77)), closes [#274](https://github.com/linhnguyen-gt/Routiform/issues/274)
* custom image model routing + Codex OAuth workspace isolation ([#232](https://github.com/linhnguyen-gt/Routiform/issues/232), [#236](https://github.com/linhnguyen-gt/Routiform/issues/236)) ([10b23b1](https://github.com/linhnguyen-gt/Routiform/commit/10b23b15ae421ed12753773a77b819b032071c3d))
* **dashboard:** add Memory/Skills sidebar navigation and i18n keys ([cc902db](https://github.com/linhnguyen-gt/Routiform/commit/cc902db4ab3175444cd77f4fd489c23636ba668d))
* **dashboard:** limits quotas UX, Kiro reset parsing, i18n ([23c72d0](https://github.com/linhnguyen-gt/Routiform/commit/23c72d06d5bbd317f929c00a77c9617e130bc4cb))
* **dashboard:** post-release UI and proxy connection regressions ([e0a539b](https://github.com/linhnguyen-gt/Routiform/commit/e0a539bc64f9c9813dd168fd9591540bac6483f4))
* **dashboard:** resolve /dashboard/limits hanging UI with 70+ accounts via chunk parallelization ([#784](https://github.com/linhnguyen-gt/Routiform/issues/784)) ([0ad8576](https://github.com/linhnguyen-gt/Routiform/commit/0ad8576ae57d089cc764cfb58352b7a4b845e90d))
* **db:** add provider connection group migration ([43bd529](https://github.com/linhnguyen-gt/Routiform/commit/43bd529b78dba2b0c43ba85d33c394b6fd4af186))
* **db:** clear prepared statements on backup restore ([ac3d251](https://github.com/linhnguyen-gt/Routiform/commit/ac3d251a1a53dfb2ec6f371e58e693c1ff5e0d7e))
* **db:** correct migration versions sequence (014-017) to resolve UNIQUE constraint failure in CI tests ([d71c4a0](https://github.com/linhnguyen-gt/Routiform/commit/d71c4a0ea75e6e5211913967a4c153c0738826ef))
* **db:** enforce stricter validation for api key model access ([7ed40c2](https://github.com/linhnguyen-gt/Routiform/commit/7ed40c2139c4172da79375b45701bb1e1be98715))
* **db:** remove OAuth fallback overwrite when email is missing to natively support multiple accounts ([03965bf](https://github.com/linhnguyen-gt/Routiform/commit/03965bf7686069d7f7958aefdc8fd52b6e2f61d8))
* **debug/sidebar:** make debug toggle control debug section visibility and fix sidebar hidden items tracking ([a315ab2](https://github.com/linhnguyen-gt/Routiform/commit/a315ab29bc465858d3cf5dd162d920481003b919))
* default missing remainingFraction to 1 instead of 0 ([5083128](https://github.com/linhnguyen-gt/Routiform/commit/50831287749240434a4bb00a3bd7a26aff5492fe))
* deploy workflow uses node app/server.js for pm2 ([2025c16](https://github.com/linhnguyen-gt/Routiform/commit/2025c16c8209d91051888d23daa43796fa67ac41))
* **deps:** add @swc/helpers as explicit dependency ([#306](https://github.com/linhnguyen-gt/Routiform/issues/306)) ([5ea6ad4](https://github.com/linhnguyen-gt/Routiform/commit/5ea6ad4a9ee2b886aab63a264fc47a89dc5c3bd6))
* **deps:** downgrade Next.js to 16.0.10 to fix turbopack hashing regression ([bb06f8e](https://github.com/linhnguyen-gt/Routiform/commit/bb06f8eb0c0874c0c3b5abff750330c70233d998)), closes [#509](https://github.com/linhnguyen-gt/Routiform/issues/509) [#508](https://github.com/linhnguyen-gt/Routiform/issues/508)
* **dev:** allow localhost HMR origins ([4bbaf55](https://github.com/linhnguyen-gt/Routiform/commit/4bbaf5558687cc29e0f1b8475eb312606788ed71))
* **dev:** harden local runtime bootstrap and CLI settings parsing ([7e49168](https://github.com/linhnguyen-gt/Routiform/commit/7e49168bf6079e1f528208fc9952492aeb5170b5))
* disable proxy_ tool prefix for all Claude-target passthrough ([#618](https://github.com/linhnguyen-gt/Routiform/issues/618)) ([926fd8a](https://github.com/linhnguyen-gt/Routiform/commit/926fd8abf4a13738c4a7222df0297b553a8b3953))
* **docker:** add missing split2 dependency to container image ([#459](https://github.com/linhnguyen-gt/Routiform/issues/459)) ([0e5e8bf](https://github.com/linhnguyen-gt/Routiform/commit/0e5e8bf14e80d93a26f89268678bd4cadce179e6))
* **docker:** copy bootstrap-env.mjs into runtime image ([dd61421](https://github.com/linhnguyen-gt/Routiform/commit/dd6142196f07886fa1dbbe3421f68c4deca9ab16))
* **docker:** copy native-binary-compat.mjs into build image ([8630557](https://github.com/linhnguyen-gt/Routiform/commit/863055768e80b8a52df1434101223fede6478041))
* **docker:** regenerate package-lock.json from clean install for npm ci ([b82f263](https://github.com/linhnguyen-gt/Routiform/commit/b82f26366cf6bce1fccdb0af1f513c73af679d26))
* **docker:** use /api/monitoring/health for healthcheck ([#296](https://github.com/linhnguyen-gt/Routiform/issues/296)) ([0af27b8](https://github.com/linhnguyen-gt/Routiform/commit/0af27b8d8a9f0572bb75990fd7e0e07128c49186))
* **docs:** add missing </details> closing tag in Troubleshooting section ([677f5f8](https://github.com/linhnguyen-gt/Routiform/commit/677f5f8713c542f5f7f66d70cd1b91680c3d88d3))
* **docs:** correct Czech link in USER_GUIDE.md language switcher ([a1200b2](https://github.com/linhnguyen-gt/Routiform/commit/a1200b2fb5f6b728b85d97e0c14d0b6b6d5c1844))
* drop assistant prefill for cc bridge ([de162eb](https://github.com/linhnguyen-gt/Routiform/commit/de162eb71916e4afd3d80d5145e889502eb9c5f9))
* drop Bottleneck queue on 429 instead of waiting for reservoir refresh ([64f040b](https://github.com/linhnguyen-gt/Routiform/commit/64f040bdddd7ef207de057be0ab97d029e3f958b))
* **e2e:** dismiss pre-existing modal overlay in providers E2E test ([92e29a6](https://github.com/linhnguyen-gt/Routiform/commit/92e29a6ad792ad53a32d3eaedfb18b9627cc3bbc)), closes [#485](https://github.com/linhnguyen-gt/Routiform/issues/485)
* **electron-ci:** replace deprecated macos-13 runner with macos-13-large ([5428c9b](https://github.com/linhnguyen-gt/Routiform/commit/5428c9b9a8fe55f7ba04c1fcf092187bebb72592))
* **electron-ci:** sync electron/package.json version + fix Create Release ([7f66e82](https://github.com/linhnguyen-gt/Routiform/commit/7f66e82f16e6f75f835ca82d70a8097314361836))
* **electron-ci:** use macos-15-intel runner for Intel x64 macOS builds ([c74054d](https://github.com/linhnguyen-gt/Routiform/commit/c74054d928bd2bbdee55365b045c383105b0a145))
* **electron:** address auto-updater review issues ([c11c275](https://github.com/linhnguyen-gt/Routiform/commit/c11c275678c8c9cf1f44b2d07b5ab23433de6452))
* **electron:** auto-generate JWT_SECRET and STORAGE_ENCRYPTION_KEY if missing ([fd749d1](https://github.com/linhnguyen-gt/Routiform/commit/fd749d1e0bb0a1a2bc81a8fc47ffecfe62d48559)), closes [#252](https://github.com/linhnguyen-gt/Routiform/issues/252)
* **electron:** code review hardening — 16 fixes for security, performance, robustness ([d624ddd](https://github.com/linhnguyen-gt/Routiform/commit/d624ddde034db7bf7785b72e4d6ad0a9d7bc3e7c)), closes [#1](https://github.com/linhnguyen-gt/Routiform/issues/1) [#2](https://github.com/linhnguyen-gt/Routiform/issues/2) [#3](https://github.com/linhnguyen-gt/Routiform/issues/3) [#4](https://github.com/linhnguyen-gt/Routiform/issues/4) [#5](https://github.com/linhnguyen-gt/Routiform/issues/5) [#6](https://github.com/linhnguyen-gt/Routiform/issues/6) [#7](https://github.com/linhnguyen-gt/Routiform/issues/7) [#8](https://github.com/linhnguyen-gt/Routiform/issues/8) [-#16](https://github.com/linhnguyen-gt/-/issues/16)
* **electron:** resolve release build workflow errors ([7906fdf](https://github.com/linhnguyen-gt/Routiform/commit/7906fdfc1d7643e6200957ae76d713af265e7229))
* **electron:** sanitize staged bundle paths cross-platform ([e06e715](https://github.com/linhnguyen-gt/Routiform/commit/e06e7157ac79b437bbc5d61f2e67a0c393ebbdb8))
* **electron:** stage standalone bundle for desktop builds ([22f9e6f](https://github.com/linhnguyen-gt/Routiform/commit/22f9e6f4c04a930a724b46fdc8c63a2bbd01b497))
* eliminate injectedUsage reuse bug and add reasoning alias tests ([4083447](https://github.com/linhnguyen-gt/Routiform/commit/4083447c3f418745dac24368362a68fc060ff890))
* emit reasoning_content in Responses→Chat streaming translation ([7723e46](https://github.com/linhnguyen-gt/Routiform/commit/7723e46c2697a1e89b697fb19685f6656d4931d1))
* **endpoint:** filter out parent models to avoid duplicates in lists ([7ffe21e](https://github.com/linhnguyen-gt/Routiform/commit/7ffe21e23d01e890af41e127f420d45eb8be417b))
* enforce API key model restrictions and budget limits across all endpoints ([0c0a56d](https://github.com/linhnguyen-gt/Routiform/commit/0c0a56d4de4eb9eb26d5f539828dc464cea0ec7e)), closes [#130](https://github.com/linhnguyen-gt/Routiform/issues/130)
* enforce strict SSRF IP range filtering and block loopback ::1 ([9300137](https://github.com/linhnguyen-gt/Routiform/commit/93001377bf0e6e46365c8e0492bb58708fc2e108))
* ensure Codex passthrough path sets instructions and store=false ([769be46](https://github.com/linhnguyen-gt/Routiform/commit/769be46bf9c7d6f797033f098921a3b793afeeca))
* ensure output directory exists for system-info ([#709](https://github.com/linhnguyen-gt/Routiform/issues/709)) ([c07372b](https://github.com/linhnguyen-gt/Routiform/commit/c07372b58cb7e0479272bd3180fe8652958c16d5))
* extract email from id_token for Codex OAuth to allow multiple accounts ([#97](https://github.com/linhnguyen-gt/Routiform/issues/97)) ([1bd5d55](https://github.com/linhnguyen-gt/Routiform/commit/1bd5d552c15d4aa1f72f447d276db5459554a83e))
* extract updateSettingsSchema to bypass webpack barrel-file bug ([3de8b43](https://github.com/linhnguyen-gt/Routiform/commit/3de8b4371aea1e01ad42560a5a3cdf44861cf8b0))
* extract validation helpers to fix webpack barrel-file resolution bug ([751ff77](https://github.com/linhnguyen-gt/Routiform/commit/751ff77b7c4fc1728b444705dc94405f37907527))
* filter all model types in /v1/models by active providers ([#88](https://github.com/linhnguyen-gt/Routiform/issues/88)) ([bc71987](https://github.com/linhnguyen-gt/Routiform/commit/bc719875f6b55b3efc09367fbd4d101288e22d27)), closes [#81](https://github.com/linhnguyen-gt/Routiform/issues/81)
* filter registry models from auto-sync to prevent duplicates ([8e17756](https://github.com/linhnguyen-gt/Routiform/commit/8e17756bf86ff6aa7e4e38c68d0faa00c28706ba))
* **gemini:** correct API field casing, add safety finish reasons, pagination timeout ([75daf98](https://github.com/linhnguyen-gt/Routiform/commit/75daf98112c5b4e26c0372b8ec38343625e66d58))
* **gemini:** correct misleading SAFETY comment — partial SSE content is unavoidable ([50683e6](https://github.com/linhnguyen-gt/Routiform/commit/50683e66004b8aaac3294b641bcf5e057a2e6efa))
* **gemini:** filter out locked models during credential selection ([03ff03e](https://github.com/linhnguyen-gt/Routiform/commit/03ff03ed5250c3a12d3986616610569e498e79b2))
* **gemini:** log sync errors, optimize synced models query ([3ae810a](https://github.com/linhnguyen-gt/Routiform/commit/3ae810a18e2c57cba59f0ce4e6167e0e2b5633ee))
* **gemini:** no registry fallback — show 0 models when no API keys exist ([b4e674a](https://github.com/linhnguyen-gt/Routiform/commit/b4e674aeb0d0ea2efe2346eaf57f313c944cbace))
* **gemini:** per-model quota isolation — 429 on one model keeps others active ([f8d045c](https://github.com/linhnguyen-gt/Routiform/commit/f8d045c275f56f7eb56c0211943088001e879ae3))
* **gemini:** preserve thought signatures across antigravity tool calls ([587bab3](https://github.com/linhnguyen-gt/Routiform/commit/587bab3eb11a0d72a0fc4cf43b556f5297b9c024))
* **gemini:** refresh Available Models UI after API key add/delete ([7f785b8](https://github.com/linhnguyen-gt/Routiform/commit/7f785b8fa589a45f6742b9bb4fb60aaa4a12863a))
* **gemini:** remove "optional" field from schema to fix Gemini API rejection ([#244](https://github.com/linhnguyen-gt/Routiform/issues/244)) ([a1dc227](https://github.com/linhnguyen-gt/Routiform/commit/a1dc2270a26351eb2c7e01e4198713a6867431ab))
* getProviderCredentials missing allowedConnections param ([#363](https://github.com/linhnguyen-gt/Routiform/issues/363) TS error) ([4d08654](https://github.com/linhnguyen-gt/Routiform/commit/4d086542aab0f1781d2d05edd994916429982075))
* GitHub Copilot token refresh and reasoning field stripping ([51c734e](https://github.com/linhnguyen-gt/Routiform/commit/51c734e4388a4b6b3000348290d7ff81386dbfbc))
* **github:** correct copilot plan and quota mapping ([5a777bd](https://github.com/linhnguyen-gt/Routiform/commit/5a777bd59842497de65ff3ccbd378e7fee0c8791))
* **github:** use copilot token and materialize tls responses ([629a693](https://github.com/linhnguyen-gt/Routiform/commit/629a6936fab709cbc8bd6eb6a2dda8647dcf6d3f))
* **google-cli:** prefer OAuth projectId over client body project ([887cf25](https://github.com/linhnguyen-gt/Routiform/commit/887cf25b65259a371421a8681025db78d866940b))
* **google-cli:** stop random project fallback and require real OAuth projectId ([#285](https://github.com/linhnguyen-gt/Routiform/issues/285)) ([54b1d8c](https://github.com/linhnguyen-gt/Routiform/commit/54b1d8c8dedf532fef476baced3ceaced4a76a52))
* handle deprecated function_call field and function role in Chat→Responses ([213e7b7](https://github.com/linhnguyen-gt/Routiform/commit/213e7b70932039baa98344905721802e1a784105))
* handle EACCES on restricted home directories ([#133](https://github.com/linhnguyen-gt/Routiform/issues/133)) ([62069da](https://github.com/linhnguyen-gt/Routiform/commit/62069dac98eb0556010c6728a434595e098af9e4))
* harden combo fallback and health checks ([#704](https://github.com/linhnguyen-gt/Routiform/issues/704)) ([dd9de2e](https://github.com/linhnguyen-gt/Routiform/commit/dd9de2efa9ebdf577993dd6918e6714eda432799))
* hasValuableContent explicit boolean returns for SSE streaming ([#676](https://github.com/linhnguyen-gt/Routiform/issues/676)) ([63e4204](https://github.com/linhnguyen-gt/Routiform/commit/63e42047e3394afa424aee341229bca9e6ca7ea7))
* hide comfyui/sdwebui models from /v1/models when no provider configured ([a15b0ef](https://github.com/linhnguyen-gt/Routiform/commit/a15b0ef0600ba5706e3ad9019191f28f3354152c))
* i18n sync 29 langs + provider test [object Object] fix ([87ffe41](https://github.com/linhnguyen-gt/Routiform/commit/87ffe41d8c02dd41c9a2154a9db5fd06a8de9d3d))
* **i18n:** add missing cache and settings keys to all translations ([a69f7c9](https://github.com/linhnguyen-gt/Routiform/commit/a69f7c9dfd61ca7cbc40c6ce1669104701033c52))
* **i18n:** add missing cache and settings keys to all translations ([ef519ac](https://github.com/linhnguyen-gt/Routiform/commit/ef519ac5ff4f5a651bbaf475d418cd7aaa413123))
* **i18n:** complete hi.json translation (add missing keys) ([82a999e](https://github.com/linhnguyen-gt/Routiform/commit/82a999e6e9b3c7f3d802e37724b792c0aacb80f4))
* **i18n:** complete hi.json translation (add missing keys) ([8c22487](https://github.com/linhnguyen-gt/Routiform/commit/8c224878dc089af56161f11831efc9d84683e931))
* **i18n:** correct README path and prefix check in QA checklist ([f784729](https://github.com/linhnguyen-gt/Routiform/commit/f784729e674acbe5a266387dba411bb3a45c89fe))
* **i18n:** correct README path and prefix check in QA checklist ([87ed178](https://github.com/linhnguyen-gt/Routiform/commit/87ed178e27265197ff5954031685b2c23822d72f))
* **i18n:** fix placeholder mismatches in cs.json ([74fdb72](https://github.com/linhnguyen-gt/Routiform/commit/74fdb728b4098ecbc57995ef661b2616c5b04b0e))
* **i18n:** fix placeholder mismatches in cs.json ([603db8c](https://github.com/linhnguyen-gt/Routiform/commit/603db8ce6ae89f679c72be4f62fdafb194fdf989))
* **i18n:** ignore ICU inner placeholders {# X} in validator ([d244aff](https://github.com/linhnguyen-gt/Routiform/commit/d244affa6c1034cc52c2907cc733a3ed3446a9a3))
* **i18n:** ignore ICU inner placeholders {# X} in validator ([8633445](https://github.com/linhnguyen-gt/Routiform/commit/86334452c0d9f5f2df0e493b82309a81f3ff1447))
* **i18n:** improve Czech translation — correct HTTP methods and documentation text ([4562fdd](https://github.com/linhnguyen-gt/Routiform/commit/4562fdda92935151b73b531a1d501439708cdd36)), closes [#561](https://github.com/linhnguyen-gt/Routiform/issues/561) [#561](https://github.com/linhnguyen-gt/Routiform/issues/561)
* **i18n:** Improve Czech translation and variables ([5d82ffa](https://github.com/linhnguyen-gt/Routiform/commit/5d82ffa5035fe613056f43fb25172a0126d21323))
* **i18n:** remove 24 duplicate JSON keys in en.json + pt-BR.json ([bc6b084](https://github.com/linhnguyen-gt/Routiform/commit/bc6b084c7776e2037e771317a02b3103f641db21))
* **i18n:** settings remnants — PoliciesPanel, PricingTab desc, ThinkingBudget, FallbackChains, Resilience ([5f38173](https://github.com/linhnguyen-gt/Routiform/commit/5f38173387ff4f2ae556b04bef1ce1ac33062735))
* **i18n:** treat untranslated as soft warning, not failure ([8b2cd11](https://github.com/linhnguyen-gt/Routiform/commit/8b2cd11e9fbab96275b3ee3c81207facbcd10505))
* **i18n:** treat untranslated as soft warning, not failure ([e2287fa](https://github.com/linhnguyen-gt/Routiform/commit/e2287fae585cebfbc3385b792951f1b8dff06fc6))
* **i18n:** use existing provider delete label ([f2ecefb](https://github.com/linhnguyen-gt/Routiform/commit/f2ecefb54a9b8b5a43167664795aaeb4aec72de6))
* iFlow OAuth secret, MITM server compile, GeminiCLI projectId, model catalog, electron version, tierPriority schema ([2b6c88c](https://github.com/linhnguyen-gt/Routiform/commit/2b6c88cd2613ba2f633b3724102af806726a43ab)), closes [#339](https://github.com/linhnguyen-gt/Routiform/issues/339) [#335](https://github.com/linhnguyen-gt/Routiform/issues/335) [#338](https://github.com/linhnguyen-gt/Routiform/issues/338) [#334](https://github.com/linhnguyen-gt/Routiform/issues/334) [#323](https://github.com/linhnguyen-gt/Routiform/issues/323)
* **images:** support async NanoBanana task polling ([9a476d3](https://github.com/linhnguyen-gt/Routiform/commit/9a476d310aadceab03e931ed1d3ba6b1720972be))
* implement missing memory and skills api routes, wire MCP tools, fix migration numbers ([60968a9](https://github.com/linhnguyen-gt/Routiform/commit/60968a926fbe3992dfcae1c008c21799fcd92722))
* improve API base URL handling and filter for chat models in CopilotToolCard ([8383da8](https://github.com/linhnguyen-gt/Routiform/commit/8383da8a50d9fd39c3a746b97470c55b76b57ff9))
* improve apiKeyPolicy type safety and logging + fix model ID mismatch in usage.ts ([05d8d3d](https://github.com/linhnguyen-gt/Routiform/commit/05d8d3d71dfbdc2efce2c6196f69c5fd5dbecc7b)), closes [#131](https://github.com/linhnguyen-gt/Routiform/issues/131) [#128](https://github.com/linhnguyen-gt/Routiform/issues/128)
* improve Electron security and functionality ([5e72cd3](https://github.com/linhnguyen-gt/Routiform/commit/5e72cd34f0bc226261912b2cb596fc558e3bff46)), closes [#149](https://github.com/linhnguyen-gt/Routiform/issues/149)
* improve error handling in custom model API call ([bf49fdf](https://github.com/linhnguyen-gt/Routiform/commit/bf49fdf0bf098db9dfcbd1c239c3dee7451a7ce9))
* improve Provider Limits light mode contrast and Claude plan tier display ([#591](https://github.com/linhnguyen-gt/Routiform/issues/591)) ([e9ae50b](https://github.com/linhnguyen-gt/Routiform/commit/e9ae50be0c2ea5cbaaa62a33a4bb2e24d2946e25))
* include arm64 dmg in release assets ([09a0946](https://github.com/linhnguyen-gt/Routiform/commit/09a094629c274f5931f411e4e0d059c313aced7c))
* include provider aliases in active provider filter ([#353](https://github.com/linhnguyen-gt/Routiform/issues/353)) ([a3369df](https://github.com/linhnguyen-gt/Routiform/commit/a3369df62f173b663cd6c8fe2c1bb4e65c376b69))
* include tool_calls in streaming response call logs ([2bf7db9](https://github.com/linhnguyen-gt/Routiform/commit/2bf7db92eec52f1ea4d8177c683a464c2606751d))
* increase JWT session to 30 days + auto-refresh in middleware ([d0fa01c](https://github.com/linhnguyen-gt/Routiform/commit/d0fa01cc0ac65eadc0ebcd4711143f2da91bbeec))
* **install/v2.6.10:** Windows better-sqlite3 prebuilt download ([#426](https://github.com/linhnguyen-gt/Routiform/issues/426)) ([f02c5b5](https://github.com/linhnguyen-gt/Routiform/commit/f02c5b5c694fa4a67ff3fc1f7655faf364cb57f8))
* instrumentation.ts crypto import for webpack compatibility ([8caef4b](https://github.com/linhnguyen-gt/Routiform/commit/8caef4b6887d8045270bb77a0651df6891f12f9a))
* **instrumentation:** await getSettings() — property access on Promise ([#316](https://github.com/linhnguyen-gt/Routiform/issues/316) follow-up) ([11a0df5](https://github.com/linhnguyen-gt/Routiform/commit/11a0df544326e98e26502fa38fc9ca94dc23a5d0))
* invert utilization values — API returns remaining, not used ([6ea8d09](https://github.com/linhnguyen-gt/Routiform/commit/6ea8d094b24ec671c8f337c6287395ca82a06aa6))
* **issues:** API key creation crash ([#108](https://github.com/linhnguyen-gt/Routiform/issues/108)) & Codex code review quota ([#106](https://github.com/linhnguyen-gt/Routiform/issues/106)) ([5dab405](https://github.com/linhnguyen-gt/Routiform/commit/5dab4058c8ed6ef7ed2b3531dd66dfb9fbb12f3d))
* KIRO MITM card text + v2.8.9 release ([#505](https://github.com/linhnguyen-gt/Routiform/issues/505)) ([4d64e64](https://github.com/linhnguyen-gt/Routiform/commit/4d64e64127c7e2ed44e9d6747536ec9a435ee59d))
* **kiro:** strip injected model field from request body ([#478](https://github.com/linhnguyen-gt/Routiform/issues/478)) ([801b4ee](https://github.com/linhnguyen-gt/Routiform/commit/801b4eef4c388b97560088aec36dde004990c9bc))
* **lint:** replace as any with Record<string,unknown> in OAuthModal — passes check:any-budget:t11 ([1c10cfe](https://github.com/linhnguyen-gt/Routiform/commit/1c10cfe4bccb5f79c804c85cc170b50e60b155f1))
* log actual error and add sync pino.destination fallback ([#165](https://github.com/linhnguyen-gt/Routiform/issues/165)) ([68b7b35](https://github.com/linhnguyen-gt/Routiform/commit/68b7b354256a37980e576148b0a74d3e241bd2d4))
* **logger:** support transport targets ([0fe6e24](https://github.com/linhnguyen-gt/Routiform/commit/0fe6e245548ce40f06a98bf5ec6fc72eae1bd009))
* login password hint + Windows CLI healthcheck + i18n key ([3403ddc](https://github.com/linhnguyen-gt/Routiform/commit/3403ddcc6e379aaaa25799f5f8a0a4c0e023b333)), closes [#437](https://github.com/linhnguyen-gt/Routiform/issues/437) [#447](https://github.com/linhnguyen-gt/Routiform/issues/447)
* **login:** use public bootstrap settings ([cda765a](https://github.com/linhnguyen-gt/Routiform/commit/cda765a02db7fec305c3810a46bb41caf4466bb7))
* **logs:** fix light mode contrast in filter buttons and combo badge ([#378](https://github.com/linhnguyen-gt/Routiform/issues/378)) ([448c8a2](https://github.com/linhnguyen-gt/Routiform/commit/448c8a29e17ae90f36aafc8f5363b4ac5fd6d3ec))
* **logs:** map numeric pino levels ([3a3c7a7](https://github.com/linhnguyen-gt/Routiform/commit/3a3c7a79684ec44d0910238535abbaefcbe5f76f))
* make passthrough stream format-aware for Responses SSE ([#186](https://github.com/linhnguyen-gt/Routiform/issues/186)) ([5f20029](https://github.com/linhnguyen-gt/Routiform/commit/5f20029ff7ac53710db758c5a022d801c6bb1e6f))
* make streaming timeouts env-configurable ([50f1286](https://github.com/linhnguyen-gt/Routiform/commit/50f12869bff5982d51c53064ccc01310699742cb))
* **mcp-server:** type list-models locals for typecheck:core ([1dbbd72](https://github.com/linhnguyen-gt/Routiform/commit/1dbbd7241da6850cc1cd33d8ab908215a5afbb98))
* **mcp:** resolve ERR_MODULE_NOT_FOUND in global npm installs ([#936](https://github.com/linhnguyen-gt/Routiform/issues/936)) ([a7e95d0](https://github.com/linhnguyen-gt/Routiform/commit/a7e95d00cf3a7363e8148faa32fcaa5b3b933788))
* **media,auth,oauth:** hide unconfigured local providers, improve round-robin, fix OAuth popup ([#390](https://github.com/linhnguyen-gt/Routiform/issues/390) [#340](https://github.com/linhnguyen-gt/Routiform/issues/340) [#344](https://github.com/linhnguyen-gt/Routiform/issues/344)) ([91015b6](https://github.com/linhnguyen-gt/Routiform/commit/91015b649923122f816197165517492845638579))
* **media:** proper JSON error responses + fix false-positive empty transcript credential error ([d37c8b7](https://github.com/linhnguyen-gt/Routiform/commit/d37c8b732f055daa93ece484e9522e64350744f4))
* **media:** proper JSON error responses + fix false-positive empty transcript credential error ([f707fc1](https://github.com/linhnguyen-gt/Routiform/commit/f707fc1cad1864cd782970cc77730583d3500a81))
* merge PR [#562](https://github.com/linhnguyen-gt/Routiform/issues/562) — MCP session management, Claude passthrough, OAuth modal, detectFormat fixes ([18258b9](https://github.com/linhnguyen-gt/Routiform/commit/18258b9b0d416e101a28fa44a3f0a28eb6277b87))
* **migrations:** rename 013 to 014 to avoid collision with v3.3.11 ([262e72d](https://github.com/linhnguyen-gt/Routiform/commit/262e72d541db916b7e21c7976a34cf6beed0c422))
* **mitm:** use standalone-safe server entrypoint ([0a25930](https://github.com/linhnguyen-gt/Routiform/commit/0a259300205e839466cc9eae070864fe93158e3f))
* **model-sync:** log only channel-level model changes ([715101c](https://github.com/linhnguyen-gt/Routiform/commit/715101cf5eb469ed1bfffe24d0d3c2e195a4c5a9))
* **model-sync:** skip replace when auto-sync returns empty model list ([f408769](https://github.com/linhnguyen-gt/Routiform/commit/f4087694b14b317c94129fe778ceb9537e6d7c8d))
* **model-sync:** skip replace when auto-sync returns empty model list ([557509e](https://github.com/linhnguyen-gt/Routiform/commit/557509ef8431f5dedd978892fa6e5261d3e685e7))
* **model-sync:** store real provider in log summary ([a07e643](https://github.com/linhnguyen-gt/Routiform/commit/a07e64302099f97175a08dd90f1ea27df3c95aa9))
* **models.dev:** correct init environment read and add UI error states ([e91d19e](https://github.com/linhnguyen-gt/Routiform/commit/e91d19e13236f37b5920521cd1ceafd353293cd5))
* **npm:** exclude app/vscode-extension/ from package to prevent Z_DATA_ERROR during publish ([737808c](https://github.com/linhnguyen-gt/Routiform/commit/737808cf53fef5c9c945875a1d3c3c1f2734a5c8))
* **npm:** link electron-release to npm-publish via workflow_call ([f1be3e6](https://github.com/linhnguyen-gt/Routiform/commit/f1be3e6bb0b7a08b354986ef9a7547e92de432f2)), closes [#579](https://github.com/linhnguyen-gt/Routiform/issues/579)
* OAuth batch test crash + Test All button on provider pages (v2.8.8) ([4003c38](https://github.com/linhnguyen-gt/Routiform/commit/4003c38fd12d96111fb94912dafda27e9559f9fb))
* OAuth login behind nginx — use actual origin for redirect URI (Closes [#82](https://github.com/linhnguyen-gt/Routiform/issues/82)) ([#86](https://github.com/linhnguyen-gt/Routiform/issues/86)) ([39aae51](https://github.com/linhnguyen-gt/Routiform/commit/39aae51ca2f1129217f7f4fc09538de5befc5cb7))
* OAuth re-auth now updates existing connection instead of creating duplicates ([#170](https://github.com/linhnguyen-gt/Routiform/issues/170)) ([4d2a5ef](https://github.com/linhnguyen-gt/Routiform/commit/4d2a5efd12aa1606c5fda9fe17924b6dfdb7c59e))
* **oauth:** hardcode desktop OAuth client secrets to fix build-time inlining ([168b17a](https://github.com/linhnguyen-gt/Routiform/commit/168b17adc7f0be89e52bf74d565db2a9e28a19ee))
* OAuthModal [object Object] - extract message from error objects ([8231456](https://github.com/linhnguyen-gt/Routiform/commit/82314562e70bdb1c0ad2d88072e06b89b9355e5b))
* **oauth:** persist providerSpecificData from token refresh in health check ([f2f6f2f](https://github.com/linhnguyen-gt/Routiform/commit/f2f6f2f5a85270b4447655df223ce45e1b2a94f1))
* **oauth:** show manual paste mode for LAN IP access ([ff01e9e](https://github.com/linhnguyen-gt/Routiform/commit/ff01e9edaa63822970d8b8f0a634d8c696165ba5))
* **oauth:** use registered redirect_uri for Codex on remote access ([62f3c74](https://github.com/linhnguyen-gt/Routiform/commit/62f3c7416ec70b06ca62a6ec952f5e1655d57062))
* omit synthesized reasoning items in Chat→Responses translation ([#224](https://github.com/linhnguyen-gt/Routiform/issues/224)) ([2d977a3](https://github.com/linhnguyen-gt/Routiform/commit/2d977a3c4d2f392ba52a18412c065070143c44a7))
* omniModel SSE tag data loss + v2.9.1 release ([#511](https://github.com/linhnguyen-gt/Routiform/issues/511)) ([03f2ef1](https://github.com/linhnguyen-gt/Routiform/commit/03f2ef1e2b8cf978d4cc9a942c96e94486aa5e5a))
* **open-sse:** satisfy T11 explicit-any budget (regex counts word any) ([8b57f88](https://github.com/linhnguyen-gt/Routiform/commit/8b57f88ca3d0df9cdd12405378a1b9e67ffbe198))
* **opencode:** Zen/Go routing, model tests, billing 401 cooldown ([5a42534](https://github.com/linhnguyen-gt/Routiform/commit/5a42534792001b72480469f545a8c98d0f2ff3fe))
* pass resolved provider to image handler for custom models ([#238](https://github.com/linhnguyen-gt/Routiform/issues/238)) ([4b5824b](https://github.com/linhnguyen-gt/Routiform/commit/4b5824babcbfef19f4114568a2dad6309e60dd64))
* **perf:** resolve HMR singleton leaks, Edge warnings, and test stability ([aae2399](https://github.com/linhnguyen-gt/Routiform/commit/aae2399631256eb4652498719f0a6403a6d9a0e9))
* permanent @swc/helpers MODULE_NOT_FOUND fix (#crash) ([943a937](https://github.com/linhnguyen-gt/Routiform/commit/943a9374b4887929f2a5037828090c467229bbff))
* persist JWT_SECRET to SQLite so restarts don't invalidate sessions ([#382](https://github.com/linhnguyen-gt/Routiform/issues/382)) ([ced98f2](https://github.com/linhnguyen-gt/Routiform/commit/ced98f2da7006c97cee2fcdc5de92b8c2f126ad3))
* persist lastUsedAt in provider_connections schema for round-robin ([#218](https://github.com/linhnguyen-gt/Routiform/issues/218)) ([97a67b5](https://github.com/linhnguyen-gt/Routiform/commit/97a67b5d3e32adc60ff0a43c4ec4808a41fb0424)), closes [#217](https://github.com/linhnguyen-gt/Routiform/issues/217) [#217](https://github.com/linhnguyen-gt/Routiform/issues/217)
* pino-abstract-transport missing in Docker + responses worker crash + lock sync ([81c43b4](https://github.com/linhnguyen-gt/Routiform/commit/81c43b45fb0470fc5a8aa7d6c91fae36ba6a231f)), closes [#449](https://github.com/linhnguyen-gt/Routiform/issues/449) [#450](https://github.com/linhnguyen-gt/Routiform/issues/450)
* **playground:** resolve provider alias-to-ID for account selector ([521ce15](https://github.com/linhnguyen-gt/Routiform/commit/521ce15f8609bd752365efe1aabcb9112e8643b4))
* **pnpm:** remove @swc/helpers override conflict, add pnpm build-scripts config ([#328](https://github.com/linhnguyen-gt/Routiform/issues/328)) ([02b19e6](https://github.com/linhnguyen-gt/Routiform/commit/02b19e63e83517630b83eaf8a5af7608022af492))
* polish split-port implementation for merge ([01c1bbf](https://github.com/linhnguyen-gt/Routiform/commit/01c1bbfe298afa2dcdafebbd39ea39d0ce8c1e7c))
* preserve Claude Code rendering on responses translation ([d3058cb](https://github.com/linhnguyen-gt/Routiform/commit/d3058cbe071be937005baef51b21797bec544720))
* preserve client cache_control for all Claude-protocol providers ([75425ab](https://github.com/linhnguyen-gt/Routiform/commit/75425ab1a9ed2ba1486c99ad590164bc614f6057))
* preserve database data on upgrade when old schema_migrations exists ([#146](https://github.com/linhnguyen-gt/Routiform/issues/146)) ([12f7d2b](https://github.com/linhnguyen-gt/Routiform/commit/12f7d2b484ccee64caf2855cb5f9ed79f2497c8d))
* preserve explicit proxy port (80/443) instead of defaulting to 8080 ([199d173](https://github.com/linhnguyen-gt/Routiform/commit/199d17381670365855e9977d4bbee106f4270064))
* preserve prompt_cache_key in Responses API translation, escape \n in tagContent ([#517](https://github.com/linhnguyen-gt/Routiform/issues/517), [#515](https://github.com/linhnguyen-gt/Routiform/issues/515)) ([8b556de](https://github.com/linhnguyen-gt/Routiform/commit/8b556de03b3f1c5503223ab8ff5e528e9180fb08))
* prevent Antigravity 429 cascade from locking out entire connection ([c4e2627](https://github.com/linhnguyen-gt/Routiform/commit/c4e2627b432f754e7485578a29dcf01648a86b44))
* prevent auth bypass after onboarding ([#151](https://github.com/linhnguyen-gt/Routiform/issues/151)) ([06d193f](https://github.com/linhnguyen-gt/Routiform/commit/06d193f0d98ea909c9069a360e90ce2ba0e4b7cb))
* prevent login lockout when skipping wizard password setup ([#574](https://github.com/linhnguyen-gt/Routiform/issues/574)) ([9b15996](https://github.com/linhnguyen-gt/Routiform/commit/9b15996545e6a0d66999111124d98cf3d6fecca9))
* prevent mutation of original request body in Claude passthrough ([1bdabf4](https://github.com/linhnguyen-gt/Routiform/commit/1bdabf43db9e6aac726ead252ae87d63cf8f6ad1))
* **pricing:** add missing Codex 5.3/5.4 and Anthropic model ID entries ([#479](https://github.com/linhnguyen-gt/Routiform/issues/479)) ([c5f4295](https://github.com/linhnguyen-gt/Routiform/commit/c5f429521c73b31acebd3a901d797d8e78ff3afb))
* production build — crypto import, sub-component translation scope, TS config ([dbe6a4e](https://github.com/linhnguyen-gt/Routiform/commit/dbe6a4e30c4bfb8affdbe5a0ec69347a4f02f1a8))
* protocol clients e2e dev mode singleton and auth ([#710](https://github.com/linhnguyen-gt/Routiform/issues/710)) ([00f59b9](https://github.com/linhnguyen-gt/Routiform/commit/00f59b95ae4a9e97ef01c9af95cfd1d9f00aa3af))
* **providerRegistry:** remove duplicate claude-haiku-4-5-20251001 from anthropic provider to prevent ambiguous model resolution ([095c84a](https://github.com/linhnguyen-gt/Routiform/commit/095c84ac16087d33fc11933a7c92b906e0a79f82))
* providers filter persistence and settings i18n ([#970](https://github.com/linhnguyen-gt/Routiform/issues/970)) ([606824d](https://github.com/linhnguyen-gt/Routiform/commit/606824d2821161a18ff87e4c00afebf16e784c56))
* **providers:** persist supported endpoints with explicit save for custom models ([6cad4fa](https://github.com/linhnguyen-gt/Routiform/commit/6cad4fae8e51d3ad6ecd46ffb661e6e74125c8d5))
* **providers:** prevent error boundary when 'Test All' times out or returns bad JSON ([f0d00bc](https://github.com/linhnguyen-gt/Routiform/commit/f0d00bcee57d1be47689a6055c2dabff33b42614))
* **providers:** remove non-existent model names and fix incorrect model IDs ([f76c1b3](https://github.com/linhnguyen-gt/Routiform/commit/f76c1b32d6b1581909f9e4cac025fd78b9099d3a))
* **providers:** remove non-OpenAI-compatible providers, fix review feedback ([d1b8afd](https://github.com/linhnguyen-gt/Routiform/commit/d1b8afd3b858539f40647fdbf4044e92ce229a50))
* **providers:** resolve Gemini validation 4xx errors with header-based auth ([#977](https://github.com/linhnguyen-gt/Routiform/issues/977)) ([9148dc9](https://github.com/linhnguyen-gt/Routiform/commit/9148dc9e034d512ee63567249ae46a62dd63b590)), closes [#976](https://github.com/linhnguyen-gt/Routiform/issues/976)
* **providers:** secure Zed import route and add dashboard UI component ([acb9421](https://github.com/linhnguyen-gt/Routiform/commit/acb94216c8c96a7e1efedee566293bfbda971d2c))
* **providers:** show Add Connection button for OpenAI-compatible providers ([#272](https://github.com/linhnguyen-gt/Routiform/issues/272)) ([8555a3a](https://github.com/linhnguyen-gt/Routiform/commit/8555a3a106a62964504a4ec57163fb412974a937))
* proxy logic bugs and Docker build failure ([0e207dc](https://github.com/linhnguyen-gt/Routiform/commit/0e207dc5d21a2d8a65e29dac2c1f1ddd5016a575))
* proxy support for connection tests, compatible provider display ([#119](https://github.com/linhnguyen-gt/Routiform/issues/119), [#113](https://github.com/linhnguyen-gt/Routiform/issues/113)) ([1dd05bf](https://github.com/linhnguyen-gt/Routiform/commit/1dd05bffe8fae6a65e0b9f0f2a6a451ef1cfd36c))
* proxy UI bugs, connection tag grouping, and function_call prefix stripping ([5907296](https://github.com/linhnguyen-gt/Routiform/commit/5907296d368a7a3f0ed26c144656a00782534e7b)), closes [#607](https://github.com/linhnguyen-gt/Routiform/issues/607) [#607](https://github.com/linhnguyen-gt/Routiform/issues/607) [#607](https://github.com/linhnguyen-gt/Routiform/issues/607)
* **proxy:** address PR review findings for auth, credentials, and health stats ([04b5032](https://github.com/linhnguyen-gt/Routiform/commit/04b50329fc2837d6d4c25c65aeed317db2b27066))
* **proxy:** test endpoint resolves real credentials from DB via proxyId ([a329d2f](https://github.com/linhnguyen-gt/Routiform/commit/a329d2f2bc56fce70f043443d64b0880e74788df))
* **publish:** also remove app/electron/ (contains app.asar binary) to prevent Z_DATA_ERROR ([e1da181](https://github.com/linhnguyen-gt/Routiform/commit/e1da1817404690c2be89fae227089ece07e42431))
* **publish:** remove app/vscode-extension/ after build to prevent Z_DATA_ERROR in npm pack ([c632092](https://github.com/linhnguyen-gt/Routiform/commit/c63209200ed53f0ed64371b3cb589b124cc9640d))
* pure passthrough for Claude→Claude when cache_control preserved ([892830e](https://github.com/linhnguyen-gt/Routiform/commit/892830e1250f3954ba7ba62de96759169ef3112d))
* **qwen:** extract email from id_token to allow multiple accounts ([f051368](https://github.com/linhnguyen-gt/Routiform/commit/f0513683e5e4e4d5922b5b3b774ee02cabd6e43b))
* **rate-limit:** add maxWait to Bottleneck to prevent endless queuing ([#297](https://github.com/linhnguyen-gt/Routiform/issues/297)) ([a427644](https://github.com/linhnguyen-gt/Routiform/commit/a4276444b59d29cd860da6018251ca96535a8075))
* refresh Gemini CLI project ID via loadCodeAssist to prevent 403 errors ([d852a51](https://github.com/linhnguyen-gt/Routiform/commit/d852a51672471ea68cb1d291ca07de47070f551c))
* regenerate package-lock.json for npm ci compatibility ([7580571](https://github.com/linhnguyen-gt/Routiform/commit/758057131bfccbe97ea63e048d370ec21874cce7))
* reject all non-function tool types in Responses→Chat translation ([9e2f421](https://github.com/linhnguyen-gt/Routiform/commit/9e2f4216f94de0224291fb431b1e2d2cd000ce70))
* **release:** v3.0.6 — proxy context, playground selector, CI fix ([9ba65d3](https://github.com/linhnguyen-gt/Routiform/commit/9ba65d3323c7ba2ca8bbc82186eceb09edc5fdc5)), closes [#623](https://github.com/linhnguyen-gt/Routiform/issues/623)
* remove auto-opening OAuth/API key modal on provider detail page ([a5dc568](https://github.com/linhnguyen-gt/Routiform/commit/a5dc5687f8a402f368bd7421fd9dca206b574620))
* remove dead userDismissed ref after auto-open removal ([d5647ea](https://github.com/linhnguyen-gt/Routiform/commit/d5647eab3396ded5befe16e351e5a82ec12fa8dd))
* remove glm-4.7-flashx from GLM Coding provider (429 insufficient balance) ([d01266c](https://github.com/linhnguyen-gt/Routiform/commit/d01266c642f11657998d0f1043dba9e6f7ba84d0))
* remove id/type from tool_calls delta chunks in Responses API streaming ([#683](https://github.com/linhnguyen-gt/Routiform/issues/683)) ([86d377a](https://github.com/linhnguyen-gt/Routiform/commit/86d377a2f059214774fca6aa6ae2b1c2cb2551ef)), closes [#682](https://github.com/linhnguyen-gt/Routiform/issues/682)
* remove non-functional Antigravity image models from imageRegistry ([ff15828](https://github.com/linhnguyen-gt/Routiform/commit/ff158282e7a14b8e5154a6b8588bd8aecc7d7d0a))
* remove non-viable Antigravity models from registry and quota display ([3fad847](https://github.com/linhnguyen-gt/Routiform/commit/3fad8479caffb0d90267411a90be08d60bba7f1a))
* remove thinking suffix from Claude Sonnet 4.6 model entry ([9b80f72](https://github.com/linhnguyen-gt/Routiform/commit/9b80f723df239696841be6ad338cd442e0ef1516))
* remove thinking suffix from Claude Sonnet 4.6 model entvv ([f2ace01](https://github.com/linhnguyen-gt/Routiform/commit/f2ace011ffeeb1c790d3d9cc7f0f01eedede1f17))
* remove unnecessary comment from previous commit ([89eb888](https://github.com/linhnguyen-gt/Routiform/commit/89eb8885b199cb88b05599038d9baae74ac3a17b))
* rename Hindi locale in→hi, global tool name filter, collapse \n artifacts ([#642](https://github.com/linhnguyen-gt/Routiform/issues/642), [#637](https://github.com/linhnguyen-gt/Routiform/issues/637), [#638](https://github.com/linhnguyen-gt/Routiform/issues/638)) ([8752790](https://github.com/linhnguyen-gt/Routiform/commit/87527903522258e6a6aa585dc38ec66f82234760))
* repair cc compatible v1 route handling ([33297e0](https://github.com/linhnguyen-gt/Routiform/commit/33297e022640f0e188dbe2dd845fb8c51119a2ff))
* repair test failures from PR [#666](https://github.com/linhnguyen-gt/Routiform/issues/666) changes ([c485545](https://github.com/linhnguyen-gt/Routiform/commit/c48554589c6ef1388773bbe460af29c5140d46e1))
* replace custom YAML parser with js-yaml for correct OpenAPI spec parsing ([21d6a0a](https://github.com/linhnguyen-gt/Routiform/commit/21d6a0a2dd7d9b446a805ef13152a4f131d11b19))
* replace sequential Account N with stable ID-based fallback for OAuth accounts ([26f927f](https://github.com/linhnguyen-gt/Routiform/commit/26f927f798279e7c92025038cadc9e9ab3d7d5d1))
* **resilience:** prevent circuit breaker stuck OPEN in combo path ([c0da968](https://github.com/linhnguyen-gt/Routiform/commit/c0da968af299592a3ec73da5d36ac540c7701ca1))
* **resilience:** reset lastFailureTime on OPEN → CLOSED transition ([afe72c8](https://github.com/linhnguyen-gt/Routiform/commit/afe72c8029f74a555f0742898c861b2c0745e1cd))
* resolve CLI detection regression and model catalog tests ([afc0bc9](https://github.com/linhnguyen-gt/Routiform/commit/afc0bc932389d2df2dae3e3d35121563c6d40f3d))
* resolve Gemini CLI 403 project-routing errors and content accumulation ([5ec8d94](https://github.com/linhnguyen-gt/Routiform/commit/5ec8d943a3da488cdc95851dadfd5609313fb9ef))
* resolve Gemini Code Assist review comments on models.dev integration ([7c59f05](https://github.com/linhnguyen-gt/Routiform/commit/7c59f05681055acb977a6c67b753b152f011b895)), closes [#983](https://github.com/linhnguyen-gt/Routiform/issues/983)
* resolve issues [#273](https://github.com/linhnguyen-gt/Routiform/issues/273), [#276](https://github.com/linhnguyen-gt/Routiform/issues/276), [#277](https://github.com/linhnguyen-gt/Routiform/issues/277) — image routing, models route, missing-key error ([#282](https://github.com/linhnguyen-gt/Routiform/issues/282)) ([ce560eb](https://github.com/linhnguyen-gt/Routiform/commit/ce560ebe9d49b4c601f54ad9ebcfaf7e9009a778))
* resolve issues [#462](https://github.com/linhnguyen-gt/Routiform/issues/462), [#471](https://github.com/linhnguyen-gt/Routiform/issues/471) — deprecate gemini-cli, regenerate VM guide i18n ([fd2a132](https://github.com/linhnguyen-gt/Routiform/commit/fd2a1320e09aff4abe15b60ad6b52eb33535a750)), closes [#482](https://github.com/linhnguyen-gt/Routiform/issues/482)
* resolve issues [#89](https://github.com/linhnguyen-gt/Routiform/issues/89) [#90](https://github.com/linhnguyen-gt/Routiform/issues/90) [#91](https://github.com/linhnguyen-gt/Routiform/issues/91) — stream default, custom models, OAuth redirect ([5ce95dd](https://github.com/linhnguyen-gt/Routiform/commit/5ce95dd82925e0222af6dd7debdd5610e7e2d3b3))
* resolve masked key bug in CLI config saves, fix CACHE_TAG_PATTERN for \n prefix ([#523](https://github.com/linhnguyen-gt/Routiform/issues/523), [#526](https://github.com/linhnguyen-gt/Routiform/issues/526), [#531](https://github.com/linhnguyen-gt/Routiform/issues/531)) ([2a749db](https://github.com/linhnguyen-gt/Routiform/commit/2a749db427ebf694c37f732e84fcb3f653198f09))
* resolve memory/skills sidebar visibility, deep-read workflow, and Gemini 3 thought_signature bug ([3191b7a](https://github.com/linhnguyen-gt/Routiform/commit/3191b7a991e7b3b6f96fac79dcf8b72abd09211b))
* resolve multiple issues ([#493](https://github.com/linhnguyen-gt/Routiform/issues/493), [#490](https://github.com/linhnguyen-gt/Routiform/issues/490), [#452](https://github.com/linhnguyen-gt/Routiform/issues/452)) ([0a5b005](https://github.com/linhnguyen-gt/Routiform/commit/0a5b005ce5981c638027886d1928e941422e5c40))
* resolve opencode json structure to use record mapping instead of array ([#816](https://github.com/linhnguyen-gt/Routiform/issues/816)) ([3591a3f](https://github.com/linhnguyen-gt/Routiform/commit/3591a3fe5cadfa8cbf0d4cc65f504f27930c3a90))
* resolve phase 2 bug issues ([#935](https://github.com/linhnguyen-gt/Routiform/issues/935), [#927](https://github.com/linhnguyen-gt/Routiform/issues/927), [#867](https://github.com/linhnguyen-gt/Routiform/issues/867), [#936](https://github.com/linhnguyen-gt/Routiform/issues/936)) ([61b7203](https://github.com/linhnguyen-gt/Routiform/commit/61b7203062b6f92674879668725c379cb0101902))
* resolve role param error for Responses API + MiniMax (developer→system) ([a7fe369](https://github.com/linhnguyen-gt/Routiform/commit/a7fe369ea0ab760203e43d51a4b05d4b249b99ed))
* resolve t11 any-budget lint failures and remove audit doc from tracking ([9195b18](https://github.com/linhnguyen-gt/Routiform/commit/9195b189816296ce2d6b970b003ad994ce54a076))
* resolve typecheck error and add missing hi translations ([2e132e4](https://github.com/linhnguyen-gt/Routiform/commit/2e132e47e45815b825ae6207489a9eebe8ad8243))
* resolve typecheck error and add missing hi translations ([e2d1b19](https://github.com/linhnguyen-gt/Routiform/commit/e2d1b192167c2ffa3826194512beda9ce634a60f))
* resolve Windows machine ID failure due to node-machine-id bundle-time platform detection ([03bd2b6](https://github.com/linhnguyen-gt/Routiform/commit/03bd2b6803a6fd46d7e93330103a9a1ced6457e4))
* restore CacheStatsCard — was not a duplicate ([ce28dcc](https://github.com/linhnguyen-gt/Routiform/commit/ce28dcc6306d1a6b188e90f750caa495bc2044a6))
* restore dashboard layout — Tailwind v4 [@source](https://github.com/source) for route groups ([3a68d7d](https://github.com/linhnguyen-gt/Routiform/commit/3a68d7dabcd67ba1f2737d142562f4508653a9d9))
* retry expired connections in token health check instead of permanently skipping ([2392006](https://github.com/linhnguyen-gt/Routiform/commit/239200624618992a7d19a37dd2db033de1dc8853))
* **review:** simplify cascade logic and add ARIA attributes ([cd05e03](https://github.com/linhnguyen-gt/Routiform/commit/cd05e03d638f17f912500b6619168022733a9082))
* **review:** surface secret fallback and tighten error typing ([c8a539a](https://github.com/linhnguyen-gt/Routiform/commit/c8a539a6cbfbde08d036f6f5beb99c80b9eae10e))
* rotate extra api keys for custom providers ([#815](https://github.com/linhnguyen-gt/Routiform/issues/815)) ([173b5a1](https://github.com/linhnguyen-gt/Routiform/commit/173b5a1cd1de287fa1e48a6b42d11b42735da3cb))
* route OAuth token exchange through configured proxy ([#119](https://github.com/linhnguyen-gt/Routiform/issues/119)) ([1be20a4](https://github.com/linhnguyen-gt/Routiform/commit/1be20a4e2d1f50028c5a802d2d22420c9b3bcef6))
* route usage API quota fetches through configured proxy ([#194](https://github.com/linhnguyen-gt/Routiform/issues/194)) ([8dca8fb](https://github.com/linhnguyen-gt/Routiform/commit/8dca8fba6b245f0c79e8f7361af977037cea2a89))
* **routerStrategy:** use .ts extension in imports for Next.js App Router bundle compatibility ([a197bb7](https://github.com/linhnguyen-gt/Routiform/commit/a197bb773627ec5f69a2ad6f5bdfa8298505d115))
* routing strategy not persisted after refresh ([#134](https://github.com/linhnguyen-gt/Routiform/issues/134)) ([8abdf68](https://github.com/linhnguyen-gt/Routiform/commit/8abdf68718330a8efbc917ea21c370936486687b))
* **routing:** model aliases now affect routing, not just format detection ([#472](https://github.com/linhnguyen-gt/Routiform/issues/472)) ([2d7d777](https://github.com/linhnguyen-gt/Routiform/commit/2d7d7776a6cee9095dc9905d93a530eac1bfc47c))
* **routing:** unprefixed claude models now resolve to anthropic provider ([#570](https://github.com/linhnguyen-gt/Routiform/issues/570)) ([1429fea](https://github.com/linhnguyen-gt/Routiform/commit/1429fea27a7647e70864c4a60f4ee5f0cf94e2c2))
* runtime platform checks for machineId to avoid SWC dead-code elimination ([39ce0af](https://github.com/linhnguyen-gt/Routiform/commit/39ce0af4bf7577c2c3ac3c11042c3178a5926bc5))
* runtime platform checks for machineId to avoid SWC dead-code elimination ([2d3b7da](https://github.com/linhnguyen-gt/Routiform/commit/2d3b7da4cd2bcb90a07e74c245de682b48ef957f))
* sanitize hardcoded build-machine paths in standalone output ([#147](https://github.com/linhnguyen-gt/Routiform/issues/147)) ([fb2351f](https://github.com/linhnguyen-gt/Routiform/commit/fb2351ffe7b5b6a1b89baa0548358db1fee52bfb))
* sanitize response based on sourceFormat, not targetFormat ([49ad44d](https://github.com/linhnguyen-gt/Routiform/commit/49ad44dcaf898fc38cf5d7989e65c7db4718f0af))
* sanitize tool schemas for Gemini provider ([#173](https://github.com/linhnguyen-gt/Routiform/issues/173)) ([8d5891a](https://github.com/linhnguyen-gt/Routiform/commit/8d5891a382d7746685b30c9ea91f2c9d4a792e13))
* sanitizeUsage cross-maps input_tokens→prompt_tokens; update yaml vulnerability ([#617](https://github.com/linhnguyen-gt/Routiform/issues/617)) ([e3f016e](https://github.com/linhnguyen-gt/Routiform/commit/e3f016e26237c5844a2a6b1a248d5f371582c896))
* **search:** accept authenticated serper validation responses ([edf8dd2](https://github.com/linhnguyen-gt/Routiform/commit/edf8dd2a12ace1c6d990b69dce362fd9a66a8c14))
* **search:** return consistent validation result shape ([b2dc53d](https://github.com/linhnguyen-gt/Routiform/commit/b2dc53d18ba3c350523346d60652f1d11582223f))
* security hardening and UX improvements for PR [#122](https://github.com/linhnguyen-gt/Routiform/issues/122) ([e674e5d](https://github.com/linhnguyen-gt/Routiform/commit/e674e5d87bfb7db696ec45012c6c8ec77f5892d5))
* security hardening, tests, docs for Electron desktop & memory optimization ([d3ace8d](https://github.com/linhnguyen-gt/Routiform/commit/d3ace8d61150c1c0bbfb208c8ef4fd7720f57915))
* **security:** Enforce isAuthenticated across new settings and skills routes ([7f723a6](https://github.com/linhnguyen-gt/Routiform/commit/7f723a6bd52f187db6210a985822570fa83d1376))
* **security:** Remediate CodeQL High Severity alerts (SSRF & Weak Hash) ([c0e6a85](https://github.com/linhnguyen-gt/Routiform/commit/c0e6a85ffd45467307cff7184fad81cd2cfa4cc3))
* **security:** resolve final CodeQL heuristic for string substring ([1ba9ff8](https://github.com/linhnguyen-gt/Routiform/commit/1ba9ff81531e84a4cde025319927a82812c84fc4))
* **security:** resolve final CodeQL high-severity alerts ([bca3cb8](https://github.com/linhnguyen-gt/Routiform/commit/bca3cb83035b0ce3a71e9cb5309223cb1c824316))
* **security:** resolve github advanced security code scanning alerts for multi-character regex and password hash heuristics ([c40b67f](https://github.com/linhnguyen-gt/Routiform/commit/c40b67fe77f4bcae8365d2c3d74a9132bdcc15be))
* set correct 128k context length for GLM 4.5 and GLM 4.5 Air ([681e49a](https://github.com/linhnguyen-gt/Routiform/commit/681e49a4cc22da3b84d7f8048708bcdc9fec4c23))
* set DATA_DIR=/app/data in Dockerfile and docker-compose.yml ([6aaaacc](https://github.com/linhnguyen-gt/Routiform/commit/6aaaaccb1293c79c610a304ef6d8c84a084debc5))
* **settings:** add blockedProviders and requireAuthForModels to Zod schema ([7a3b21e](https://github.com/linhnguyen-gt/Routiform/commit/7a3b21eff879e79bee39af04a4035292e633d3b9))
* show auto-sync toggle for OpenAI/Anthropic compatible providers ([5205f5f](https://github.com/linhnguyen-gt/Routiform/commit/5205f5f4b42da72f658f91af04264bcb5d3f90fd))
* show dash instead of provider node ID in model-sync logs ([5fb4149](https://github.com/linhnguyen-gt/Routiform/commit/5fb4149c3200bfbd845eedb9fde9a883cb03328c))
* show provider name and dash protocol in model-sync logs ([57cfd9a](https://github.com/linhnguyen-gt/Routiform/commit/57cfd9a315a51916bc601096ba93b9e4afc5a738))
* show readable provider name in model-sync logs ([03d97ba](https://github.com/linhnguyen-gt/Routiform/commit/03d97ba6175dd348dfe9e4d437c26b4bac755c4b))
* **sidebar:** remove duplicate memory and skills tabs from primary section ([9a681a2](https://github.com/linhnguyen-gt/Routiform/commit/9a681a27adc2bdc5b7be2eea3a283e2bb16413e3))
* skip cache_control on deferred tools + remove stale schemas.js ([196a4e0](https://github.com/linhnguyen-gt/Routiform/commit/196a4e037c888e19c2358e552ef44f0a45d2d060)), closes [#215](https://github.com/linhnguyen-gt/Routiform/issues/215)
* skip duplicate models during Import from /models ([0b133fe](https://github.com/linhnguyen-gt/Routiform/commit/0b133fe55e4c8b9a83d7f76903126d6eeb2d1b0d))
* **sse:** add Claude-to-Claude passthrough for anthropic-compatible providers ([6ff7b65](https://github.com/linhnguyen-gt/Routiform/commit/6ff7b6570c45d6d77b0812b1506fd618c9c8fb9b))
* **sse:** address bot review — tighten local detection, guard null model ([1f9a402](https://github.com/linhnguyen-gt/Routiform/commit/1f9a402dcd783daea168ac44f3611d2fc884d39c))
* **sse:** extract Claude SSE usage in passthrough stream mode ([05e568f](https://github.com/linhnguyen-gt/Routiform/commit/05e568feb03063f95d42b387d4783d35d21fd343))
* **sse:** filter orphaned tool results after context compaction ([8b20818](https://github.com/linhnguyen-gt/Routiform/commit/8b2081837ea08764b784a4840e7c8437d6dc8ec9))
* **sse:** generate fallback call_id for tool calls with missing IDs ([#419](https://github.com/linhnguyen-gt/Routiform/issues/419)) ([8c6136f](https://github.com/linhnguyen-gt/Routiform/commit/8c6136fea07ea3584662ab384e9632fd1e9f24d9))
* **sse:** model-only lockout for local provider 404 (connection stays active) ([f9bcc94](https://github.com/linhnguyen-gt/Routiform/commit/f9bcc9418bf735c6d9cd234612a1bef54f51355e))
* **sse:** preserve cache_control in Claude passthrough mode ([b84c915](https://github.com/linhnguyen-gt/Routiform/commit/b84c915b230181c80960fe0ef722be055e415041))
* **sse:** preserve cache_control in Claude passthrough mode ([#708](https://github.com/linhnguyen-gt/Routiform/issues/708)) ([b6bbfe0](https://github.com/linhnguyen-gt/Routiform/commit/b6bbfe063b32058166e5f2b921c8b251cb6030e0))
* **sse:** revert resolveDataDir import in responsesTransformer for Workers compat ([e1b9876](https://github.com/linhnguyen-gt/Routiform/commit/e1b98768c71e5b0a70c00ee5c364100126a6da6a))
* **sse:** skip empty-name tool calls in Responses API translator ([ce978b6](https://github.com/linhnguyen-gt/Routiform/commit/ce978b602afffd1abd0b564b83c6b0902c4a225b))
* **sse:** strip Claude-specific fields in OpenAI format cleanup ([da58152](https://github.com/linhnguyen-gt/Routiform/commit/da581525a63f4de82a7a7b340d06d9e173684ed7))
* **sse:** strip empty text content blocks before translation ([2908303](https://github.com/linhnguyen-gt/Routiform/commit/2908303d4bd0b17d2add9488b0c62ea6c25a25d5))
* **sse:** strip unsupported params for reasoning models (o1/o3) ([d79b55b](https://github.com/linhnguyen-gt/Routiform/commit/d79b55be5ae282b11373e3d157d679c8fbf6d9ff))
* **sse:** use centralized resolveDataDir() for path resolution ([#555](https://github.com/linhnguyen-gt/Routiform/issues/555)) ([0fbabdc](https://github.com/linhnguyen-gt/Routiform/commit/0fbabdcf254f054072b4e1acf57488e49c7f79de))
* **sse:** use x-api-key for opencode-go minimax messages requests ([#733](https://github.com/linhnguyen-gt/Routiform/issues/733)) ([b94c0c7](https://github.com/linhnguyen-gt/Routiform/commit/b94c0c7d045cd4d2473844c16e33823effa9d91d))
* **startup:** fail closed on key inspection errors ([da39e14](https://github.com/linhnguyen-gt/Routiform/commit/da39e1485fd4c7b8b2bbaabf5dd5f20554a057ea))
* **startup:** honor documented env loading ([88cc53a](https://github.com/linhnguyen-gt/Routiform/commit/88cc53a4b034790fd6e4290470c54d17c9f7c6cd))
* **startup:** ignore blank data dir override ([e3a2bd7](https://github.com/linhnguyen-gt/Routiform/commit/e3a2bd75f3a2d089cae6147f02b6584b3d09a28c))
* **startup:** pass env through env-file lookup ([b19e6a8](https://github.com/linhnguyen-gt/Routiform/commit/b19e6a8e87577d957afdd68d80a02214ccd5c577))
* stream timeout, combo test auth, and empty tool name ([#355](https://github.com/linhnguyen-gt/Routiform/issues/355) [#350](https://github.com/linhnguyen-gt/Routiform/issues/350) [#346](https://github.com/linhnguyen-gt/Routiform/issues/346)) ([4fbe45f](https://github.com/linhnguyen-gt/Routiform/commit/4fbe45f30aa5844fe650799e200480d219def43d))
* **stream:** correct tool_calls delta keying and normalize shapes ([ea924f3](https://github.com/linhnguyen-gt/Routiform/commit/ea924f3bbf25800856b3ee37e5109aa53585672b))
* **stream:** extract usage from remaining buffer in flush handler ([#480](https://github.com/linhnguyen-gt/Routiform/issues/480)) ([426d863](https://github.com/linhnguyen-gt/Routiform/commit/426d8636bc152a58c5c288758a4466c9399b4ea1))
* streaming tool calls missing id and wrong finish_reason in Responses→ChatCompletions translation ([#180](https://github.com/linhnguyen-gt/Routiform/issues/180)) ([b7f0665](https://github.com/linhnguyen-gt/Routiform/commit/b7f0665ce988f7c10e83e04cc35e6dad0c6f83d2))
* **streaming:** collapse excessive newlines after thinking tag removal ([#626](https://github.com/linhnguyen-gt/Routiform/issues/626)) ([1c5c62e](https://github.com/linhnguyen-gt/Routiform/commit/1c5c62e3119919506843b803dbe4837d063f65e7)), closes [#625](https://github.com/linhnguyen-gt/Routiform/issues/625)
* **streaming:** keep Gemini/Antigravity text block open across chunks ([#253](https://github.com/linhnguyen-gt/Routiform/issues/253)) ([eab96cc](https://github.com/linhnguyen-gt/Routiform/commit/eab96cc94b85df949e460fa21c5b8524787120c9))
* **streaming:** stop sending trailing data: null after [DONE] ([#483](https://github.com/linhnguyen-gt/Routiform/issues/483)) ([c88c29e](https://github.com/linhnguyen-gt/Routiform/commit/c88c29eddc8ae970a947eb7a15240947aec55a9f))
* **stream:** normalize delta.reasoning alias and separate reasoning in client response ([#771](https://github.com/linhnguyen-gt/Routiform/issues/771)) ([370070f](https://github.com/linhnguyen-gt/Routiform/commit/370070f48942abee9b0ed14932438403de3ddb82))
* **stream:** normalize delta.reasoning to reasoning_content in SSE streaming ([61d7566](https://github.com/linhnguyen-gt/Routiform/commit/61d7566ca1b1fb53bf1688f6e400c61cf2eb8f4a))
* **stream:** sanitize response based on sourceFormat, not targetFormat ([df206d9](https://github.com/linhnguyen-gt/Routiform/commit/df206d9792cb1f5ae9e5e940f8a6302dd4879662))
* **stream:** separate reasoning from content in passthrough response body ([aa93276](https://github.com/linhnguyen-gt/Routiform/commit/aa93276e6e87fa2f7720f34f766c21bd36fc1d47))
* stringify arguments and convert tool output content types ([fe7d8f9](https://github.com/linhnguyen-gt/Routiform/commit/fe7d8f93a1803e7674da233c2b1a308a8bcdffbf))
* strip antigravity/ prefix from model names sent to upstream API + sync package-lock.json ([5811e67](https://github.com/linhnguyen-gt/Routiform/commit/5811e677f12128ca8041b9b0b8cf42b29be98683))
* strip models/ prefix from Gemini imported model IDs ([#163](https://github.com/linhnguyen-gt/Routiform/issues/163)) ([163c5fe](https://github.com/linhnguyen-gt/Routiform/commit/163c5fecccf524df0069d61803baf62f8ef31a89))
* strip only internal prefix from model name for compatible providers ([#243](https://github.com/linhnguyen-gt/Routiform/issues/243)) ([af7ca4b](https://github.com/linhnguyen-gt/Routiform/commit/af7ca4baf7d6ff238b5b9ba222ee2607b8a0b8e1)), closes [#242](https://github.com/linhnguyen-gt/Routiform/issues/242)
* strip proxy_ prefix in non-streaming Claude responses & fix LongCat validation ([#605](https://github.com/linhnguyen-gt/Routiform/issues/605), [#592](https://github.com/linhnguyen-gt/Routiform/issues/592)) ([ed146fc](https://github.com/linhnguyen-gt/Routiform/commit/ed146fcf074c5972a82ceda35fe47e5784caf275))
* strip proxy_ prefix in non-streaming Claude responses & fix LongCat validation ([#605](https://github.com/linhnguyen-gt/Routiform/issues/605), [#592](https://github.com/linhnguyen-gt/Routiform/issues/592)) ([#607](https://github.com/linhnguyen-gt/Routiform/issues/607)) ([33fee5d](https://github.com/linhnguyen-gt/Routiform/commit/33fee5dcc5c0ec5bbdb753af380f2fe61fd981b9))
* strip reasoning/thinking params for models that don't support them ([#766](https://github.com/linhnguyen-gt/Routiform/issues/766)) ([7168f40](https://github.com/linhnguyen-gt/Routiform/commit/7168f4014d07ace2a02375f02806e5a78e109079))
* sync CLI agents fingerprinting + fix dompurify XSS vulnerability ([97b1ee5](https://github.com/linhnguyen-gt/Routiform/commit/97b1ee5b02b85fa69e533453c8c8643ecc2ecb69))
* sync i18n keys across 30 languages + add 16 missing provider icons ([afbd07c](https://github.com/linhnguyen-gt/Routiform/commit/afbd07c62ae39ccb4090ea24a972ea9e2b06a3ee))
* **test:** align test script with test:unit — add tsx/esm loader ([6ba4824](https://github.com/linhnguyen-gt/Routiform/commit/6ba48241feb5df4dbbb18029621f7ce451ac68ad))
* **test:** correct JWT_SECRET assertion — required:false means missing is valid ([5e0376c](https://github.com/linhnguyen-gt/Routiform/commit/5e0376c6c95f241e5e969ad27f85ba4fcc2d9b33))
* **tests:** address code review issues ([b98d698](https://github.com/linhnguyen-gt/Routiform/commit/b98d6984a184871e630c105163ec731abf745b11))
* **tests:** Disable SQLite auto-backup during node tests to prevent Event Loop hangs on Node 22 ([fb03687](https://github.com/linhnguyen-gt/Routiform/commit/fb0368780217326a4242e59dd9a37e6d060fbfd0))
* **test:** split CacheStatsCard check into cache page test ([007b5d7](https://github.com/linhnguyen-gt/Routiform/commit/007b5d7f50a8fae9468cb4c90ed7f6870e43d960))
* **tests:** update T28/T31 for gemini dynamic model sync ([6698d33](https://github.com/linhnguyen-gt/Routiform/commit/6698d33f040326fa22fc2dc007724987fcc95599))
* transcription Content-Type + language detection for Deepgram/HuggingFace ([538a3e8](https://github.com/linhnguyen-gt/Routiform/commit/538a3e855c0ab71f979bcd2ccf11694c9322318f))
* translate input_file↔file content parts ([0b85d8a](https://github.com/linhnguyen-gt/Routiform/commit/0b85d8a9bcbe0bc7a83f7b79e3d1785d9b8c028e))
* translate input_image↔image_url with detail preservation ([58d6938](https://github.com/linhnguyen-gt/Routiform/commit/58d6938065a5fb53b836b924ecc28cb0a722b750))
* translate tool_choice object format between Responses and Chat APIs ([a48f7b2](https://github.com/linhnguyen-gt/Routiform/commit/a48f7b2222e1f8bb10a7879aaf7d3fe94facbf01))
* translation failures for OpenAI-format providers in Claude CLI ([#632](https://github.com/linhnguyen-gt/Routiform/issues/632)) ([dee1d9b](https://github.com/linhnguyen-gt/Routiform/commit/dee1d9ba74239efcbad21d70d43dfd74bf24abec))
* **translator:** emit response.completed with total_tokens for Responses API clients ([8372a3c](https://github.com/linhnguyen-gt/Routiform/commit/8372a3c7ca951a92f16d2ce11b1fc928b9e6de1b))
* **translator:** map Claude thinking_delta to reasoning_content not content ([#289](https://github.com/linhnguyen-gt/Routiform/issues/289)) ([8a7f7c1](https://github.com/linhnguyen-gt/Routiform/commit/8a7f7c1ba08619875368fe55b282a29d7e82272f))
* **translator:** remove thoughtSignature from functionCall parts in all Gemini translators ([c500366](https://github.com/linhnguyen-gt/Routiform/commit/c5003665c3f70b1545684f9d29ce8bc30e0d0af8)), closes [#724](https://github.com/linhnguyen-gt/Routiform/issues/724)
* **translator:** remove thoughtSignature from functionCall parts in Gemini translation ([48182ed](https://github.com/linhnguyen-gt/Routiform/commit/48182edbd5f62465b39bed744f2babf525bb287f)), closes [#725](https://github.com/linhnguyen-gt/Routiform/issues/725)
* treat private/LAN IPs as localhost for OAuth redirect URI ([245345f](https://github.com/linhnguyen-gt/Routiform/commit/245345f37d0b0376900935e872e86cd70384d358))
* trim leading whitespace from assembled content in log summaries ([d3a2444](https://github.com/linhnguyen-gt/Routiform/commit/d3a24446b84da59aeb55987ed3fb874b61c32b03))
* **ts:** wrap unknown dataObj fields with toRecord() in usage.ts (Kimi usage parser) ([5df3c22](https://github.com/linhnguyen-gt/Routiform/commit/5df3c22be8d3d55227cceadf66e40d099ee1089b))
* **types:** cast extracted usage to Record<string,number> in stream.ts to resolve TS property errors ([0546d06](https://github.com/linhnguyen-gt/Routiform/commit/0546d06c0a404b86601d289c4cd874ce86042a38))
* **types:** cast providerSpecificData.validationModelId to string in EditConnectionModal ([e003d58](https://github.com/linhnguyen-gt/Routiform/commit/e003d58c6017bad2f4a40a60b15e79a718650c58))
* **types:** Zod 4 z.record 2-arg form + header type cast in openapi/try ([7142688](https://github.com/linhnguyen-gt/Routiform/commit/7142688a770f53ee332129575cc3570eff7a68a3))
* **ui/ci:** use ProviderIcon for Provider header breadcrumbs and add permissions to electron-release.yml ([#745](https://github.com/linhnguyen-gt/Routiform/issues/745), [#761](https://github.com/linhnguyen-gt/Routiform/issues/761)) ([5ad687c](https://github.com/linhnguyen-gt/Routiform/commit/5ad687c6d8540341903f92bc954bcd5891a06c6d))
* **ui:** add ProviderIcon to agents page CLI tools + maxDuration for transcription ([b82af2b](https://github.com/linhnguyen-gt/Routiform/commit/b82af2b8499ef9cb725798726c608e2850e90be5))
* **ui:** correct Quick Start API key link to /dashboard/endpoint ([5a64597](https://github.com/linhnguyen-gt/Routiform/commit/5a645973ebce8e72b905ab1633e719ce66ecd8df))
* **ui:** improve cache page header sizing and context ([d838388](https://github.com/linhnguyen-gt/Routiform/commit/d838388443be24af0622130dc9e00a79a7d900d8))
* **ui:** improve dashboard responsiveness and i18n error message ([c2a7775](https://github.com/linhnguyen-gt/Routiform/commit/c2a777580a606409bfdfda766d1d7f9af29b1524))
* **ui:** internationalize CacheStatsCard and add auto-refresh ([67b9a3b](https://github.com/linhnguyen-gt/Routiform/commit/67b9a3bc0eb0e564cb5fa43a751dd2f0ab3d5796)), closes [#835](https://github.com/linhnguyen-gt/Routiform/issues/835)
* **ui:** restore codex service tier toggle contrast ([243d61d](https://github.com/linhnguyen-gt/Routiform/commit/243d61d95f3e96431d22cd5af45c270bb7480feb))
* **ui:** translate hardcoded PT-BR text in OAuthModal to English ([#314](https://github.com/linhnguyen-gt/Routiform/issues/314)) ([f6b125e](https://github.com/linhnguyen-gt/Routiform/commit/f6b125e8c2ec8511143bc9ef6483e877404c6319))
* **ui:** use ProviderIcon component on dashboard home page ([703591d](https://github.com/linhnguyen-gt/Routiform/commit/703591d76a21b57682a3d1aa9b3f4f422572f945))
* update Antigravity model list and replace ag/ prefix with antigravity/ ([fbd30dc](https://github.com/linhnguyen-gt/Routiform/commit/fbd30dc4ee6de37c4f9d90abd0ac7b0896765254))
* update Windsurf test to match merged config notes ([3d6b85e](https://github.com/linhnguyen-gt/Routiform/commit/3d6b85ed2091b74fc9830789777b271f6d43b7dc))
* upload only installer files to releases ([de75ed1](https://github.com/linhnguyen-gt/Routiform/commit/de75ed155123a44d4659e909891896106fcc99da))
* **usage:** correct Claude quota display — utilization = % used, not % remaining ([#299](https://github.com/linhnguyen-gt/Routiform/issues/299)) ([46cff22](https://github.com/linhnguyen-gt/Routiform/commit/46cff2200d37c96625d87e36780e319ecaf715b0))
* **usage:** GitHub Copilot quotas + Provider Limits consumption UI ([f93a122](https://github.com/linhnguyen-gt/Routiform/commit/f93a122425062dc603c4b6aece18af1556af3cb3))
* **usage:** include cache tokens in input token counts ([c6eadc5](https://github.com/linhnguyen-gt/Routiform/commit/c6eadc504b698c29a782a41737fd07c3d4bc4b7a))
* **usage:** include cache tokens in usage history input total ([#477](https://github.com/linhnguyen-gt/Routiform/issues/477)) ([e6af874](https://github.com/linhnguyen-gt/Routiform/commit/e6af874b47a0254433f5ca57b6a8d47644f6043d))
* **usage:** proxy fallback — retry without proxy when SOCKS5 relay fails ([39e9e44](https://github.com/linhnguyen-gt/Routiform/commit/39e9e4446b6d76a008395f93d57e7ce44392cca4))
* **usage:** track provider limit refreshes per account ([e7addec](https://github.com/linhnguyen-gt/Routiform/commit/e7addec0a1087474f2470bb37356fa09198e7fe4))
* use bash shell for Collect installers step on Windows runner ([09e90ec](https://github.com/linhnguyen-gt/Routiform/commit/09e90ec25bb537bcfcf9ebc1d237e56eef8a5aa1))
* use bg-surface for Provider Limits table to match Card components in light mode ([b32de54](https://github.com/linhnguyen-gt/Routiform/commit/b32de549443a1a2c4802ec1809d199fe84ffd5b6)), closes [#f0f0f5](https://github.com/linhnguyen-gt/Routiform/issues/f0f0f5)
* use fetchAvailableModels for Antigravity quota instead of retrieveUserQuota ([89eb5b7](https://github.com/linhnguyen-gt/Routiform/commit/89eb5b7eb955bb9f7f179a6bbdce330c9f9ddaba))
* use gemini-cli/ as model prefix instead of gc/ ([7ab75dd](https://github.com/linhnguyen-gt/Routiform/commit/7ab75dd15a1460c1a11e136c924f28cd0e8dafef))
* use GLM Coding API endpoints for model import with region-aware URLs ([fe3f9c8](https://github.com/linhnguyen-gt/Routiform/commit/fe3f9c86d5c1d0b75c16f868669326f303706660))
* use OAuth usage endpoint for Claude Code provider limits ([b5a3a3d](https://github.com/linhnguyen-gt/Routiform/commit/b5a3a3d019faa605e04dc5f20bb948b23293910a))
* use provider node credentials for embeddings ([ecccce8](https://github.com/linhnguyen-gt/Routiform/commit/ecccce86e44936200220874e391ca3a2e7344d56))
* use relative paths in audit doc and correct Indonesian translations in in.json ([b812d6e](https://github.com/linhnguyen-gt/Routiform/commit/b812d6efb8579ab0f25a2caa16cd7e330b805d00))
* use replaceAll for think tags to handle multiple occurrences ([fdaeccf](https://github.com/linhnguyen-gt/Routiform/commit/fdaeccf1e52ed36361331aa55260506b4719efef))
* use snake_case mime_type to match Gemini API convention ([56f1c53](https://github.com/linhnguyen-gt/Routiform/commit/56f1c53084cad4f272375b6307a5f467fde526cb))
* **v1beta:** remove Gemini duplicates — filter non-consecutive entries, skip custom models ([464fd6d](https://github.com/linhnguyen-gt/Routiform/commit/464fd6d4d3354f06bd7ff1b09a07dbe579b590e2))
* **v2.6.9:** CI budget checks, [#409](https://github.com/linhnguyen-gt/Routiform/issues/409) file attachments, atomic release workflow ([838f1d6](https://github.com/linhnguyen-gt/Routiform/commit/838f1d645c6723736e57feeceb585202abdeaf1a))
* validate empty tool_use.name to prevent Claude 400 errors ([#191](https://github.com/linhnguyen-gt/Routiform/issues/191)) ([de8a083](https://github.com/linhnguyen-gt/Routiform/commit/de8a0836a8dc1a47b4890efcd860996d4fa2b470))
* validate GLM coding provider settings ([14bf364](https://github.com/linhnguyen-gt/Routiform/commit/14bf3645d60d2b2cd54e81ab3f5e076bd70e250f))
* **validation:** accept .safeParse() as body validation ([8ea6142](https://github.com/linhnguyen-gt/Routiform/commit/8ea614266c9b01e2457749d472626037ffdbad04))
* **validation:** accept .safeParse() as body validation ([27ff33f](https://github.com/linhnguyen-gt/Routiform/commit/27ff33f93b071b6ce1a6f323c6616714eddbd4e8))
* **validation:** support elevenlabs and inworld API key checks ([5ab6a3b](https://github.com/linhnguyen-gt/Routiform/commit/5ab6a3b43189417bfef7a2e34f4154cf9e307fde))
* **validation:** support ElevenLabs and Inworld API key validation ([#281](https://github.com/linhnguyen-gt/Routiform/issues/281)) ([ba38dc7](https://github.com/linhnguyen-gt/Routiform/commit/ba38dc738bf90734674eed556acc164ff82101ca))
* wire apiFormat from custom model DB into routing layer ([#204](https://github.com/linhnguyen-gt/Routiform/issues/204)) ([358828b](https://github.com/linhnguyen-gt/Routiform/commit/358828b6173848d1bfe9a38e77249fad35bb2bd1))

## [3.5.2] — 2026-04-05

### ✨ New Features

- **Qoder API Native Integration:** Completely refactored the Qoder Executor to bypass the legacy COSY AES/RSA encryption algorithm, routing directly into the native DashScope OpenAi-compatible URL. Eliminates complex dependencies on Node `crypto` modules while improving stream fidelity.
- **Resilience Engine Overhaul:** Integrated context overflow graceful fallbacks, proactive OAuth token detection, and empty-content emission prevention (#990).
- **Context-Optimized Routing Strategy:** Added new intelligent routing capability to natively maximize context windows in automated combo deployments (#990).

### 🐛 Bug Fixes

- **Responses API Stream Corruption:** Fixed deep-cloning corruption where Anthropic/OpenAI translation boundaries stripped `response.` specific SSE prefixes from streaming boundaries (#992).
- **Claude Cache Passthrough Alignment:** Aligned CC-Compatible cache markers consistently with upstream Client Pass-Through mode preserving prompt caching.
- **Turbopack Memory Leak:** Pinned Next.js to strict `16.0.10` preventing memory leaks and build staleness from recent upstream Turbopack hashed module regressions (#987).

---

## [3.5.1] — 2026-04-04

### ✨ New Features

- **Models.dev Integration:** Integrated models.dev as the authoritative runtime source for model pricing, capabilities, and specifications, overriding hardcoded prices. Includes a settings UI to manage sync intervals, translation strings for all 30 languages, and robust test coverage.
- **Provider Native Capabilities:** Added support for declaring and checking native API features (e.g. `systemInstructions_supported`) preventing failures by sanitizing invalid roles. Currently configured for Gemini Base and Antigravity OAuth providers.
- **API Provider Advanced Settings:** Added per-connection custom `User-Agent` overrides for API-key provider connections. The override is stored in `providerSpecificData.customUserAgent` and now applies to validation probes and upstream execution requests.

### 🐛 Bug Fixes

- **Qwen OAuth Reliability:** Resolved a series of OAuth integration issues including a 400 Bad Request blocker on expired tokens, fallback generation for parsing OIDC `access_token` properties when `id_token` is omitted, model catalog discovery errors, and strict filtering of `X-Dashscope-*` headers to avoid 400 rejection from OpenAI-compatible endpoints.

## [3.5.0] — 2026-04-03

### ✨ New Features

- **Auto-Combo & Routing:** Completed native CRUD lifecycle integration for the advanced Auto-Combo engine (#955).
- **Core Operations:** Fixed missing translations for new native Auto-Combos options (#955).
- **Security Validation:** Disabled SQLite auto-backup tasks natively during unit test CI execution to explicitly resolve Node 22 Event Loop hanging memory leaks (#956).
- **Ecosystem Proxies:** Completed explicit integration mapping model synchronization schedulers, OAuth cycles, and Token Check refreshes safely through Routiform's native system upstream proxies (#953).
- **MCP Extensibility:** Added and successfully registered the new `routiform_web_search` MCP framework tool out of beta into production schemas (#951).
- **Tokens Buffer Logic:** Added runtime configuration limits extending configurable input/output token buffers for precise Usage Tracking metrics (#959).

### 🐛 Bug Fixes

- **CodeQL Remediation:** Fully resolved and secured critical string indexing operations preventing Server-Side Request Forgery (SSRF) arrays indexing heuristics alongside polynomial algorithmic backtracking (ReDoS) inside deep proxy dispatcher modules.
- **Crypto Hashes:** Replaced weak unverified legacy OAuth 1.0 hashes with robust HMAC-SHA-256 standard validation primitives ensuring tight access controls.
- **API Boundary Protection:** Correctly verified and mapped structural route protections enforcing strict `isAuthenticated()` middleware logic covering newer dynamic endpoints targeting settings manipulation and native skills loading.
- **CLI Ecosystem Compat:** Resolved broken native runtime parser bindings crashing `where` environment detectors strictly over `.cmd/.exe` edge cases gracefully for external plugins (#969).
- **Cache Architecture:** Refactored exact Analytics and System Settings dashboard parameters layout structure caching to maintain stable re-hydration persistence cycles resolving visual unaligned state flashes (#952).
- **Claude Caching Standards:** Normalized and accurately strictly preserved critical ephemeral block markers `ephemeral` caching TTL orders for downstream nodes enforcing standard compatible CC requests mapping cleanly without dropped metrics (#948).
- **Internal Aliases Auth:** Simplified internal runtime mappings normalizing Codex credential payload lookups inside global translation parameters resolving 401 unauthenticated drops (#958).

### 🛠️ Maintenance

- **UI Discoverability:** Correctly adjusted layout categorizations explicitly separating free tier providers logic improving UX sorting flows inside the general API registry pages (#950).
- **Deployment Topology:** Unified Docker deployment artifacts ensuring the root `fly.toml` matches expected cloud instance parameters out-of-the-box natively handling automated deployments scaling properly.
- **Development Tooling:** Decoupled `LKGP` runtime parameters into explicit DB layer abstraction caching utilities ensuring strict test isolation coverage for core caching layers safely.

---

## [3.4.9] — 2026-04-03

### Features & Refactoring

- **Dashboard Auto-Combo Panel:** Completely refactored the `/dashboard/auto-combo` UI to seamlessly integrate with native Dashboard Cards and standardized visual padding/headers. Added dynamic visual progress bars mapping model selection weight mechanisms.
- **Settings Routing Sync:** Fully exposed advanced routing `priority` and `weighted` schema targets internally inside global settings fallback lists.

### Bug Fixes

- **Memory & Skills Locale Nodes:** Resolved empty rendering tags for Memory and Skills options directly inside global settings views by wiring all `settings.*` mapping values internally into `en.json` (also mapped implicitly for cross-translation tools).

### Internal Integrations

- Integrated PR #946 — fix: preserve Claude Code compatibility in responses conversion
- Integrated PR #944 — fix(gemini): preserve thought signatures across antigravity tool calls
- Integrated PR #943 — fix: restore GitHub Copilot body
- Integrated PR #942 — Fix cc-compatible cache markers
- Integrated PR #941 — refactor(auth): improve NVIDIA alias lookup + add LKGP error logging
- Integrated PR #939 — Restore Claude OAuth localhost callback handling
- _(Note: PR #934 was omitted from 3.4.9 cycle to prevent core conflict regressions)_

---

## [3.4.8] — 2026-04-03

### Security

- Fully remediated all outstanding Github Advanced Security (CodeQL) findings and Dependabot alerts.
- Fixed insecure randomness vulnerabilities by migrating from `Math.random` to `crypto.randomUUID()`.
- Secured shell commands in automated scripts from string injection.
- Migrated vulnerable catastrophic backtracking RegEx parsing patterns in chat/translation pipelines.
- Enhanced output sanitization controls inside React UI components and Server Sent Events (SSE) tag injection.

---

## [3.4.7] — 2026-04-03

### Features

- Added `Cryptography` node to Monitoring and MCP health checks (#798)
- Hardened model-catalog route permissions mapping (`/models`) (#781)

### Bug Fixes

- Fixed Claude OAuth token refreshes failing to preserve cache contexts (#937)
- Fixed CC-Compatible provider errors rendering cached models unreachable (#937)
- Fixed GitHub Executor errors related to invalid context arrays (#937)
- Fixed NPM-installed CLI tools healthcheck failures on Windows (#935)
- Fixed payload translation dropping valid content due to invalid API fields (#927)
- Fixed runtime crash in Node 25 regarding API key execution (#867)
- Fixed MCP standalone module-resolution (`ERR_MODULE_NOT_FOUND`) via `esbuild` (#936)
- Fixed NVIDIA NIM routing credential resolution alias mismatch (#931)

### Security

- Added safe strict input boundary protection against raw `shell: true` remote-code execution injections.

---

## [3.4.6] - 2026-04-02

### ✨ New Features

- **Providers:** Registered new image, video, and audio generation providers from the community-requested list (#926).
- **Dashboard UI:** Added standalone sidebar navigation for the new Memory and Skills modules (#926).
- **i18n:** Added translation strings and layout mappings across 30 languages for the Memory and Skills namespaces.

### 🐛 Bug Fixes

- **Resilience:** Prevented the proxy Circuit Breaker from becoming stuck in an OPEN state indefinitely by handling direct transitions to CLOSED state inside fallback combo paths (#930).
- **Protocol Translation:** Patched the streaming transformer to sanitize response blocks based on the expected _source_ protocol rather than the provider _target_ protocol, fixing Anthropics models wrapped in OpenAI payloads crashing Claude Code (#929).
- **API Specs & Gemini:** Fixed `thought_signature` parsing in `openai-to-gemini` and `claude-to-gemini` translators, preventing HTTP 400 errors across all Gemini 3 API tool-calls.
- **Providers:** Cleaned up non-OpenAI-compatible endpoints preventing valid upstream connections (#926).
- **Cache Trends:** Fixed an invalid property mapping data mismatch causing Cache Trends UI charts to crash, and extracted redundant cache metric widgets (#926).

---

## [3.4.5] - 2026-04-02

### ✨ New Features

- **CLIProxyAPI Ecosystem Integration:** Added the `cliproxyapi` executor with built-in module-level caching and proxy routing. Introduced a comprehensive Version Manager service to automatically test health, download binaries from GitHub, spawn isolated background processes, and cleanly manage the lifecycle of external CLI tools directly through the UI. Includes DB tables for proxy configuration to enable automatic SSRF-gated cross-routing of external OpenAI requests via the local CLI tool layer (#914, #915, #916).
- **Qoder PAT Support:** Integrated Personal Access Tokens (PAT) support directly via the local `qodercli` transport instead of legacy remote `.cn` browser configurations (#913).
- **Gemini 3.1 Pro Preview (GitHub):** Added `gemini-3.1-pro-preview` canonical explicit model support natively into the GitHub Copilot provider while preserving older routing aliases (#924).

### 🐛 Bug Fixes

- **GitHub Copilot Token Stability:** Repaired the Copilot token refresh loop where stale tokens weren't deep-merged into DB, and removed `reasoning_text` fields that were fatally breaking downstream Anthropic block conversions for multi-turn chats (#923).
- **Global Timeout Matrix:** Centralized and parameterized request timeouts explicitly from `REQUEST_TIMEOUT_MS` to prevent hidden (~300s) default fetch buffers prematurely cutting off long-lived SSE streaming responses from heavy reasoning models (#918).
- **Cloudflare Quick Tunnels State:** Fixed a severe state inconsistency where restarted Routiform instances erroneously showed destroyed tunnels as active, and defaulted cloudflared tunneling to `HTTP/2` to eliminate UDP receive buffer log spam (#925).
- **i18n Translation Overhaul (Czech & Hindi):** Fixed Hindi code from DEPRECATED `in.json` to canonical `hi.json`, overhauled Czech text mappings, extracted `untranslatable-keys.json` to fix CI/CD false-positive validations, and generated comprehensive `I18N.md` docs to guide translators (#912).
- **Tokens Provider Recovery:** Fixed Qwen losing specific `resourceUrl` endpoints after automatic health-check token refreshes because of missing DB deep merges (#917).
- **CC Compatible UX & Streaming:** Unified the Add CC/OpenAI/Anthropic compatible actions around the Anthropic UI treatment, forced CC-compatible upstream requests to use SSE while still returning streaming or non-streaming responses based on the client request, removed CC model-list configuration/import support in favor of an explicit unsupported-model-listing error, and made CC-compatible Available Models mirror the OAuth Claude Code registry list (#921).

---

## [3.4.4] - 2026-04-02

### 🐛 Bug Fixes

- **Responses API Token Reporting:** Emit `response.completed` with correct `input_tokens`/`output_tokens` fields for Codex CLI clients, fixing token usage display (#909 — thanks @christopher-s).
- **SQLite WAL Checkpoint on Shutdown:** Flush WAL changes into the primary database file during graceful shutdown/restart, preventing data loss on Docker container stops (#905 — thanks @rdself).
- **Graceful Shutdown Signal:** Changed `/api/restart` and `/api/shutdown` routes from `process.exit(0)` to `process.kill(SIGTERM)`, ensuring the shutdown handler runs before exit.
- **Docker Stop Grace Period:** Added `stop_grace_period: 40s` to Docker Compose files and `--stop-timeout 40` to Docker run examples.

### 🛠️ Maintenance

- Closed 5 resolved/not-a-bug issues (#872, #814, #816, #890, #877).
- Triaged 6 issues with needs-info requests (#892, #887, #886, #865, #895, #870).
- Responded to CLI detection tracking issue (#863) with contributor guidance.

---

## [3.4.3] - 2026-04-02

### ✨ New Features

- **Antigravity Memory & Skills:** Completed remote memory and skills injection for the Antigravity provider at the proxy network level.
- **Claude Code Compatibility:** Built a natively hidden compatibility bridge for Claude Code, passing tools and formatting through cleanly.
- **Web Search MCP:** Added the `routiform_web_search` tool with the `execute:search` scope.
- **Cache Components:** Implemented dynamic cache components utilizing TDD.
- **UI & Customization:** Added custom favicon support, appearance tabs, wired whitelabeling to the sidebar, and added Windsurf guide steps across all 33 languages.
- **Log Retention:** Unified request log retention and artifacts natively.
- **Model Enhancements:** Added explicit `contextLength` for all opencode-zen models.
- **i18n & translations:** Integrated 33 language translations natively, including placeholder CI validations and Chinese documentation updates (#873, #869).

### 🐛 Bug Fixes

- **Qwen OAuth Mapping:** Reverted `id_token` reliance to `access_token` and enabled dynamic `resource_url` API endpoint injection for proper regional routing (#900).
- **Model Sync Engine:** Stored the strict internal Provider ID in `getCustomModels()` sync routines instead of the UI Channel Alias format, preventing SQLite catalog insertion failures (#903).
- **Claude Code & Codex:** Standardized non-streaming blank responses to Anthropic-formatted `(empty response)` to prevent CLI proxy crashes (#866).
- **CC Compatible Routing:** Resolved duplicate `/v1` endpoint collision during path concatenation for generic Claude Code gateways (#904).
- **Antigravity Dashboards:** Blocked unlimited quota models from falsely registering as exhausted `100% Usage` limit states in the Provider Usage UI (#857).
- **Claude Image Passthrough:** Fixed Claude models missing image block passthroughs (#898).
- **Gemini CLI Routing:** Resolved 403 authorization lockouts and content accumulation issues by refreshing the project ID via `loadCodeAssist` (#868).
- **Antigravity Stability:** Corrected model access lists, enforced 404 lockouts, fixed 429 cascades locking out standard connections, and capped `gemini-3.1-pro` output tokens (#885).
- **Provider Sync Cadence:** Repaired the provider limits synchronization cadence via the internal scheduler (#888).
- **Dashboard Optimization:** Resolved `/dashboard/limits` UI freezing when processing 70+ accounts via chunk parallelization (#784).
- **SSRF Hardening:** Enforced strict SSRF IP range filtering and blocked the `::1` loopback interface.
- **MIME Types:** Standardized `mime_type` to snake_case to match Gemini API specifications.
- **CI Stabilization:** Fixed failing analytics/settings Playwright selectors and request assertions so GitHub Actions E2E runs pass reliably across localized UIs and switch-based controls.
- **Deterministic Tests:** Removed date-sensitive quota fixtures from Copilot usage tests and aligned idempotency/model catalog tests with the merged runtime behavior.
- **MCP Type Hardening:** Removed zero-budget explicit `any` regressions from the MCP server tool registration path.
- **Model Sync Engine:** Bypassed destructive `replace` overrides when the provider's auto-sync yields an empty model list, maintaining stability for dynamic catalogs (#899).

### 🛠️ Maintenance

- **Pipeline Logging:** Refined pipeline logging artifacts and enforce retention caps (#880).
- **AGENTS.md Overhaul:** Condensed from 297→153 lines. Added build/test/style guidelines, code workflows (Prettier, TypeScript, ESLint), and trimmed verbose tables (#882).
- **Release Branch Integration:** Consolidated the active feature branches into `release/v3.4.2` on top of current `main` and validated the branch with lint, unit, coverage, build, and CI-mode E2E runs.
- **Testing:** Added vitest configuration for component testing and Playwright specs for settings toggles.
- **Doc Updates:** Expanded root readmes, translated chinese documents natively, and cleaned up obsolete files.

## [3.4.1] - 2026-03-31

> [!WARNING]
> **BREAKING CHANGE: request logging, retention, and logging environment variables have been redesigned.**
> On the first startup after upgrading, Routiform archives legacy request logs from `DATA_DIR/logs/`, legacy `DATA_DIR/call_logs/`, and `DATA_DIR/log.txt` into `DATA_DIR/log_archives/*.zip`, then removes the deprecated layout and switches to the new unified artifact format under `DATA_DIR/call_logs/`.

### ✨ New Features

- **.ENV Migration Utility:** Included `scripts/migrate-env.mjs` to seamlessly migrate `<v3.3` configurations to `v3.4.x` strict security validation constraints (FASE-01), repairing startup crashes caused by short `JWT_SECRET` instances.
- **Kiro AI Cache Optimization:** Implemented deterministic `conversationId` generation (uuidv5) to enable AWS Builder ID Prompt Caching properly across invocations (#814).
- **Dashboard UI Restoration & Consolidation:** Resolved sidebar logic omitting the Debug section, and cleared Nextjs routing warnings by moving standalone `/dashboard/mcp` and `/dashboard/a2a` pages explicitly into embedded Endpoint Proxy UI components.
- **Unified Request Log Artifacts:** Request logging now stores one SQLite index row plus one JSON artifact per request under `DATA_DIR/call_logs/`, with optional pipeline capture embedded in the same file.
- **Language:** Improved the Chinese translation (#855)
- **Opencode-Zen Models:** Added 4 free models to opencode-zen registry (#854)
- **Tests:** Added unit and E2E tests for settings toggles and bug fixes (#850)

### 🐛 Bug Fixes

- **429 Quota Parsing:** Parsed long quota reset times from error bodies to honor correct backoffs and prevent rate-limited account bans (#859)
- **Prompt Caching:** Preserved client `cache_control` headers for all Claude-protocol providers (like Minimax, GLM, and Bailian), correctly recognizing caching support (#856)
- **Model Sync Logs:** Reduced log spam by recording `sync-models` only when the channel actually modifies the list (#853)
- **Provider Quota & Token Parsing:** Switched Antigravity limits to use `retrieveUserQuota` natively and correctly mapped Claude token refresh payloads to URL-encoded forms (#862)
- **Rate-Limiting Stability:** Universalized the 429 Retry-After parsing architecture to cap provider-induced cooldowns at 24 hours max (#862)
- **Dashboard Limit Rendering:** Re-architected `/dashboard/limits` quota mapping to render immediately inside chunks, fixing a major UI freezing delay on accounts exceeding 70 active connections (#784)
- **QWEN OAuth Authorization:** Mapped the OIDC `id_token` as the primary API Bearer token for Dashscope requests, fixing immediate 401 Unauthorized errors after connecting accounts or refreshing tokens (#864)
- **ZAI API Stability:** Hardened Server-Sent Events compiler to gracefully fallback to empty strings when DeepSeek providers stream mathematically null content during reasoning phases (#871)
- **Claude Code/Codex Translations:** Protected non-streaming payload conversions against empty responses from upstream Codex tools, avoiding catastrophic TypeErrors (#866)
- **NVIDIA NIM Rendering:** Conditionally stripped identical provider prefixes dynamically pushed by audio models, eliminating duplicate `nim/nim` tag structures throwing 404 on the Media Playground (#872)

### ⚠️ Breaking Changes

- **Request Log Layout:** Removed the old multi-file `DATA_DIR/logs/` request log sessions and the `DATA_DIR/log.txt` summary file. New requests are written as single JSON artifacts in `DATA_DIR/call_logs/YYYY-MM-DD/`.
- **Logging Environment Variables:** Replaced `LOG_*`, `ENABLE_REQUEST_LOGS`, `CALL_LOGS_MAX`, `CALL_LOG_PAYLOAD_MODE`, and `PROXY_LOG_MAX_ENTRIES` with the new `APP_LOG_*` and `CALL_LOG_RETENTION_DAYS` configuration model.
- **Pipeline Toggle Setting:** Replaced the legacy `detailed_logs_enabled` setting with `call_log_pipeline_enabled`. New pipeline details are embedded inside the request artifact instead of being stored as separate `request_detail_logs` records.

### 🛠️ Maintenance

- **Legacy Request Log Upgrade Backup:** Upgrades now archive old `data/logs/`, legacy `data/call_logs/`, and `data/log.txt` layouts into `DATA_DIR/log_archives/*.zip` before removing the deprecated structure.
- **Streaming Usage Persistence:** Streaming requests now write a single `usage_history` row on completion instead of emitting a duplicate in-progress usage row with empty status metadata.
- **Logging Follow-up Cleanup:** Pipeline logs no longer capture `SOURCE REQUEST`, request artifact entries now honor `CALL_LOG_MAX_ENTRIES`, and application log archives now honor `APP_LOG_MAX_FILES`.

---

## [3.4.0] - 2026-03-31

### 🚀 Features

- **Subscription Utilization Analytics:** Added quota snapshot time-series tracking, Provider Utilization and Combo Health tabs with recharts visualizations, and corresponding API endpoints (#847)
- **SQLite Backup Control:** New `ROUTIFORM_DISABLE_AUTO_BACKUP` env flag to disable automatic SQLite backups (#846)
- **Model Registry Update:** Injected `gpt-5.4-mini` into the Codex provider's array of models (#756)
- **Provider Limit Tracking:** Track and display when provider rate limits were last refreshed per account (#843)

### 🐛 Bug Fixes

- **Qwen Auth Routing:** Re-routed Qwen OAuth completions from the DashScope API to the Web Inference API (`chat.qwen.ai`), resolving authorization failures (#844, #807, #832)
- **Qwen Auto-Retry Loop:** Added targeted 429 Quota Exceeded backoff handling inside `chatCore` protecting burst requests
- **Codex OAuth Fallback:** Modern browser popup blocking no longer traps the user; it automatically falls back to manual URL entry (#808)
- **Claude Token Refresh:** Anthropic's strict `application/json` boundaries are now respected during token generation instead of encoded URLs (#836)
- **Codex Messages Schema:** Stripped purist `messages` injects from native passthrough requests to avoid structural rejections from the ChatGPT upstream (#806)
- **CLI Detection Size Limit:** Safely bumped the Node binary scanning upper bound from 100MB to 350MB, allowing heavy standalone tools like Claude Code (229MB) and OpenCode (153MB) to be correctly detected by the VPS runtime (#809)
- **CLI Runtime Environment:** Restored ability for CLI configurations to respect user override paths (`CLI_{PROVIDER}_BIN`) bypassing strict path-bound discovery rules
- **Nvidia Header Conflicts:** Removed `prompt_cache_key` properties from upstream headers when calling non-Anthropic providers (#848)
- **Codex Fast Tier Toggle:** Restored Codex service tier toggle contrast in light mode (#842)
- **Test Infrastructure:** Updated `t28-model-catalog-updates` test that incorrectly expected the outdated DashScope endpoint for the Qwen native registry

---

## [3.3.9] - 2026-03-31

### 🐛 Bug Fixes

- **Custom Provider Rotation:** Integrated `getRotatingApiKey` internally inside DefaultExecutor, ensuring `extraApiKeys` rotation triggers correctly for custom and compatible upstream providers (#815)

---

## [3.3.8] - 2026-03-30

### 🚀 Features

- **Models API Filtering:** Endpoint `/v1/models` now dynamically filters its list based on the permissions tied to the `Authorization: Bearer <token>` when restricted access is on (#781)
- **Qoder Integration:** Native integration for Qoder AI natively replacing the legacy iFlow platform mappings (#660)
- **Prompt Cache Tracking:** Added tracking capabilities and frontend visualization (Stats card) for semantic and prompt caching in the Dashboard UI

### 🐛 Bug Fixes

- **Cache Dashboard Sizing:** Improved the UI layout sizes and context headers for the advanced cache pages (#835)
- **Debug Sidebar Visibility:** Fixed an issue where the debug toggle wouldn't correctly show/hide sidebar debug details (#834)
- **Gemini Model Prefixing:** Modified the namespace fallback to properly route via `gemini-cli/` instead of `gc/` to respect upstream specs (#831)
- **OpenRouter Sync:** Improved compatibility synchronization to automatically ingest the available models catalog correctly from OpenRouter (#830)
- **Streaming Payloads Mapping:** Reserialization of reasoning fields natively resolves conflict alias paths when output is streaming to edge devices

---

## [3.3.7] - 2026-03-30

### 🐛 Bug Fixes

- **OpenCode Config:** Restructured generated `opencode.json` to use the `@ai-sdk/openai-compatible` record-based schema with `options` and `models` as object maps instead of flat arrays, fixing config validation failures (#816)
- **i18n Missing Keys:** Added missing `cloudflaredUrlNotice` translation key across all 30 language files to prevent `MISSING_MESSAGE` console errors in the Endpoint page (#823)

---

## [3.3.6] - 2026-03-30

### 🐛 Bug Fixes

- **Token Accounting:** Included prompt cache tokens safely in historical usage inputs calculations for correct quota deductions (PR #822)
- **Combo Test Probes:** Fixed combo testing logic false negatives by resolving parsing for reasoning-only responses and enabled massive parallelization via Promise.all (PR #828)
- **Docker Quick Tunnels:** Embedded required ca-certificates inside the base runtime container to resolve Cloudflared TLS startup failures, and surfaced stdout network errors replacing generic exit codes (PR #829)

---

## [3.3.5] - 2026-03-30

### ✨ New Features

- **Gemini Quota Tracking:** Added real-time Gemini CLI quota tracking via the `retrieveUserQuota` API (PR #825)
- **Cache Dashboard:** Enhanced the Cache Dashboard to display prompt cache metrics, 24h trends, and estimated cost savings (PR #824)

### 🐛 Bug Fixes

- **User Experience:** Removed invasive auto-opening OAuth modal loops on barren provider detailed pages (PR #820)
- **Dependency Updates:** Bumped and locked down dependencies for development and production trees including Next.js 16.2.1, Recharts, and TailwindCSS 4.2.2 (PR #826, #827)

---

## [3.3.4] - 2026-03-30

### ✨ New Features

- **A2A Workflows:** Added deterministic FSM orchestrator for multi-step agent workflows.
- **Graceful Degradation:** Added a new multi-layer fallback framework to preserve core functionality during partial system outages.
- **Config Audit:** Added an audit trail with diff detection to track changes and enable configuration rollbacks.
- **Provider Health:** Added provider expiration tracking with proactive UI alerts for expiring API keys.
- **Adaptive Routing:** Added an adaptive volume and complexity detector to override routing strategies dynamically based on load.
- **Provider Diversity:** Implemented provider diversity scoring via Shannon entropy to improve load distribution.
- **Auto-Disable Bounds:** Added an Auto-Disable Banned Accounts setting toggle to the Resilience dashboard.

### 🐛 Bug Fixes

- **Codex & Claude Compatibility:** Fixed UI fallbacks, patched Codex non-streaming integration issues, and resolved CLI runtime detection on Windows.
- **Release Automation:** Expanded permissions required for the Electron App build in GitHub Actions.
- **Cloudflare Runtime:** Addressed correct runtime isolation exit codes for Cloudflared tunnel components.

### 🧪 Tests

- **Test Suite Updates:** Expanded test coverage for volume detectors, provider diversity, configuration audit, and FSM.

---

## [3.3.3] - 2026-03-29

### 🐛 Bug Fixes

- **CI/CD Reliability:** Patched GitHub Actions to stable dependency versions (`actions/checkout@v4`, `actions/upload-artifact@v4`) to mitigate unannounced builder environment deprecations.
- **Image Fallbacks:** Replaced arbitrary fallback chains in `ProviderIcon.tsx` with explicit asset validation to prevent UI loading `<Image>` components for files that don't exist, eliminating `404` errors in dashboard console logs (#745).
- **Admin Updater:** Dynamic source-installation detection for the dashboard Updater. Safely disables the `Update Now` button when Routiform is built locally rather than through npm, prompting for `git pull` (#743).
- **Update ERESOLVE Error:** Injected `package.json` overrides for `react`/`react-dom` and enabled `--legacy-peer-deps` within the internal automatic updater scripts to resolve breaking dependency tree conflicts with `@lobehub/ui`.

---

## [3.3.2] - 2026-03-29

### ✨ New Features

- **Cloudflare Tunnels:** Cloudflare Quick Tunnel integration with dashboard controls (PR #772).
- **Diagnostics:** Semantic cache bypass for combo live tests (PR #773).

### 🐛 Bug Fixes

- **Streaming Stability:** Apply `FETCH_TIMEOUT_MS` to streaming requests' initial `fetch()` call to prevent 300s Node.js TCP timeout causing silent task failures (#769).
- **i18n:** Add missing `windsurf` and `copilot` entries to `toolDescriptions` across all 33 locale files (#748).
- **GLM Coding Audit:** Complete provider audit fixing ReDoS vulnerabilities, context window sizing (128k/16k), and model registry syncing (PR #778).

---

## [3.3.1] - 2026-03-29

### 🐛 Bug Fixes

- **OpenAI Codex:** Fallback processing fix for `type: "text"` elements carrying null or empty datasets that caused 400 rejection (#742).
- **Opencode:** Update schema alignment to singular `provider` to match official spec (#774).
- **Gemini CLI:** Inject missing end-user quota headers preventing 403 authorization lockouts (#775).
- **DB Recovery:** Refactor multipart payload imports into raw binary buffered arrays to bypass reverse proxy max body limits (#770).

---

## [3.3.0] - 2026-03-29

### ✨ Enhancements & Refactoring

- **Release Stabilization** — Finalized v3.2.9 release (combo diagnostics, quality gates, Gemini tool fix) and created missing git tag. Consolidated all staged changes into a single atomic release commit.

### 🐛 Bug Fixes

- **Auto-Update Test** — Fixed `buildDockerComposeUpdateScript` test assertion to match unexpanded shell variable references (`$TARGET_TAG`, `${TARGET_TAG#v}`) in the generated deploy script, aligning with the refactored template from v3.2.8.
- **Circuit Breaker Test** — Hardened `combo-circuit-breaker.test.mjs` by injecting `maxRetries: 0` to prevent retry inflation from skewing failure count assertions during breaker state transitions.

---

## [3.2.9] - 2026-03-29

### ✨ Enhancements & Refactoring

- **Combo Diagnostics** — Introduced a live test bypass flag (`forceLiveComboTest`) allowing administrators to execute real upstream health checks that bypass all local circuit-breaker and cooldown state mechanisms, enabling precise diagnostics during rolling outages (PR #759)
- **Quality Gates** — Added automated response quality validation for combos and officially integrated `claude-4.6` model support into the core routing schemas (PR #762)

### 🐛 Bug Fixes

- **Tool Definition Validation** — Repaired Gemini API integration by normalizing enum types inside tool definitions, preventing upstream HTTP 400 parameter errors (PR #760)

---

## [3.2.8] - 2026-03-29

### ✨ Enhancements & Refactoring

- **Docker Auto-Update UI** — Integrated a detached background update process for Docker Compose deployments. The Dashboard UI now seamlessly tracks update lifecycle events combining JSON REST responses with SSE streaming progress overlays for robust cross-environment reliability.
- **Cache Analytics** — Repaired zero-metrics visualization mapping by migrating Semantic Cache telemetry logs directly into the centralized tracking SQLite module.

### 🐛 Bug Fixes

- **Authentication Logic** — Fixed a bug where saving dashboard settings or adding models failed with a 401 Unauthorized error when `requireLogin` was disabled. API endpoints now correctly evaluate the global authentication toggle. Resolved global redirection by reactivating `src/middleware.ts`.
- **CLI Tool Detection (Windows)** — Prevented fatal initialization exceptions during CLI environment detection by catching `cross-spawn` ENOENT errors correctly. Adds explicit detection paths for `\AppData\Local\droid\droid.exe`.
- **Codex Native Passthrough** — Normalized model translation parameters preventing context poisoning in proxy pass-through mode, enforcing generic `store: false` constraints explicitly for all Codex-originated requests.
- **SSE Token Reporting** — Normalized provider tool-call chunk `finish_reason` detection, fixing 0% Usage analytics for stream-only responses missing strict `<DONE>` indicators.
- **DeepSeek <think> Tags** — Implemented an explicit `<think>` extraction mapping inside `responsesHandler.ts`, ensuring DeepSeek reasoning streams map equivalently to native Anthropic `<thinking>` structures.

---

## [3.2.7] - 2026-03-29

### Fixed

- **Seamless UI Updates**: The "Update Now" feature on the Dashboard now provides live, transparent feedback using Server-Sent Events (SSE). It performs package installation, native module rebuilds (better-sqlite3), and PM2 restarts reliably while showing real-time loaders instead of silently hanging.

---

## [3.2.6] — 2026-03-29

### ✨ Enhancements & Refactoring

- **API Key Reveal (#740)** — Added a scoped API key copy flow in the Api Manager, protected by the `ALLOW_API_KEY_REVEAL` environment variable.
- **Sidebar Visibility Controls (#739)** — Admins can now hide any sidebar navigation link via the Appearance settings to reduce visual clutter.
- **Strict Combo Testing (#735)** — Hardened the combo health check endpoint to require live text responses from models instead of just soft reachability signals.
- **Streamed Detailed Logs (#734)** — Switched detailed request logging for SSE streams to reconstruct the final payload, saving immense amounts of SQLite database size and significantly cleaning up the UI.

### 🐛 Bug Fixes

- **OpenCode Go MiniMax Auth (#733)** — Corrected the authentication header logic for `minimax` models on OpenCode Go to use `x-api-key` instead of standard bearer tokens across the `/messages` protocol.

---

## [3.2.5] — 2026-03-29

### ✨ Enhancements & Refactoring

- **Void Linux Deployment Support (#732)** — Integrated `xbps-src` packaging template and instructions to natively compile and install Routiform with `better-sqlite3` bindings via cross-compilation target.

## [3.2.4] — 2026-03-29

### ✨ Enhancements & Refactoring

- **Qoder AI Migration (#660)** — Completely migrated the legacy `iFlow` core provider onto `Qoder AI` maintaining stable API routing capabilities.

### 🐛 Bug Fixes

- **Gemini Tools HTTP 400 Payload Invalid Argument (#731)** — Prevented `thoughtSignature` array injections inside standard Gemini `functionCall` sequences blocking agentic routing flows.

---

## [3.2.3] — 2026-03-29

### ✨ Enhancements & Refactoring

- **Provider Limits Quota UI (#728)** — Normalized quota limit logic and data labeling inside the Limits interface.

### 🐛 Bug Fixes

- **Core Routing Schemas & Leaks** — Expanded `comboStrategySchema` to natively support `fill-first` and `p2c` strategies to unblock complex combo editing natively.
- **Thinking Tags Extraction (CLI)** — Restructured CLI token responses sanitizer RegEx capturing model reasoning structures inside streams avoiding broken `<thinking>` extractions breaking response text output format.
- **Strict Format Enforcements** — Hardened pipeline sanitization execution making it universally apply to translation mode targets.

---

## [3.2.2] — 2026-03-29

### ✨ New Features

- **Four-Stage Request Log Pipeline (#705)** — Refactored log persistence to save comprehensive payloads at four distinct pipeline stages: Client Request, Translated Provider Request, Provider Response, and Translated Client Response. Introduced `streamPayloadCollector` for robust SSE stream truncation and payload serialization.

### 🐛 Bug Fixes

- **Mobile UI Fixes (#659)** — Prevented table components on the dashboard from breaking the layout on narrow viewports by adding proper horizontal scrolling and overflow containment to `DashboardLayout`.
- **Claude Prompt Cache Fixes (#708)** — Ensured `cache_control` blocks in Claude-to-Claude fallback loops are faithfully preserved and passed safely back to Anthropic models.
- **Gemini Tool Definitions (#725)** — Fixed schema translation errors when declaring simple `object` parameter types for Gemini function calling.

## [3.2.1] — 2026-03-29

### ✨ New Features

- **Global Fallback Provider (#689)** — When all combo models are exhausted (502/503), Routiform now attempts a configurable global fallback model before returning the error. Set `globalFallbackModel` in settings to enable.

### 🐛 Bug Fixes

- **Fix #721** — Fixed context pinning bypass during tool-call responses. Non-streaming tagging used wrong JSON path (`json.messages` → `json.choices[0].message`). Streaming injection now triggers on `finish_reason` chunks for tool-call-only streams. `injectModelTag()` now appends synthetic pin messages for non-string content.
- **Fix #709** — Confirmed already fixed (v3.1.9) — `system-info.mjs` creates directories recursively. Closed.
- **Fix #707** — Confirmed already fixed (v3.1.9) — empty tool name sanitization in `chatCore.ts`. Closed.

### 🧪 Tests

- Added 6 unit tests for context pinning with tool-call responses (null content, array content, roundtrip, re-injection)

## [3.2.0] — 2026-03-28

### ✨ New Features

- **Cache Management UI** — Added a dedicated semantic caching dashboard at \`/dashboard/cache\` with targeted API invalidation and 31-language i18n support (PR #701 by @oyi77)
- **GLM Quota Tracking** — Added real-time usage and session quota tracking for the GLM Coding (Z.AI) provider (PR #698 by @christopher-s)
- **Detailed Log Payloads** — Wired full four-stage pipeline payload capturing (original, translated, provider-response, streamed-deltas) directly into the UI (PR #705 by @rdself)

### 🐛 Bug Fixes

- **Fix #708** — Prevented token bleeding for Claude Code users routing through Routiform by correctly preserving native \`cache_control\` headers during Claude-to-Claude passthrough (PR #708 by @tombii)
- **Fix #719** — Setup internal auth boundaries for \`ModelSyncScheduler\` to prevent unauthenticated daemon failures on startup (PR #719 by @rdself)
- **Fix #718** — Rebuilt badge rendering in Provider Limits UI preventing bad quota boundaries overlap (PR #718 by @rdself)
- **Fix #704** — Fixed Combo Fallbacks breaking on HTTP 400 content-policy errors preventing model-rotation dead-routing (PR #704 by @rdself)

### 🔒 Security & Dependencies

- Bumped \`path-to-regexp\` to \`8.4.0\` resolving dependabot vulnerabilities (PR #715)

## [3.1.10] — 2026-03-28

### 🐛 Bug Fixes

- **Fix #706** — Fixed icon fallback rendering caused by Tailwind V4 `font-sans` override by applying `!important` to `.material-symbols-outlined`.
- **Fix #703** — Fixed GitHub Copilot broken streams by enabling `responses` to `openai` format translation for any custom models leveraging `apiFormat: "responses"`.
- **Fix #702** — Replaced flat-rate usage tracking with accurate DB pricing calculations for both streaming and non-streaming responses.
- **Fix #716** — Cleaned up Claude tool-call translation state, correctly parsing streaming arguments and preventing OpenAI `tool_calls` chunks from repeating the `id` field.

## [3.1.9] — 2026-03-28

### ✨ New Features

- **Schema Coercion** — Auto-coerce string-encoded numeric JSON Schema constraints (e.g. `"minimum": "1"`) to proper types, preventing 400 errors from Cursor, Cline, and other clients sending malformed tool schemas.
- **Tool Description Sanitization** — Ensure tool descriptions are always strings; converts `null`, `undefined`, or numeric descriptions to empty strings before sending to providers.
- **Clear All Models Button** — Added i18n translations for the "Clear All Models" provider action across all 30 languages.
- **Codex Auth Export** — Added Codex `auth.json` export and apply-local buttons for seamless CLI integration.
- **Windsurf BYOK Notes** — Added official limitation warnings to the Windsurf CLI tool card documenting BYOK constraints.

### 🐛 Bug Fixes

- **Fix #709** — `system-info.mjs` no longer crashes when the output directory doesn't exist (added `mkdirSync` with recursive flag).
- **Fix #710** — A2A `TaskManager` singleton now uses `globalThis` to prevent state leakage across Next.js API route recompilations in dev mode. E2E test suite updated to handle 401 gracefully.
- **Fix #711** — Added provider-specific `max_tokens` cap enforcement for upstream requests.
- **Fix #605 / #592** — Strip `proxy_` prefix from tool names in non-streaming Claude responses; fixed LongCat validation URL.
- **Call Logs Max Cap** — Upgraded `getMaxCallLogs()` with caching layer, env var support (`CALL_LOGS_MAX`), and DB settings integration.

### 🧪 Tests

- Test suite expanded from 964 → 1027 tests (63 new tests)
- Added `schema-coercion.test.mjs` — 9 tests for numeric field coercion and tool description sanitization
- Added `t40-opencode-cli-tools-integration.test.mjs` — OpenCode/Windsurf CLI integration tests
- Enhanced feature-tests branch with comprehensive coverage tooling

### 📁 New Files

| File                                                     | Purpose                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `open-sse/translator/helpers/schemaCoercion.ts`          | Schema coercion and tool description sanitization utilities |
| `tests/unit/schema-coercion.test.mjs`                    | Unit tests for schema coercion                              |
| `tests/unit/t40-opencode-cli-tools-integration.test.mjs` | CLI tool integration tests                                  |
| `COVERAGE_PLAN.md`                                       | Test coverage planning document                             |

### 🐛 Bug Fixes

- **Claude Prompt Caching Passthrough** — Fixed cache_control markers being stripped in Claude passthrough mode (Claude → Routiform → Claude), which caused Claude Code users to deplete their Anthropic API quota 5-10x faster than direct connections. Routiform now preserves client's cache_control markers when sourceFormat and targetFormat are both Claude, ensuring prompt caching works correctly and dramatically reducing token consumption.

## [3.1.8] - 2026-03-27

### 🐛 Bug Fixes & Features

- **Platform Core:** Implemented global state handling for Hidden Models & Combos preventing them from cluttering the catalog or leaking into connected MCP agents (#681).
- **Stability:** Patched streaming crashes related to the native Antigravity provider integration failing due to unhandled undefined state arrays (#684).
- **Localization Sync:** Deployed a fully overhauled `i18n` synchronizer detecting missing nested JSON properties and retro-fitting 30 locales sequentially (#685).## [3.1.7] - 2026-03-27

### 🐛 Bug Fixes

- **Streaming Stability:** Fixed `hasValuableContent` returning `undefined` for empty chunks in SSE streams (#676).
- **Tool Calling:** Fixed an issue in `sseParser.ts` where non-streaming Claude responses with multiple tool calls dropped the `id` of subsequent tool calls due to incorrect index-based deduplication (#671).

---

## [3.1.6] — 2026-03-27

### 🐛 Bug Fixes

- **Claude Native Tool Name Restoration** — Tool names like `TodoWrite` are no longer prefixed with `proxy_` in Claude passthrough responses (both streaming and non-streaming). Includes unit test coverage (PR #663 by @coobabm)
- **Clear All Models Alias Cleanup** — "Clear All Models" button now also removes associated model aliases, preventing ghost models in the UI (PR #664 by @rdself)

---

## [3.1.5] — 2026-03-27

### 🐛 Bug Fixes

- **Backoff Auto-Decay** — Rate-limited accounts now auto-recover when their cooldown window expires, fixing a deadlock where high `backoffLevel` permanently deprioritized accounts (PR #657 by @brendandebeasi)

### 🌍 i18n

- **Chinese translation overhaul** — Comprehensive rewrite of `zh-CN.json` with improved accuracy (PR #658 by @only4copilot)

---

## [3.1.4] — 2026-03-27

### 🐛 Bug Fixes

- **Streaming Override Fix** — Explicit `stream: true` in request body now takes priority over `Accept: application/json` header. Clients sending both will correctly receive SSE streaming responses (#656)

### 🌍 i18n

- **Czech string improvements** — Refined terminology across `cs.json` (PR #655 by @zen0bit)

---

## [3.1.3] — 2026-03-26

### 🌍 i18n & Community

- **~70 missing translation keys** added to `en.json` and 12 languages (PR #652 by @zen0bit)
- **Czech documentation updated** — CLI-TOOLS, API_REFERENCE, VM_DEPLOYMENT guides (PR #652)
- **Translation validation scripts** — `check_translations.py` and `validate_translation.py` for CI/QA (PR #651 by @zen0bit)

---

## [3.1.2] — 2026-03-26

### 🐛 Bug Fixes

- **Critical: Tool Calling Regression** — Fixed `proxy_Bash` errors by disabling the `proxy_` tool name prefix in the Claude passthrough path. Tools like `Bash`, `Read`, `Write` were being renamed to `proxy_Bash`, `proxy_Read`, etc., causing Claude to reject them (#618)
- **Kiro Account Ban Documentation** — Documented as upstream AWS anti-fraud false positive, not an Routiform issue (#649)

### 🧪 Tests

- **936 tests, 0 failures**

---

## [3.1.1] — 2026-03-26

### ✨ New Features

- **Vision Capability Metadata**: Added `capabilities.vision`, `input_modalities`, and `output_modalities` to `/v1/models` entries for vision-capable models (PR #646)
- **Gemini 3.1 Models**: Added `gemini-3.1-pro-preview` and `gemini-3.1-flash-lite-preview` to the Antigravity provider (#645)

### 🐛 Bug Fixes

- **Ollama Cloud 401 Error**: Fixed incorrect API base URL — changed from `api.ollama.com` to official `ollama.com/v1/chat/completions` (#643)
- **Expired Token Retry**: Added bounded retry with exponential backoff (5→10→20 min) for expired OAuth connections instead of permanently skipping them (PR #647)

### 🧪 Tests

- **936 tests, 0 failures**

---

## [3.1.0] — 2026-03-26

### ✨ New Features

- **GitHub Issue Templates**: Added standardized bug report, feature request, and config/proxy issue templates (#641)
- **Clear All Models**: Added a "Clear All Models" button to the provider detail page with i18n support in 29 languages (#634)

### 🐛 Bug Fixes

- **Locale Conflict (`in.json`)**: Renamed the Hindi locale file from `in.json` (Indonesian ISO code) to `hi.json` to fix translation conflicts in Weblate (#642)
- **Codex Empty Tool Names**: Moved tool name sanitization before the native Codex passthrough, fixing 400 errors from upstream providers when tools had empty names (#637)
- **Streaming Newline Artifacts**: Added `collapseExcessiveNewlines` to the response sanitizer, collapsing runs of 3+ consecutive newlines from thinking models into a standard double newline (#638)
- **Claude Reasoning Effort**: Converted OpenAI `reasoning_effort` param to Claude's native `thinking` budget block across all request paths, including automatic `max_tokens` adjustment (#627)
- **Qwen Token Refresh**: Implemented proactive pre-expiry OAuth token refreshes (5-minute buffer) to prevent requests from failing when using short-lived tokens (#631)

### 🧪 Tests

- **936 tests, 0 failures** (+10 tests since 3.0.9)

---

## [3.0.9] — 2026-03-26

### 🐛 Bug Fixes

- **NaN tokens in Claude Code / client responses (#617):**
  - `sanitizeUsage()` now cross-maps `input_tokens`→`prompt_tokens` and `output_tokens`→`completion_tokens` before the whitelist filter, fixing responses showing NaN/0 token counts when providers return Claude-style usage field names

### 🔒 Security

- Updated `yaml` package to fix stack overflow vulnerability (GHSA-48c2-rrv3-qjmp)

### 📋 Issue Triage

- Closed #613 (Codestral — resolved with Custom Provider workaround)
- Commented on #615 (OpenCode dual-endpoint — workaround provided, tracked as feature request)
- Commented on #618 (tool call visibility — requesting v3.0.9 test)
- Commented on #627 (effort level — already supported)

---

## [3.0.8] — 2026-03-25

### 🐛 Bug Fixes

- **Translation Failures for OpenAI-format Providers in Claude CLI (#632):**
  - Handle `reasoning_details[]` array format from StepFun/OpenRouter — converts to `reasoning_content`
  - Handle `reasoning` field alias from some providers → normalized to `reasoning_content`
  - Cross-map usage field names: `input_tokens`↔`prompt_tokens`, `output_tokens`↔`completion_tokens` in `filterUsageForFormat`
  - Fix `extractUsage` to accept both `input_tokens`/`output_tokens` and `prompt_tokens`/`completion_tokens` as valid usage fields
  - Applied to both streaming (`sanitizeStreamingChunk`, `openai-to-claude.ts` translator) and non-streaming (`sanitizeMessage`) paths

---

## [3.0.7] — 2026-03-25

### 🐛 Bug Fixes

- **Antigravity Token Refresh:** Fixed `client_secret is missing` error for npm-installed users — the `clientSecretDefault` was empty in providerRegistry, causing Google to reject token refresh requests (#588)
- **OpenCode Zen Models:** Added `modelsUrl` to the OpenCode Zen registry entry so "Import from /models" works correctly (#612)
- **Streaming Artifacts:** Fixed excessive newlines left in responses after thinking-tag signature stripping (#626)
- **Proxy Fallback:** Added automatic retry without proxy when SOCKS5 relay fails
- **Proxy Test:** Test endpoint now resolves real credentials from DB via proxyId

### ✨ New Features

- **Playground Account/Key Selector:** Persistent, always-visible dropdown to select specific provider accounts/keys for testing — fetches all connections at startup and filters by selected provider
- **CLI Tools Dynamic Models:** Model selection now dynamically fetches from `/v1/models` API — providers like Kiro now show their full model catalog
- **Antigravity Model List:** Updated with Claude Sonnet 4.5, Claude Sonnet 4, GPT 5, GPT 5 Mini; enabled `passthroughModels` for dynamic model access (#628)

### 🔧 Maintenance

- Merged PR #625 — Provider Limits light mode background fix

---

## [3.0.6] — 2026-03-25

### 🐛 Bug Fixes

- **Limits/Proxy:** Fixed Codex limit fetching for accounts behind SOCKS5 proxies — token refresh now runs inside proxy context
- **CI:** Fixed integration test `v1/models` assertion failure in CI environments without provider connections
- **Settings:** Proxy test button now shows success/failure results immediately (previously hidden behind health data)

### ✨ New Features

- **Playground:** Added Account selector dropdown — test specific connections individually when a provider has multiple accounts

### 🔧 Maintenance

- Merged PR #623 — LongCat API base URL path correction

---

## [3.0.5] — 2026-03-25

### ✨ New Features

- **Limits UI:** Added tag grouping feature to the connections dashboard to improve visual organization for accounts with custom tags.

---

## [3.0.4] — 2026-03-25

### 🐛 Bug Fixes

- **Streaming:** Fixed `TextDecoder` state corruption inside combo `sanitize` TransformStream which caused SSE garbled output matching multibyte characters (PR #614)
- **Providers UI:** Safely render HTML tags inside provider connection error tooltips using `dangerouslySetInnerHTML`
- **Proxy Settings:** Added missing `username` and `password` payload body properties allowing authenticated proxies to be successfully verified from the Dashboard.
- **Provider API:** Bound soft exception returns to `getCodexUsage` preventing API HTTP 500 failures when token fetch fails

---

## [3.0.3] — 2026-03-25

### ✨ New Features

- **Auto-Sync Models:** Added a UI toggle and `sync-models` endpoint to automatically synchronise model lists per provider using a scheduled interval scheduler (PR #597)

### 🐛 Bug Fixes

- **Timeouts:** Elevated default proxies `FETCH_TIMEOUT_MS` and `STREAM_IDLE_TIMEOUT_MS` to 10 minutes to properly support deep reasoning models (like o1) without aborting requests (Fixes #609)
- **CLI Tool Detection:** Improved cross-platform detection handling NVM paths, Windows `PATHEXT` (preventing `.cmd` wrappers issue), and custom NPM prefixes (PR #598)
- **Streaming Logs:** Implemented `tool_calls` delta accumulation in streaming response logs so function calls are tracked and persisted accurately in DB (PR #603)
- **Model Catalog:** Removed auth exemption, properly hiding `comfyui` and `sdwebui` models when no provider is explicitly configured (PR #599)

### 🌐 Translations

- **cs:** Improved Czech translation strings across the app (PR #601)

## [3.0.2] — 2026-03-25

### 🚀 Enhancements & Features

#### feat(ui): Connection Tag Grouping

- Added a Tag/Group field to `EditConnectionModal` (stored in `providerSpecificData.tag`) without requiring DB schema migrations.
- Connections in the provider view now dynamically group by tag with visual dividers.
- Untagged connections appear first without a header, followed by tagged groups in alphabetical order.
- The tag grouping automatically applies to the Codex/Copilot/Antigravity Limits section since toggles exist inside connection rows.

### 🐛 Bug Fixes

#### fix(ui): Proxy Management UI Stabilization

- **Missing badges on connection cards:** Fixed by using `resolveProxyForConnection()` rather than static mapping.
- **Test Connection disabled in saved mode:** Enabled the Test button by resolving proxy config from the saved list.
- **Config Modal freezing:** Added `onClose()` calls after save/clear to prevent the UI from freezing.
- **Double usage counting:** `ProxyRegistryManager` now loads usage eagerly on mount with deduplication by `scope` + `scopeId`. Usage counts were replaced with a Test button displaying IP/latency inline.

#### fix(translator): `function_call` prefix stripping

- Repaired an incomplete fix from PR #607 where only `tool_use` blocks stripped Claude's `proxy_` tool prefix. Now, clients using the OpenAI Responses API format will also correctly receive tool tools without the `proxy_` prefix.

---

## [3.0.1] — 2026-03-25

### 🔧 Hotfix Patch — Critical Bug Fixes

Three critical regressions reported by users after the v3.0.0 launch have been resolved.

#### fix(translator): strip `proxy_` prefix in non-streaming Claude responses (#605)

The `proxy_` prefix added by Claude OAuth was only stripped from **streaming** responses. In **non-streaming** mode, `translateNonStreamingResponse` had no access to the `toolNameMap`, causing clients to receive mangled tool names like `proxy_read_file` instead of `read_file`.

**Fix:** Added optional `toolNameMap` parameter to `translateNonStreamingResponse` and applied prefix stripping in the Claude `tool_use` block handler. `chatCore.ts` now passes the map through.

#### fix(validation): add LongCat specialty validator to skip /models probe (#592)

LongCat AI does not expose `GET /v1/models`. The generic `validateOpenAICompatibleProvider` validator fell through to a chat-completions fallback only if `validationModelId` was set, which LongCat doesn't configure. This caused provider validation to fail with a misleading error on add/save.

**Fix:** Added `longcat` to the specialty validators map, probing `/chat/completions` directly and treating any non-auth response as a pass.

#### fix(translator): normalize object tool schemas for Anthropic (#595)

MCP tools (e.g. `pencil`, `computer_use`) forward tool definitions with `{type:"object"}` but without a `properties` field. Anthropic's API rejects these with: `object schema missing properties`.

**Fix:** In `openai-to-claude.ts`, inject `properties: {}` as a safe default when `type` is `"object"` and `properties` is absent.

---

### 🔀 Community PRs Merged (2)

| PR       | Author  | Summary                                                                    |
| -------- | ------- | -------------------------------------------------------------------------- |
| **#589** | @flobo3 | docs(i18n): fix Russian translation for Playground and Testbed             |
| **#591** | @rdself | fix(ui): improve Provider Limits light mode contrast and plan tier display |

---

### ✅ Issues Resolved

`#592` `#595` `#605`

---

### 🧪 Tests

- **926 tests, 0 failures** (unchanged from v3.0.0)

---

## [3.0.0] — 2026-03-24

### 🎉 Routiform v3.0.0 — The Free AI Gateway, Now with 67+ Providers

> **The biggest release ever.** From 36 providers in v2.9.5 to **67+ providers** in v3.0.0 — with MCP Server, A2A Protocol, auto-combo engine, Provider Icons, Registered Keys API, 926 tests, and contributions from **12 community members** across **10 merged PRs**.
>
> Consolidated from v3.0.0-rc.1 through rc.17 (17 release candidates over 3 days of intense development).

---

### 🆕 New Providers (+31 since v2.9.5)

| Provider                      | Alias           | Tier        | Notes                                                                       |
| ----------------------------- | --------------- | ----------- | --------------------------------------------------------------------------- |
| **OpenCode Zen**              | `opencode-zen`  | Free        | 3 models via `opencode.ai/zen/v1` (PR #530 by @kang-heewon)                 |
| **OpenCode Go**               | `opencode-go`   | Paid        | 4 models via `opencode.ai/zen/go/v1` (PR #530 by @kang-heewon)              |
| **LongCat AI**                | `lc`            | Free        | 50M tokens/day (Flash-Lite) + 500K/day (Chat/Thinking) during public beta   |
| **Pollinations AI**           | `pol`           | Free        | No API key needed — GPT-5, Claude, Gemini, DeepSeek V3, Llama 4 (1 req/15s) |
| **Cloudflare Workers AI**     | `cf`            | Free        | 10K Neurons/day — ~150 LLM responses or 500s Whisper audio, edge inference  |
| **Scaleway AI**               | `scw`           | Free        | 1M free tokens for new accounts — EU/GDPR compliant (Paris)                 |
| **AI/ML API**                 | `aiml`          | Free        | $0.025/day free credits — 200+ models via single endpoint                   |
| **Puter AI**                  | `pu`            | Free        | 500+ models (GPT-5, Claude Opus 4, Gemini 3 Pro, Grok 4, DeepSeek V3)       |
| **Alibaba Cloud (DashScope)** | `ali`           | Paid        | International + China endpoints via `alicode`/`alicode-intl`                |
| **Alibaba Coding Plan**       | `bcp`           | Paid        | Alibaba Model Studio with Anthropic-compatible API                          |
| **Kimi Coding (API Key)**     | `kmca`          | Paid        | Dedicated API-key-based Kimi access (separate from OAuth)                   |
| **MiniMax Coding**            | `minimax`       | Paid        | International endpoint                                                      |
| **MiniMax (China)**           | `minimax-cn`    | Paid        | China-specific endpoint                                                     |
| **Z.AI (GLM-5)**              | `zai`           | Paid        | Zhipu AI next-gen GLM models                                                |
| **Vertex AI**                 | `vertex`        | Paid        | Google Cloud — Service Account JSON or OAuth access_token                   |
| **Ollama Cloud**              | `ollamacloud`   | Paid        | Ollama's hosted API service                                                 |
| **Synthetic**                 | `synthetic`     | Paid        | Passthrough models gateway                                                  |
| **Kilo Gateway**              | `kg`            | Paid        | Passthrough models gateway                                                  |
| **Perplexity Search**         | `pplx-search`   | Paid        | Dedicated search-grounded endpoint                                          |
| **Serper Search**             | `serper-search` | Paid        | Web search API integration                                                  |
| **Brave Search**              | `brave-search`  | Paid        | Brave Search API integration                                                |
| **Exa Search**                | `exa-search`    | Paid        | Neural search API integration                                               |
| **Tavily Search**             | `tavily-search` | Paid        | AI search API integration                                                   |
| **NanoBanana**                | `nb`            | Paid        | Image generation API                                                        |
| **ElevenLabs**                | `el`            | Paid        | Text-to-speech voice synthesis                                              |
| **Cartesia**                  | `cartesia`      | Paid        | Ultra-fast TTS voice synthesis                                              |
| **PlayHT**                    | `playht`        | Paid        | Voice cloning and TTS                                                       |
| **Inworld**                   | `inworld`       | Paid        | AI character voice chat                                                     |
| **SD WebUI**                  | `sdwebui`       | Self-hosted | Stable Diffusion local image generation                                     |
| **ComfyUI**                   | `comfyui`       | Self-hosted | ComfyUI local workflow node-based generation                                |
| **GLM Coding**                | `glm`           | Paid        | BigModel/Zhipu coding-specific endpoint                                     |

**Total: 67+ providers** (4 Free, 8 OAuth, 55 API Key) + unlimited OpenAI/Anthropic-Compatible custom providers.

---

### ✨ Major Features

#### 🔑 Registered Keys Provisioning API (#464)

Auto-generate and issue Routiform API keys programmatically with per-provider and per-account quota enforcement.

| Endpoint                        | Method       | Description                                      |
| ------------------------------- | ------------ | ------------------------------------------------ |
| `/api/v1/registered-keys`       | `POST`       | Issue a new key — raw key returned **once only** |
| `/api/v1/registered-keys`       | `GET`        | List registered keys (masked)                    |
| `/api/v1/registered-keys/{id}`  | `GET/DELETE` | Get metadata / Revoke                            |
| `/api/v1/quotas/check`          | `GET`        | Pre-validate quota before issuing                |
| `/api/v1/providers/{id}/limits` | `GET/PUT`    | Configure per-provider issuance limits           |
| `/api/v1/accounts/{id}/limits`  | `GET/PUT`    | Configure per-account issuance limits            |
| `/api/v1/issues/report`         | `POST`       | Report quota events to GitHub Issues             |

**Security:** Keys stored as SHA-256 hashes. Raw key shown once on creation, never retrievable again.

#### 🎨 Provider Icons via @lobehub/icons (#529)

130+ provider logos using `@lobehub/icons` React components (SVG). Fallback chain: **Lobehub SVG → existing PNG → generic icon**. Applied across Dashboard, Providers, and Agents pages with standardized `ProviderIcon` component.

#### 🔄 Model Auto-Sync Scheduler (#488)

Auto-refreshes model lists for connected providers every **24 hours**. Runs on server startup. Configurable via `MODEL_SYNC_INTERVAL_HOURS`.

#### 🔀 Per-Model Combo Routing (#563)

Map model name patterns (glob) to specific combos for automatic routing:

- `claude-sonnet*` → code-combo, `gpt-4o*` → openai-combo, `gemini-*` → google-combo
- New `model_combo_mappings` table with glob-to-regex matching
- Dashboard UI section: "Model Routing Rules" with inline add/edit/toggle/delete

#### 🧭 API Endpoints Dashboard

Interactive catalog, webhooks management, OpenAPI viewer — all in one tabbed page at `/dashboard/endpoint`.

#### 🔍 Web Search Providers

5 new search provider integrations: **Perplexity Search**, **Serper**, **Brave Search**, **Exa**, **Tavily** — enabling grounded AI responses with real-time web data.

#### 📊 Search Analytics

New tab in `/dashboard/analytics` — provider breakdown, cache hit rate, cost tracking. API: `GET /api/v1/search/analytics`.

#### 🛡️ Per-API-Key Rate Limits (#452)

`max_requests_per_day` and `max_requests_per_minute` columns with in-memory sliding-window enforcement returning HTTP 429.

#### 🎵 Media Playground

Full media generation playground at `/dashboard/media`: Image Generation, Video, Music, Audio Transcription (2GB upload limit), and Text-to-Speech.

---

### 🔒 Security & CI/CD

- **CodeQL remediation** — Fixed 10+ alerts: 6 polynomial-redos, 1 insecure-randomness (`Math.random()` → `crypto.randomUUID()`), 1 shell-command-injection
- **Route validation** — Zod schemas + `validateBody()` on **176/176 API routes** — CI enforced
- **CVE fix** — dompurify XSS vulnerability (GHSA-v2wj-7wpq-c8vv) resolved via npm overrides
- **Flatted** — Bumped 3.3.3 → 3.4.2 (CWE-1321 prototype pollution)
- **Docker** — Upgraded `docker/setup-buildx-action` v3 → v4

---

### 🐛 Bug Fixes (40+)

#### OAuth & Auth

- **#537** — Gemini CLI OAuth: clear actionable error when `GEMINI_OAUTH_CLIENT_SECRET` missing in Docker
- **#549** — CLI settings routes now resolve real API key from `keyId` (not masked strings)
- **#574** — Login no longer freezes after skipping wizard password setup
- **#506** — Cross-platform `machineId` rewritten (Windows REG.exe → macOS ioreg → Linux → hostname fallback)

#### Providers & Routing

- **#536** — LongCat AI: fixed `baseUrl` and `authHeader`
- **#535** — Pinned model override: `body.model` correctly set to `pinnedModel`
- **#570** — Unprefixed Claude models now resolve to Anthropic provider
- **#585** — `<omniModel>` internal tags no longer leak to clients in SSE streaming
- **#493** — Custom provider model naming no longer mangled by prefix stripping
- **#490** — Streaming + context cache protection via `TransformStream` injection
- **#511** — `<omniModel>` tag injected into first content chunk (not after `[DONE]`)

#### CLI & Tools

- **#527** — Claude Code + Codex loop: `tool_result` blocks now converted to text
- **#524** — OpenCode config saved correctly (XDG_CONFIG_HOME, TOML format)
- **#522** — API Manager: removed misleading "Copy masked key" button
- **#546** — `--version` returning `unknown` on Windows (PR by @k0valik)
- **#544** — Secure CLI tool detection via known installation paths (PR by @k0valik)
- **#510** — Windows MSYS2/Git-Bash paths normalized automatically
- **#492** — CLI detects `mise`/`nvm`-managed Node when `app/server.js` missing

#### Streaming & SSE

- **PR #587** — Revert `resolveDataDir` import in responsesTransformer for Cloudflare Workers compat (@k0valik)
- **PR #495** — Bottleneck 429 infinite wait: drop waiting jobs on rate limit (@xandr0s)
- **#483** — Stop trailing `data: null` after `[DONE]` signal
- **#473** — Zombie SSE streams: timeout reduced 300s → 120s for faster fallback

#### Media & Transcription

- **Transcription** — Deepgram `video/mp4` → `audio/mp4` MIME mapping, auto language detection, punctuation
- **TTS** — `[object Object]` error display fixed for ElevenLabs-style nested errors
- **Upload limits** — Media transcription increased to 2GB (nginx `client_max_body_size 2g` + `maxDuration=300`)

---

### 🔧 Infrastructure & Improvements

#### Sub2api Gap Analysis (T01–T15 + T23–T42)

- **T01** — `requested_model` column in call logs (migration 009)
- **T02** — Strip empty text blocks from nested `tool_result.content`
- **T03** — Parse `x-codex-5h-*` / `x-codex-7d-*` quota headers
- **T04** — `X-Session-Id` header for external sticky routing
- **T05** — Rate-limit DB persistence with dedicated API
- **T06** — Account deactivated → permanent block (1-year cooldown)
- **T07** — X-Forwarded-For IP validation (`extractClientIp()`)
- **T08** — Per-API-key session limits with sliding-window enforcement
- **T09** — Codex vs Spark rate-limit scopes (separate pools)
- **T10** — Credits exhausted → distinct 1h cooldown fallback
- **T11** — `max` reasoning effort → 131072 budget tokens
- **T12** — MiniMax M2.7 pricing entries
- **T13** — Stale quota display fix (reset window awareness)
- **T14** — Proxy fast-fail TCP check (≤2s, cached 30s)
- **T15** — Array content normalization for Anthropic
- **T23** — Intelligent quota reset fallback (header extraction)
- **T24** — `503` cooldown + `406` mapping
- **T25** — Provider validation fallback
- **T29** — Vertex AI Service Account JWT auth
- **T33** — Thinking level to budget conversion
- **T36** — `403` vs `429` error classification
- **T38** — Centralized model specifications (`modelSpecs.ts`)
- **T39** — Endpoint fallback for `fetchAvailableModels`
- **T41** — Background task auto-redirect to flash models
- **T42** — Image generation aspect ratio mapping

#### Other Improvements

- **Per-model upstream custom headers** — via configuration UI (PR #575 by @zhangqiang8vip)
- **Model context length** — configurable in model metadata (PR #578 by @hijak)
- **Model prefix stripping** — option to remove provider prefix from model names (PR #582 by @jay77721)
- **Gemini CLI deprecation** — marked deprecated with Google OAuth restriction warning
- **YAML parser** — replaced custom parser with `js-yaml` for correct OpenAPI spec parsing
- **ZWS v5** — HMR leak fix (485 DB connections → 1, memory 2.4GB → 195MB)
- **Log export** — New JSON export button on dashboard with time range dropdown
- **Update notification banner** — dashboard homepage shows when new versions are available

---

### 🌐 i18n & Documentation

- **30 languages** at 100% parity — 2,788 missing keys synced
- **Czech** — Full translation: 22 docs, 2,606 UI strings (PR by @zen0bit)
- **Chinese (zh-CN)** — Complete retranslation (PR by @only4copilot)
- **VM Deployment Guide** — Translated to English as source document
- **API Reference** — Added `/v1/embeddings` and `/v1/audio/speech` endpoints
- **Provider count** — Updated from 36+/40+/44+ to **67+** across README and all 30 i18n READMEs

---

### 🔀 Community PRs Merged (10)

| PR       | Author          | Summary                                                              |
| -------- | --------------- | -------------------------------------------------------------------- |
| **#587** | @k0valik        | fix(sse): revert resolveDataDir import for Cloudflare Workers compat |
| **#582** | @jay77721       | feat(proxy): model name prefix stripping option                      |
| **#581** | @jay77721       | fix(npm): link electron-release to npm-publish workflow              |
| **#578** | @hijak          | feat: configurable context length in model metadata                  |
| **#575** | @zhangqiang8vip | feat: per-model upstream headers, compat PATCH, chat alignment       |
| **#562** | @coobabm        | fix: MCP session management, Claude passthrough, detectFormat        |
| **#561** | @zen0bit        | fix(i18n): Czech translation corrections                             |
| **#555** | @k0valik        | fix(sse): centralized `resolveDataDir()` for path resolution         |
| **#546** | @k0valik        | fix(cli): `--version` returning `unknown` on Windows                 |
| **#544** | @k0valik        | fix(cli): secure CLI tool detection via installation paths           |
| **#542** | @rdself         | fix(ui): light mode contrast CSS theme variables                     |
| **#530** | @kang-heewon    | feat: OpenCode Zen + Go providers with `OpencodeExecutor`            |
| **#512** | @zhangqiang8vip | feat: per-protocol model compatibility (`compatByProtocol`)          |
| **#497** | @zhangqiang8vip | fix: dev-mode HMR resource leaks (ZWS v5)                            |
| **#495** | @xandr0s        | fix: Bottleneck 429 infinite wait (drop waiting jobs)                |
| **#494** | @zhangqiang8vip | feat: MiniMax developer→system role fix                              |
| **#480** | @prakersh       | fix: stream flush usage extraction                                   |
| **#479** | @prakersh       | feat: Codex 5.3/5.4 and Anthropic pricing entries                    |
| **#475** | @only4copilot   | feat(i18n): improved Chinese translation                             |

**Thank you to all contributors!** 🙏

---

### 📋 Issues Resolved (50+)

`#452` `#458` `#462` `#464` `#466` `#473` `#474` `#481` `#483` `#487` `#488` `#489` `#490` `#491` `#492` `#493` `#506` `#508` `#509` `#510` `#511` `#513` `#520` `#521` `#522` `#524` `#525` `#527` `#529` `#531` `#532` `#535` `#536` `#537` `#541` `#546` `#549` `#563` `#570` `#574` `#585`

---

### 🧪 Tests

- **926 tests, 0 failures** (up from 821 in v2.9.5)
- +105 new tests covering: model-combo mappings, registered keys, OpencodeExecutor, Bailian provider, route validation, error classification, aspect ratio mapping, and more

---

### 📦 Database Migrations

| Migration | Description                                                           |
| --------- | --------------------------------------------------------------------- |
| **008**   | `registered_keys`, `provider_key_limits`, `account_key_limits` tables |
| **009**   | `requested_model` column in `call_logs`                               |
| **010**   | `model_combo_mappings` table for per-model combo routing              |

---

### ⬆️ Upgrading from v2.9.5

```bash
# npm
npm install -g routiform@3.0.0

# Docker
docker pull linhnguyen0944/routiform:3.0.0

# Migrations run automatically on first startup
```

> **Breaking changes:** None. All existing configurations, combos, and API keys are preserved.
> Database migrations 008-010 run automatically on startup.

---

## [3.0.0-rc.17] — 2026-03-24

### 🔒 Security & CI/CD

- **CodeQL remediation** — Fixed 10+ alerts:
  - 6 polynomial-redos in `provider.ts` / `chatCore.ts` (replaced `(?:^|/)` alternation patterns with segment-based matching)
  - 1 insecure-randomness in `acp/manager.ts` (`Math.random()` → `crypto.randomUUID()`)
  - 1 shell-command-injection in `prepublish.mjs` (`JSON.stringify()` path escaping)
- **Route validation** — Added Zod schemas + `validateBody()` to 5 routes missing validation:
  - `model-combo-mappings` (POST, PUT), `webhooks` (POST, PUT), `openapi/try` (POST)
  - CI `check:route-validation:t06` now passes: **176/176 routes validated**

### 🐛 Bug Fixes

- **#585** — `<omniModel>` internal tags no longer leak to clients in SSE responses. Added outbound sanitization `TransformStream` in `combo.ts`

### ⚙️ Infrastructure

- **Docker** — Upgraded `docker/setup-buildx-action` from v3 → v4 (Node.js 20 deprecation fix)
- **CI cleanup** — Deleted 150+ failed/cancelled workflow runs

### 🧪 Tests

- Test suite: **926 tests, 0 failures** (+3 new)

---

## [3.0.0-rc.16] — 2026-03-24

### ✨ New Features

- Increased media transcription limits
- Added Model Context Length to registry metadata
- Added per-model upstream custom headers via configuration UI
- Fixed multiple bugs, Zod valiadation for patches, and resolved various community issues.

## [3.0.0-rc.15] — 2026-03-24

### ✨ New Features

- **#563** — Per-model Combo Routing: map model name patterns (glob) to specific combos for automatic routing
  - New `model_combo_mappings` table (migration 010) with pattern, combo_id, priority, enabled
  - `resolveComboForModel()` DB function with glob-to-regex matching (case-insensitive, `*` and `?` wildcards)
  - `getComboForModel()` in `model.ts`: augments `getCombo()` with model-pattern fallback
  - `chat.ts`: routing decision now checks model-combo mappings before single-model handling
  - API: `GET/POST /api/model-combo-mappings`, `GET/PUT/DELETE /api/model-combo-mappings/:id`
  - Dashboard: "Model Routing Rules" section added to Combos page with inline add/edit/toggle/delete
  - Examples: `claude-sonnet*` → code-combo, `gpt-4o*` → openai-combo, `gemini-*` → google-combo

### 🌐 i18n

- **Full i18n Sync**: 2,788 missing keys added across 30 language files — all languages now at 100% parity with `en.json`
- **Agents page i18n**: OpenCode Integration section fully internationalized (title, description, scanning, download labels)
- **6 new keys** added to `agents` namespace for OpenCode section

### 🎨 UI/UX

- **Provider Icons**: 16 missing provider icons added (3 copied, 2 downloaded, 11 SVG created)
- **SVG fallback**: `ProviderIcon` component updated with 4-tier strategy: Lobehub → PNG → SVG → Generic icon
- **Agents fingerprinting**: Synced with CLI tools — added droid, openclaw, copilot, opencode to fingerprint list (14 total)

### 🔒 Security

- **CVE fix**: Resolved dompurify XSS vulnerability (GHSA-v2wj-7wpq-c8vv) via npm overrides forcing `dompurify@^3.3.2`
- `npm audit` now reports **0 vulnerabilities**

### 🧪 Tests

- Test suite: **923 tests, 0 failures** (+15 new model-combo mapping tests)

---

## [3.0.0-rc.14] — 2026-03-23

### 🔀 Community PRs Merged

| PR       | Author   | Summary                                                                                      |
| -------- | -------- | -------------------------------------------------------------------------------------------- |
| **#562** | @coobabm | fix(ux): MCP session management, Claude passthrough normalization, OAuth modal, detectFormat |
| **#561** | @zen0bit | fix(i18n): Czech translation corrections — HTTP method names and documentation updates       |

### 🧪 Tests

- Test suite: **908 tests, 0 failures**

---

## [3.0.0-rc.13] — 2026-03-23

### 🔧 Bug Fixes

- **config:** resolve real API key from `keyId` in CLI settings routes (`codex-settings`, `droid-settings`, `kilo-settings`) to prevent writing masked strings (#549)

---

## [3.0.0-rc.12] — 2026-03-23

### 🔀 Community PRs Merged

| PR       | Author   | Summary                                                                                                                                                       |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#546** | @k0valik | fix(cli): `--version` returning `unknown` on Windows — use `JSON.parse(readFileSync)` instead of ESM import                                                   |
| **#555** | @k0valik | fix(sse): centralized `resolveDataDir()` for path resolution in credentials, autoCombo, responses logger, and request logger                                  |
| **#544** | @k0valik | fix(cli): secure CLI tool detection via known installation paths (8 tools) with symlink validation, file-type checks, size bounds, minimal env in healthcheck |
| **#542** | @rdself  | fix(ui): improve light mode contrast — add missing CSS theme variables (`bg-primary`, `bg-subtle`, `text-primary`) and fix dark-only colors in log detail     |

### 🔧 Bug Fixes

- **TDZ fix in `cliRuntime.ts`** — `validateEnvPath` was used before initialization at module startup by `getExpectedParentPaths()`. Reordered declarations to fix `ReferenceError`.
- **Build fixes** — Added `pino` and `pino-pretty` to `serverExternalPackages` to prevent Turbopack from breaking Pino's internal worker loading.

### 🧪 Tests

- Test suite: **905 tests, 0 failures**

---

## [3.0.0-rc.10] — 2026-03-23

### 🔧 Bug Fixes

- **#509 / #508** — Electron build regression: downgraded Next.js from `16.1.x` to `16.0.10` to eliminate Turbopack module-hashing instability that caused blank screens in the Electron desktop bundle.
- **Unit test fixes** — Corrected two stale test assertions (`nanobanana-image-handler` aspect ratio/resolution, `thinking-budget` Gemini `thinkingConfig` field mapping) that had drifted after recent implementation changes.
- **#541** — Responded to user feedback about installation complexity; no code changes required.

---

## [3.0.0-rc.9] — 2026-03-23

### ✨ New Features

- **T29** — Vertex AI SA JSON Executor: implemented using the `jose` library to handle JWT/Service Account auth, along with configurable regions in the UI and automatic partner model URL building.
- **T42** — Image generation aspect ratio mapping: created `sizeMapper` logic for generic OpenAI formats (`size`), added native `imagen3` handling, and updated NanoBanana endpoints to utilize mapped aspect ratios automatically.
- **T38** — Centralized model specifications: `modelSpecs.ts` created for limits and parameters per model.

### 🔧 Improvements

- **T40** — OpenCode CLI tools integration: native `opencode-zen` and `opencode-go` integration completed in earlier PR.

---

## [3.0.0-rc.8] — 2026-03-23

### 🔧 Bug Fixes & Improvements (Fallback, Quota & Budget)

- **T24** — `503` cooldown await fix + `406` mapping: mapped `406 Not Acceptable` to `503 Service Unavailable` with proper cooldown intervals.
- **T25** — Provider validation fallback: graceful fallback to standard validation models when a specific `validationModelId` is not present.
- **T36** — `403` vs `429` provider handling refinement: extracted into `errorClassifier.ts` to properly segregate hard permissions failures (`403`) from rate limits (`429`).
- **T39** — Endpoint Fallback for `fetchAvailableModels`: implemented a tri-tier mechanism (`/models` -> `/v1/models` -> local generic catalog) + `list_models_catalog` MCP tool updates to reflect `source` and `warning`.
- **T33** — Thinking level to budget conversion: translates qualitative thinking levels into precise budget allocations.
- **T41** — Background task auto redirect: routes heavy background evaluation tasks to flash/efficient models automatically.
- **T23** — Intelligent quota reset fallback: accurately extracts `x-ratelimit-reset` / `retry-after` header values or maps static cooldowns.

---

## [3.0.0-rc.7] — 2026-03-23 _(What's New vs v2.9.5 — will be released as v3.0.0)_

> **Upgrade from v2.9.5:** 16 issues resolved · 2 community PRs merged · 2 new providers · 7 new API endpoints · 3 new features · DB migration 008+009 · 832 tests passing · 15 sub2api gap improvements (T01–T15 complete).

### 🆕 New Providers

| Provider         | Alias          | Tier | Notes                                                          |
| ---------------- | -------------- | ---- | -------------------------------------------------------------- |
| **OpenCode Zen** | `opencode-zen` | Free | 3 models via `opencode.ai/zen/v1` (PR #530 by @kang-heewon)    |
| **OpenCode Go**  | `opencode-go`  | Paid | 4 models via `opencode.ai/zen/go/v1` (PR #530 by @kang-heewon) |

Both providers use the new `OpencodeExecutor` with multi-format routing (`/chat/completions`, `/messages`, `/responses`, `/models/{model}:generateContent`).

---

### ✨ New Features

#### 🔑 Registered Keys Provisioning API (#464)

Auto-generate and issue Routiform API keys programmatically with per-provider and per-account quota enforcement.

| Endpoint                              | Method    | Description                                      |
| ------------------------------------- | --------- | ------------------------------------------------ |
| `/api/v1/registered-keys`             | `POST`    | Issue a new key — raw key returned **once only** |
| `/api/v1/registered-keys`             | `GET`     | List registered keys (masked)                    |
| `/api/v1/registered-keys/{id}`        | `GET`     | Get key metadata                                 |
| `/api/v1/registered-keys/{id}`        | `DELETE`  | Revoke a key                                     |
| `/api/v1/registered-keys/{id}/revoke` | `POST`    | Revoke (for clients without DELETE support)      |
| `/api/v1/quotas/check`                | `GET`     | Pre-validate quota before issuing                |
| `/api/v1/providers/{id}/limits`       | `GET/PUT` | Configure per-provider issuance limits           |
| `/api/v1/accounts/{id}/limits`        | `GET/PUT` | Configure per-account issuance limits            |
| `/api/v1/issues/report`               | `POST`    | Report quota events to GitHub Issues             |

**DB — Migration 008:** Three new tables: `registered_keys`, `provider_key_limits`, `account_key_limits`.
**Security:** Keys stored as SHA-256 hashes. Raw key shown once on creation, never retrievable again.
**Quota types:** `maxActiveKeys`, `dailyIssueLimit`, `hourlyIssueLimit` per provider and per account.
**Idempotency:** `idempotency_key` field prevents duplicate issuance. Returns `409 IDEMPOTENCY_CONFLICT` if key was already used.
**Budget per key:** `dailyBudget` / `hourlyBudget` — limits how many requests a key can route per window.
**GitHub reporting:** Optional. Set `GITHUB_ISSUES_REPO` + `GITHUB_ISSUES_TOKEN` to auto-create GitHub issues on quota exceeded or issuance failures.

#### 🎨 Provider Icons — @lobehub/icons (#529)

All provider icons in the dashboard now use `@lobehub/icons` React components (130+ providers with SVG).
Fallback chain: **Lobehub SVG → existing `/providers/{id}.png` → generic icon**. Uses a proper React `ErrorBoundary` pattern.

#### 🔄 Model Auto-Sync Scheduler (#488)

Routiform now automatically refreshes model lists for connected providers every **24 hours**.

- Runs on server startup via the existing `/api/sync/initialize` hook
- Configurable via `MODEL_SYNC_INTERVAL_HOURS` environment variable
- Covers 16 major providers
- Records last sync time in the settings database

---

### 🔧 Bug Fixes

#### OAuth & Auth

- **#537 — Gemini CLI OAuth:** Clear actionable error when `GEMINI_OAUTH_CLIENT_SECRET` is missing in Docker/self-hosted deployments. Previously showed cryptic `client_secret is missing` from Google. Now provides specific `docker-compose.yml` and `~/.routiform/.env` instructions.

#### Providers & Routing

- **#536 — LongCat AI:** Fixed `baseUrl` (`api.longcat.chat/openai`) and `authHeader` (`Authorization: Bearer`).
- **#535 — Pinned model override:** `body.model` is now correctly set to `pinnedModel` when context-cache protection is active.
- **#532 — OpenCode Go key validation:** Now uses the `zen/v1` test endpoint (`testKeyBaseUrl`) — same key works for both tiers.

#### CLI & Tools

- **#527 — Claude Code + Codex loop:** `tool_result` blocks are now converted to text instead of dropped, stopping infinite tool-result loops.
- **#524 — OpenCode config save:** Added `saveOpenCodeConfig()` handler (XDG_CONFIG_HOME aware, writes TOML).
- **#521 — Login stuck:** Login no longer freezes after skipping password setup — redirects correctly to onboarding.
- **#522 — API Manager:** Removed misleading "Copy masked key" button (replaced with a lock icon tooltip).
- **#532 — OpenCode Go config:** Guide settings handler now handles `opencode` toolId.

#### Developer Experience

- **#489 — Antigravity:** Missing `googleProjectId` returns a structured 422 error with reconnect guidance instead of a cryptic crash.
- **#510 — Windows paths:** MSYS2/Git-Bash paths (`/c/Program Files/...`) are now normalized to `C:\\Program Files\\...` automatically.
- **#492 — CLI startup:** `routiform` CLI now detects `mise`/`nvm`-managed Node when `app/server.js` is missing and shows targeted fix instructions.

---

### 📖 Documentation Updates

- **#513** — Docker password reset: `INITIAL_PASSWORD` env var workaround documented
- **#520** — pnpm: `pnpm approve-builds better-sqlite3` step documented

---

### ✅ Issues Resolved in v3.0.0

`#464` `#488` `#489` `#492` `#510` `#513` `#520` `#521` `#522` `#524` `#527` `#529` `#532` `#535` `#536` `#537`

---

### 🔀 Community PRs Merged

| PR       | Author       | Summary                                                                |
| -------- | ------------ | ---------------------------------------------------------------------- |
| **#530** | @kang-heewon | OpenCode Zen + Go providers with `OpencodeExecutor` and improved tests |

---

## [3.0.0-rc.7] - 2026-03-23

### 🔧 Improvements (sub2api Gap Analysis — T05, T08, T09, T13, T14)

- **T05** — Rate-limit DB persistence: `setConnectionRateLimitUntil()`, `isConnectionRateLimited()`, `getRateLimitedConnections()` in `providers.ts`. The existing `rate_limited_until` column is now exposed as a dedicated API — OAuth token refresh must NOT touch this field to prevent rate-limit loops.
- **T08** — Per-API-key session limit: `max_sessions INTEGER DEFAULT 0` added to `api_keys` via auto-migration. `sessionManager.ts` gains `registerKeySession()`, `unregisterKeySession()`, `checkSessionLimit()`, and `getActiveSessionCountForKey()`. Callers in `chatCore.js` can enforce the limit and decrement on `req.close`.
- **T09** — Codex vs Spark rate-limit scopes: `getCodexModelScope()` and `getCodexRateLimitKey()` in `codex.ts`. Standard models (`gpt-5.x-codex`, `codex-mini`) get scope `"codex"`; spark models (`codex-spark*`) get scope `"spark"`. Rate-limit keys should be `${accountId}:${scope}` so exhausting one pool doesn't block the other.
- **T13** — Stale quota display fix: `getEffectiveQuotaUsage(used, resetAt)` returns `0` when the reset window has passed; `formatResetCountdown(resetAt)` returns a human-readable countdown string (e.g. `"2h 35m"`). Both exported from `providers.ts` + `localDb.ts` for dashboard consumption.
- **T14** — Proxy fast-fail: new `src/lib/proxyHealth.ts` with `isProxyReachable(proxyUrl, timeoutMs=2000)` (TCP check, ≤2s instead of 30s timeout), `getCachedProxyHealth()`, `invalidateProxyHealth()`, and `getAllProxyHealthStatuses()`. Results cached 30s by default; configurable via `PROXY_FAST_FAIL_TIMEOUT_MS` / `PROXY_HEALTH_CACHE_TTL_MS`.

### 🧪 Tests

- Test suite: **832 tests, 0 failures**

---

## [3.0.0-rc.6] - 2026-03-23

### 🔧 Bug Fixes & Improvements (sub2api Gap Analysis — T01–T15)

- **T01** — `requested_model` column in `call_logs` (migration 009): track which model the client originally requested vs the actual routed model. Enables fallback rate analytics.
- **T02** — Strip empty text blocks from nested `tool_result.content`: prevents Anthropic 400 errors (`text content blocks must be non-empty`) when Claude Code chains tool results.
- **T03** — Parse `x-codex-5h-*` / `x-codex-7d-*` headers: `parseCodexQuotaHeaders()` + `getCodexResetTime()` extract Codex quota windows for precise cooldown scheduling instead of generic 5-min fallback.
- **T04** — `X-Session-Id` header for external sticky routing: `extractExternalSessionId()` in `sessionManager.ts` reads `x-session-id` / `x-routiform-session` headers with `ext:` prefix to avoid collision with internal SHA-256 session IDs. Nginx-compatible (hyphenated header).
- **T06** — Account deactivated → permanent block: `isAccountDeactivated()` in `accountFallback.ts` detects 401 deactivation signals and applies a 1-year cooldown to prevent retrying permanently dead accounts.
- **T07** — X-Forwarded-For IP validation: new `src/lib/ipUtils.ts` with `extractClientIp()` and `getClientIpFromRequest()` — skips `unknown`/non-IP entries in `X-Forwarded-For` chains (Nginx/proxy-forwarded requests).
- **T10** — Credits exhausted → distinct fallback: `isCreditsExhausted()` in `accountFallback.ts` returns 1h cooldown with `creditsExhausted` flag, distinct from generic 429 rate limiting.
- **T11** — `max` reasoning effort → 131072 budget tokens: `EFFORT_BUDGETS` and `THINKING_LEVEL_MAP` updated; reverse mapping now returns `"max"` for full-budget responses. Unit test updated.
- **T12** — MiniMax M2.7 pricing entries added: `minimax-m2.7`, `MiniMax-M2.7`, `minimax-m2.7-highspeed` added to pricing table (sub2api PR #1120). M2.5/GLM-4.7/GLM-5/Kimi pricing already existed.
- **T15** — Array content normalization: `normalizeContentToString()` helper in `openai-to-claude.ts` correctly collapses array-formatted system/tool messages to string before sending to Anthropic.

### 🧪 Tests

- Test suite: **832 tests, 0 failures** (unchanged from rc.5)

---

## [3.0.0-rc.5] - 2026-03-22

### ✨ New Features

- **#464** — Registered Keys Provisioning API: auto-issue API keys with per-provider & per-account quota enforcement
  - `POST /api/v1/registered-keys` — issue keys with idempotency support
  - `GET /api/v1/registered-keys` — list (masked) registered keys
  - `GET /api/v1/registered-keys/{id}` — get key metadata
  - `DELETE /api/v1/registered-keys/{id}` / `POST ../{id}/revoke` — revoke keys
  - `GET /api/v1/quotas/check` — pre-validate before issuing
  - `PUT /api/v1/providers/{id}/limits` — set provider issuance limits
  - `PUT /api/v1/accounts/{id}/limits` — set account issuance limits
  - `POST /api/v1/issues/report` — optional GitHub issue reporting
  - DB migration 008: `registered_keys`, `provider_key_limits`, `account_key_limits` tables

---

## [3.0.0-rc.4] - 2026-03-22

### ✨ New Features

- **#530 (PR)** — OpenCode Zen and OpenCode Go providers added (by @kang-heewon)
  - New `OpencodeExecutor` with multi-format routing (`/chat/completions`, `/messages`, `/responses`)
  - 7 models across both tiers

---

## [3.0.0-rc.3] - 2026-03-22

### ✨ New Features

- **#529** — Provider icons now use [@lobehub/icons](https://github.com/lobehub/lobe-icons) with graceful PNG fallback and a `ProviderIcon` component (130+ providers supported)
- **#488** — Auto-update model lists every 24h via `modelSyncScheduler` (configurable via `MODEL_SYNC_INTERVAL_HOURS`)

### 🔧 Bug Fixes

- **#537** — Gemini CLI OAuth: now shows clear actionable error when `GEMINI_OAUTH_CLIENT_SECRET` is missing in Docker/self-hosted deployments

---

## [3.0.0-rc.2] - 2026-03-22

### 🔧 Bug Fixes

- **#536** — LongCat AI key validation: fixed baseUrl (`api.longcat.chat/openai`) and authHeader (`Authorization: Bearer`)
- **#535** — Pinned model override: `body.model` is now set to `pinnedModel` when context-cache protection detects a pinned model
- **#524** — OpenCode config now saved correctly: added `saveOpenCodeConfig()` handler (XDG_CONFIG_HOME aware, writes TOML)

---

## [3.0.0-rc.1] - 2026-03-22

### 🔧 Bug Fixes

- **#521** — Login no longer gets stuck after skipping password setup (redirects to onboarding)
- **#522** — API Manager: Removed misleading "Copy masked key" button (replaced with lock icon tooltip)
- **#527** — Claude Code + Codex superpowers loop: `tool_result` blocks now converted to text instead of dropped
- **#532** — OpenCode GO API key validation now uses the correct `zen/v1` endpoint (`testKeyBaseUrl`)
- **#489** — Antigravity: missing `googleProjectId` returns structured 422 error with reconnect guidance
- **#510** — Windows: MSYS2/Git-Bash paths (`/c/Program Files/...`) are now normalized to `C:\\Program Files\\...`
- **#492** — `routiform` CLI now detects `mise`/`nvm` when `app/server.js` is missing and shows targeted fix

### 📖 Documentation

- **#513** — Docker password reset: `INITIAL_PASSWORD` env var workaround documented
- **#520** — pnpm: `pnpm approve-builds better-sqlite3` documented

### ✅ Closed Issues

#489, #492, #510, #513, #520, #521, #522, #525, #527, #532

---

## [2.9.5] — 2026-03-22

> Sprint: New OpenCode providers, embedding credentials fix, CLI masked key bug, CACHE_TAG_PATTERN fix.

### 🐛 Bug Fixes

- **CLI tools save masked API key to config files** — `claude-settings`, `cline-settings`, and `openclaw-settings` POST routes now accept a `keyId` param and resolve the real API key from DB before writing to disk. `ClaudeToolCard` updated to send `keyId` instead of the masked display string. Fixes #523, #526.
- **Custom embedding providers: `No credentials` error** — `/v1/embeddings` now tracks `credentialsProviderId` separately from the routing prefix, so credentials are fetched from the matching provider node ID rather than the public prefix string. Fixes a regression where `google/gemini-embedding-001` and similar custom-provider models would always fail with a credentials error. Fixes #532-related. (PR #528 by @jacob2826)
- **Context cache protection regex misses `\n` prefix** — `CACHE_TAG_PATTERN` in `comboAgentMiddleware.ts` updated to match both literal `\n` (backslash-n) and actual newline U+000A that `combo.ts` streaming injects around the `<omniModel>` tag after fix #515. Fixes #531.

### ✨ New Providers

- **OpenCode Zen** — Free tier gateway at `opencode.ai/zen/v1` with 3 models: `minimax-m2.5-free`, `big-pickle`, `gpt-5-nano`
- **OpenCode Go** — Subscription service at `opencode.ai/zen/go/v1` with 4 models: `glm-5`, `kimi-k2.5`, `minimax-m2.7` (Claude format), `minimax-m2.5` (Claude format)
- Both providers use the new `OpencodeExecutor` which routes dynamically to `/chat/completions`, `/messages`, `/responses`, or `/models/{model}:generateContent` based on the requested model. (PR #530 by @kang-heewon)

---

## [2.9.4] — 2026-03-21

> Sprint: Bug fixes — preserve Codex prompt cache key, fix tagContent JSON escaping, sync expired token status to DB.

### 🐛 Bug Fixes

- **fix(translator)**: Preserve `prompt_cache_key` in Responses API → Chat Completions translation (#517)
  — The field is a cache-affinity signal used by Codex; stripping it was preventing prompt cache hits.
  Fixed in `openai-responses.ts` and `responsesApiHelper.ts`.

- **fix(combo)**: Escape `\n` in `tagContent` so injected JSON string is valid (#515)
  — Template literal newlines (U+000A) are not allowed unescaped inside JSON string values.
  Replaced with `\\n` literal sequences in `open-sse/services/combo.ts`.

- **fix(usage)**: Sync expired token status back to DB on live auth failure (#491)
  — When the Limits & Quotas live check returns 401/403, the connection `testStatus` is now updated
  to `"expired"` in the database so the Providers page reflects the same degraded state.
  Fixed in `src/app/api/usage/[connectionId]/route.ts`.

---

## [2.9.3] — 2026-03-21

> Sprint: Add 5 new free AI providers — LongCat, Pollinations, Cloudflare AI, Scaleway, AI/ML API.

### ✨ New Providers

- **feat(providers/longcat)**: Add LongCat AI (`lc/`) — 50M tokens/day free (Flash-Lite) + 500K/day (Chat/Thinking) during public beta. OpenAI-compatible, standard Bearer auth.
- **feat(providers/pollinations)**: Add Pollinations AI (`pol/`) — no API key required. Proxies GPT-5, Claude, Gemini, DeepSeek V3, Llama 4 (1 req/15s free). Custom executor handles optional auth.
- **feat(providers/cloudflare-ai)**: Add Cloudflare Workers AI (`cf/`) — 10K Neurons/day free (~150 LLM responses or 500s Whisper audio). 50+ models on global edge. Custom executor builds dynamic URL with `accountId` from credentials.
- **feat(providers/scaleway)**: Add Scaleway Generative APIs (`scw/`) — 1M free tokens for new accounts. EU/GDPR compliant (Paris). Qwen3 235B, Llama 3.1 70B, Mistral Small 3.2.
- **feat(providers/aimlapi)**: Add AI/ML API (`aiml/`) — $0.025/day free credit, 200+ models (GPT-4o, Claude, Gemini, Llama) via single aggregator endpoint.

### 🔄 Provider Updates

- **feat(providers/together)**: Add `hasFree: true` + 3 permanently free model IDs: `Llama-3.3-70B-Instruct-Turbo-Free`, `Llama-Vision-Free`, `DeepSeek-R1-Distill-Llama-70B-Free`
- **feat(providers/gemini)**: Add `hasFree: true` + `freeNote` (1,500 req/day, no credit card needed, aistudio.google.com)
- **chore(providers/gemini)**: Rename display name to `Gemini (Google AI Studio)` for clarity

### ⚙️ Infrastructure

- **feat(executors/pollinations)**: New `PollinationsExecutor` — omits `Authorization` header when no API key provided
- **feat(executors/cloudflare-ai)**: New `CloudflareAIExecutor` — dynamic URL construction requires `accountId` in provider credentials
- **feat(executors)**: Register `pollinations`, `pol`, `cloudflare-ai`, `cf` executor mappings

### 📝 Documentation

- **docs(readme)**: Expanded free combo stack to 11 providers ($0 forever)
- **docs(readme)**: Added 4 new free provider sections (LongCat, Pollinations, Cloudflare AI, Scaleway) with model tables
- **docs(readme)**: Updated pricing table with 4 new free tier rows
- **docs(i18n/pt-BR)**: Updated pricing table + added LongCat/Pollinations/Cloudflare AI/Scaleway sections in Portuguese
- **docs(new-features/ai)**: 10 task spec files + master implementation plan in `docs/new-features/ai/`

### 🧪 Tests

- Test suite: **821 tests, 0 failures** (unchanged)

---

## [2.9.2] — 2026-03-21

> Sprint: Fix media transcription (Deepgram/HuggingFace Content-Type, language detection) and TTS error display.

### 🐛 Bug Fixes

- **fix(transcription)**: Deepgram and HuggingFace audio transcription now correctly map `video/mp4` → `audio/mp4` and other media MIME types via new `resolveAudioContentType()` helper. Previously, uploading `.mp4` files consistently returned "No speech detected" because Deepgram was receiving `Content-Type: video/mp4`.
- **fix(transcription)**: Added `detect_language=true` to Deepgram requests — auto-detects audio language (Portuguese, Spanish, etc.) instead of defaulting to English. Fixes non-English transcriptions returning empty or garbage results.
- **fix(transcription)**: Added `punctuate=true` to Deepgram requests for higher-quality transcription output with correct punctuation.
- **fix(tts)**: `[object Object]` error display in Text-to-Speech responses fixed in both `audioSpeech.ts` and `audioTranscription.ts`. The `upstreamErrorResponse()` function now correctly extracts nested string messages from providers like ElevenLabs that return `{ error: { message: "...", status_code: 401 } }` instead of a flat error string.

### 🧪 Tests

- Test suite: **821 tests, 0 failures** (unchanged)

### Triaged Issues

- **#508** — Tool call format regression: requested proxy logs and provider chain info (`needs-info`)
- **#510** — Windows CLI healthcheck path: requested shell/Node version info (`needs-info`)
- **#485** — Kiro MCP tool calls: closed as external Kiro issue (not Routiform)
- **#442** — Baseten /models endpoint: closed (documented manual workaround)
- **#464** — Key provisioning API: acknowledged as roadmap item

---

## [2.9.1] — 2026-03-21

> Sprint: Fix SSE omniModel data loss, merge per-protocol model compatibility.

### Bug Fixes

- **#511** — Critical: `<omniModel>` tag was sent after `finish_reason:stop` in SSE streams, causing data loss. Tag is now injected into the first non-empty content chunk, guaranteeing delivery before SDKs close the connection.

### Merged PRs

- **PR #512** (@zhangqiang8vip): Per-protocol model compatibility — `normalizeToolCallId` and `preserveOpenAIDeveloperRole` can now be configured per client protocol (OpenAI, Claude, Responses API). New `compatByProtocol` field in model config with Zod validation.

### Triaged Issues

- **#510** — Windows CLI healthcheck_failed: requested PATH/version info
- **#509** — Turbopack Electron regression: upstream Next.js bug, documented workarounds
- **#508** — macOS black screen: suggested `--disable-gpu` workaround

---

## [2.9.0] — 2026-03-20

> Sprint: Cross-platform machineId fix, per-API-key rate limits, streaming context cache, Alibaba DashScope, search analytics, ZWS v5, and 8 issues closed.

### ✨ New Features

- **feat(search)**: Search Analytics tab in `/dashboard/analytics` — provider breakdown, cache hit rate, cost tracking. New API: `GET /api/v1/search/analytics` (#feat/search-provider-routing)
- **feat(provider)**: Alibaba Cloud DashScope added with custom endpoint path validation — configurable `chatPath` and `modelsPath` per node (#feat/custom-endpoint-paths)
- **feat(api)**: Per-API-key request-count limits — `max_requests_per_day` and `max_requests_per_minute` columns with in-memory sliding-window enforcement returning HTTP 429 (#452)
- **feat(dev)**: ZWS v5 — HMR leak fix (485 DB connections → 1), memory 2.4GB → 195MB, `globalThis` singletons, Edge Runtime warning fix (@zhangqiang8vip)

### 🐛 Bug Fixes

- **fix(#506)**: Cross-platform `machineId` — `getMachineIdRaw()` rewritten with try/catch waterfall (Windows REG.exe → macOS ioreg → Linux file read → hostname → `os.hostname()`). Eliminates `process.platform` branching that Next.js bundler dead-code-eliminated, fixing `'head' is not recognized` on Windows. Also fixes #466.
- **fix(#493)**: Custom provider model naming — removed incorrect prefix stripping in `DefaultExecutor.transformRequest()` that mangled org-scoped model IDs like `zai-org/GLM-5-FP8`.
- **fix(#490)**: Streaming + context cache protection — `TransformStream` intercepts SSE to inject `<omniModel>` tag before `[DONE]` marker, enabling context cache protection for streaming responses.
- **fix(#458)**: Combo schema validation — `system_message`, `tool_filter_regex`, `context_cache_protection` fields now pass Zod validation on save.
- **fix(#487)**: KIRO MITM card cleanup — removed ZWS_README, generified `AntigravityToolCard` to use dynamic tool metadata.

### 🧪 Tests

- Added Anthropic-format tools filter unit tests (PR #397) — 8 regression tests for `tool.name` without `.function` wrapper
- Test suite: **821 tests, 0 failures** (up from 813)

### 📋 Issues Closed (8)

- **#506** — Windows machineId `head` not recognized (fixed)
- **#493** — Custom provider model naming (fixed)
- **#490** — Streaming context cache (fixed)
- **#452** — Per-API-key request limits (implemented)
- **#466** — Windows login failure (same root cause as #506)
- **#504** — MITM inactive (expected behavior)
- **#462** — Gemini CLI PSA (resolved)
- **#434** — Electron app crash (duplicate of #402)

## [2.8.9] — 2026-03-20

> Sprint: Merge community PRs, fix KIRO MITM card, dependency updates.

### Merged PRs

- **PR #498** (@Sajid11194): Fix Windows machine ID crash (`undefined\REG.exe`). Replaces `node-machine-id` with native OS registry queries. **Closes #486.**
- **PR #497** (@zhangqiang8vip): Fix dev-mode HMR resource leaks — 485 leaked DB connections → 1, memory 2.4GB → 195MB. `globalThis` singletons, Edge Runtime warning fix, Windows test stability. (+1168/-338 across 22 files)
- **PRs #499-503** (Dependabot): GitHub Actions updates — `docker/build-push-action@7`, `actions/checkout@6`, `peter-evans/dockerhub-description@5`, `docker/setup-qemu-action@4`, `docker/login-action@4`.

### Bug Fixes

- **#505** — KIRO MITM card now displays tool-specific instructions (`api.anthropic.com`) instead of Antigravity-specific text.
- **#504** — Responded with UX clarification (MITM "Inactive" is expected behavior when proxy is not running).

---

## [2.8.8] — 2026-03-20

> Sprint: Fix OAuth batch test crash, add "Test All" button to individual provider pages.

### Bug Fixes

- **OAuth batch test crash** (ERR_CONNECTION_REFUSED): Replaced sequential for-loop with 5-connection concurrency limit + 30s per-connection timeout via `Promise.race()` + `Promise.allSettled()`. Prevents server crash when testing large OAuth provider groups (~30+ connections).

### Features

- **"Test All" button on provider pages**: Individual provider pages (e.g., `/providers/codex`) now show a "Test All" button in the Connections header when there are 2+ connections. Uses `POST /api/providers/test-batch` with `{mode: "provider", providerId}`. Results displayed in a modal with pass/fail summary and per-connection diagnosis.

---

## [2.8.7] — 2026-03-20

> Sprint: Merge PR #495 (Bottleneck 429 drop), fix #496 (custom embedding providers), triage features.

### Bug Fixes

- **Bottleneck 429 infinite wait** (PR #495 by @xandr0s): On 429, `limiter.stop({ dropWaitingJobs: true })` immediately fails all queued requests so upstream callers can trigger fallback. Limiter is deleted from Map so next request creates a fresh instance.
- **Custom embedding models unresolvable** (#496): `POST /v1/embeddings` now resolves custom embedding models from ALL provider_nodes (not just localhost). Enables models like `google/gemini-embedding-001` added via dashboard.

### Issues Responded

- **#452** — Per-API-key request-count limits (acknowledged, on roadmap)
- **#464** — Auto-issue API keys with provider/account limits (needs more detail)
- **#488** — Auto-update model lists (acknowledged, on roadmap)
- **#496** — Custom embedding provider resolution (fixed)

---

## [2.8.6] — 2026-03-20

> Sprint: Merge PR #494 (MiniMax role fix), fix KIRO MITM dashboard, triage 8 issues.

### Features

- **MiniMax developer→system role fix** (PR #494 by @zhangqiang8vip): Per-model `preserveDeveloperRole` toggle. Adds "Compatibility" UI in providers page. Fixes 422 "role param error" for MiniMax and similar gateways.
- **roleNormalizer**: `normalizeDeveloperRole()` now accepts `preserveDeveloperRole` parameter with tri-state behavior (undefined=keep, true=keep, false=convert).
- **DB**: New `getModelPreserveOpenAIDeveloperRole()` and `mergeModelCompatOverride()` in `models.ts`.

### Bug Fixes

- **KIRO MITM dashboard** (#481/#487): `CLIToolsPageClient` now routes any `configType: "mitm"` tool to `AntigravityToolCard` (MITM Start/Stop controls). Previously only Antigravity was hardcoded.
- **AntigravityToolCard generic**: Uses `tool.image`, `tool.description`, `tool.id` instead of hardcoded Antigravity values. Guards against missing `defaultModels`.

### Cleanup

- Removed `ZWS_README_V2.md` (development-only docs from PR #494).

### Issues Triaged (8)

- **#487** — Closed (KIRO MITM fixed in this release)
- **#486** — needs-info (Windows REG.exe PATH issue)
- **#489** — needs-info (Antigravity projectId missing, OAuth reconnect needed)
- **#492** — needs-info (missing app/server.js on mise-managed Node)
- **#490** — Acknowledged (streaming + context cache blocking, fix planned)
- **#491** — Acknowledged (Codex auth state inconsistency)
- **#493** — Acknowledged (Modal provider model name prefix, workaround provided)
- **#488** — Feature request backlog (auto-update model lists)

---

## [2.8.5] — 2026-03-19

> Sprint: Fix zombie SSE streams, context cache first-turn, KIRO MITM, and triage 5 external issues.

### Bug Fixes

- **Zombie SSE Streams** (#473): Reduce `STREAM_IDLE_TIMEOUT_MS` from 300s → 120s for faster combo fallback when providers hang mid-stream. Configurable via env var.
- **Context Cache Tag** (#474): Fix `injectModelTag()` to handle first-turn requests (no assistant messages) — context cache protection now works from the very first response.
- **KIRO MITM** (#481): Change KIRO `configType` from `guide` → `mitm` so the dashboard renders MITM Start/Stop controls.
- **E2E Test** (CI): Fix `providers-bailian-coding-plan.spec.ts` — dismiss pre-existing modal overlay before clicking Add API Key button.

### Closed Issues

- #473 — Zombie SSE streams bypass combo fallback
- #474 — Context cache `<omniModel>` tag missing on first turn
- #481 — MITM for KIRO not activatable from dashboard
- #468 — Gemini CLI remote server (superseded by #462 deprecation)
- #438 — Claude unable to write files (external CLI issue)
- #439 — AppImage doesn't work (documented libfuse2 workaround)
- #402 — ARM64 DMG "damaged" (documented xattr -cr workaround)
- #460 — CLI not runnable on Windows (documented PATH fix)

---

## [2.8.4] — 2026-03-19

> Sprint: Gemini CLI deprecation, VM guide i18n fix, dependabot security fix, provider schema expansion.

### Features

- **Gemini CLI Deprecation** (#462): Mark `gemini-cli` provider as deprecated with warning — Google restricts third-party OAuth usage from March 2026
- **Provider Schema** (#462): Expand Zod validation with `deprecated`, `deprecationReason`, `hasFree`, `freeNote`, `authHint`, `apiHint` optional fields

### Bug Fixes

- **VM Guide i18n** (#471): Add `VM_DEPLOYMENT_GUIDE.md` to i18n translation pipeline, regenerate all 30 locale translations from English source (were stuck in Portuguese)

### Security

- **deps**: Bump `flatted` 3.3.3 → 3.4.2 — fixes CWE-1321 prototype pollution (#484, @dependabot)

### Closed Issues

- #472 — Model Aliases regression (fixed in v2.8.2)
- #471 — VM guide translations broken
- #483 — Trailing `data: null` after `[DONE]` (fixed in v2.8.3)

### Merged PRs

- #484 — deps: bump flatted from 3.3.3 to 3.4.2 (@dependabot)

---

## [2.8.3] — 2026-03-19

> Sprint: Czech i18n, SSE protocol fix, VM guide translation.

### Features

- **Czech Language** (#482): Full Czech (cs) i18n — 22 docs, 2606 UI strings, language switcher updates (@zen0bit)
- **VM Deployment Guide**: Translated from Portuguese to English as the source document (@zen0bit)

### Bug Fixes

- **SSE Protocol** (#483): Stop sending trailing `data: null` after `[DONE]` signal — fixes `AI_TypeValidationError` in strict AI SDK clients (Zod-based validators)

### Merged PRs

- #482 — Add Czech language + Fix VM_DEPLOYMENT_GUIDE.md English source (@zen0bit)

---

## [2.8.2] — 2026-03-19

> Sprint: 2 merged PRs, model aliases routing fix, log export, and issue triage.

### Features

- **Log Export**: New Export button on `/dashboard/logs` with time range dropdown (1h, 6h, 12h, 24h). Downloads JSON of request/proxy/call logs via `/api/logs/export` API (#user-request)

### Bug Fixes

- **Model Aliases Routing** (#472): Settings → Model Aliases now correctly affect provider routing, not just format detection. Previously `resolveModelAlias()` output was only used for `getModelTargetFormat()` but the original model ID was sent to the provider
- **Stream Flush Usage** (#480): Usage data from the last SSE event in the buffer is now correctly extracted during stream flush (merged from @prakersh)

### Merged PRs

- #480 — Extract usage from remaining buffer in flush handler (@prakersh)
- #479 — Add missing Codex 5.3/5.4 and Anthropic model ID pricing entries (@prakersh)

---

## [2.8.1] — 2026-03-19

> Sprint: Five community PRs — streaming call log fixes, Kiro compatibility, cache token analytics, Chinese translation, and configurable tool call IDs.

### ✨ Features

- **feat(logs)**: Call log response content now correctly accumulated from raw provider chunks (OpenAI/Claude/Gemini) before translation, fixing empty response payloads in streaming mode (#470, @zhangqiang8vip)
- **feat(providers)**: Per-model configurable 9-char tool call ID normalization (Mistral-style) — only models with the option enabled get truncated IDs (#470)
- **feat(api)**: Key PATCH API expanded to support `allowedConnections`, `name`, `autoResolve`, `isActive`, and `accessSchedule` fields (#470)
- **feat(dashboard)**: Response-first layout in request log detail UI (#470)
- **feat(i18n)**: Improved Chinese (zh-CN) translation — complete retranslation (#475, @only4copilot)

### 🐛 Bug Fixes

- **fix(kiro)**: Strip injected `model` field from request body — Kiro API rejects unknown top-level fields (#478, @prakersh)
- **fix(usage)**: Include cache read + cache creation tokens in usage history input totals for accurate analytics (#477, @prakersh)
- **fix(callLogs)**: Support Claude format usage fields (`input_tokens`/`output_tokens`) alongside OpenAI format, include all cache token variants (#476, @prakersh)

---

## [2.8.0] — 2026-03-19

> Sprint: Bailian Coding Plan provider with editable base URLs, plus community contributions for Alibaba Cloud and Kimi Coding.

### ✨ Features

- **feat(providers)**: Added Bailian Coding Plan (`bailian-coding-plan`) — Alibaba Model Studio with Anthropic-compatible API. Static catalog of 8 models including Qwen3.5 Plus, Qwen3 Coder, MiniMax M2.5, GLM 5, and Kimi K2.5. Includes custom auth validation (400=valid, 401/403=invalid) (#467, @Mind-Dragon)
- **feat(admin)**: Editable default URL in Provider Admin create/edit flows — users can configure custom base URLs per connection. Persisted in `providerSpecificData.baseUrl` with Zod schema validation rejecting non-http(s) schemes (#467)

### 🧪 Tests

- Added 30+ unit tests and 2 e2e scenarios for Bailian Coding Plan provider covering auth validation, schema hardening, route-level behavior, and cross-layer integration

---

## [2.7.10] — 2026-03-19

> Sprint: Two new community-contributed providers (Alibaba Cloud Coding, Kimi Coding API-key) and Docker pino fix.

### ✨ Features

- **feat(providers)**: Added Alibaba Cloud Coding Plan support with two OpenAI-compatible endpoints — `alicode` (China) and `alicode-intl` (International), each with 8 models (#465, @dtk1985)
- **feat(providers)**: Added dedicated `kimi-coding-apikey` provider path — API-key-based Kimi Coding access is no longer forced through OAuth-only `kimi-coding` route. Includes registry, constants, models API, config, and validation test (#463, @Mind-Dragon)

### 🐛 Bug Fixes

- **fix(docker)**: Added missing `split2` dependency to Docker image — `pino-abstract-transport` requires it at runtime but it was not being copied into the standalone container, causing `Cannot find module 'split2'` crashes (#459)

---

## [2.7.9] — 2026-03-18

> Sprint: Codex responses subpath passthrough natively supported, Windows MITM crash fixed, and Combos agent schemas adjusted.

### ✨ Features

- **feat(codex)**: Native responses subpath passthrough for Codex — natively routes `POST /v1/responses/compact` to Codex upstream, maintaining Claude Code compatibility without stripping the `/compact` suffix (#457)

### 🐛 Bug Fixes

- **fix(combos)**: Zod schemas (`updateComboSchema` and `createComboSchema`) now include `system_message`, `tool_filter_regex`, and `context_cache_protection`. Fixes bug where agent-specific settings created via the dashboard were silently discarded by the backend validation layer (#458)
- **fix(mitm)**: Kiro MITM profile crash on Windows fixed — `node-machine-id` failed due to missing `REG.exe` env, and the fallback threw a fatal `crypto is not defined` error. Fallback now safely and correctly imports crypto (#456)

---

## [2.7.8] — 2026-03-18

> Sprint: Budget save bug + combo agent features UI + omniModel tag security fix.

### 🐛 Bug Fixes

- **fix(budget)**: "Save Limits" no longer returns 422 — `warningThreshold` is now correctly sent as fraction (0–1) instead of percentage (0–100) (#451)
- **fix(combos)**: `<omniModel>` internal cache tag is now stripped before forwarding requests to providers, preventing cache session breaks (#454)

### ✨ Features

- **feat(combos)**: Agent Features section added to combo create/edit modal — expose `system_message` override, `tool_filter_regex`, and `context_cache_protection` directly from the dashboard (#454)

---

## [2.7.7] — 2026-03-18

> Sprint: Docker pino crash, Codex CLI responses worker fix, package-lock sync.

### 🐛 Bug Fixes

- **fix(docker)**: `pino-abstract-transport` and `pino-pretty` now explicitly copied in Docker runner stage — Next.js standalone trace misses these peer deps, causing `Cannot find module pino-abstract-transport` crash on startup (#449)
- **fix(responses)**: Remove `initTranslators()` from `/v1/responses` route — was crashing Next.js worker with `the worker has exited` uncaughtException on Codex CLI requests (#450)

### 🔧 Maintenance

- **chore(deps)**: `package-lock.json` now committed on every version bump to ensure Docker `npm ci` uses exact dependency versions

---

## [2.7.5] — 2026-03-18

> Sprint: UX improvements and Windows CLI healthcheck fix.

### 🐛 Bug Fixes

- **fix(ux)**: Show default password hint on login page — new users now see `"Default password: 123456"` below the password input (#437)
- **fix(cli)**: Claude CLI and other npm-installed tools now correctly detected as runnable on Windows — spawn uses `shell:true` to resolve `.cmd` wrappers via PATHEXT (#447)

---

## [2.7.4] — 2026-03-18

> Sprint: Search Tools dashboard, i18n fixes, Copilot limits, Serper validation fix.

### 🚀 Features

- **feat(search)**: Add Search Playground (10th endpoint), Search Tools page with Compare Providers/Rerank Pipeline/Search History, local rerank routing, auth guards on search API (#443 by @Regis-RCR)
  - New route: `/dashboard/search-tools`
  - Sidebar entry under Debug section
  - `GET /api/search/providers` and `GET /api/search/stats` with auth guards
  - Local provider_nodes routing for `/v1/rerank`
  - 30+ i18n keys in search namespace

### 🐛 Bug Fixes

- **fix(search)**: Fix Brave news normalizer (was returning 0 results), enforce max_results truncation post-normalization, fix Endpoints page fetch URL (#443 by @Regis-RCR)
- **fix(analytics)**: Localize analytics day/date labels — replace hardcoded Portuguese strings with `Intl.DateTimeFormat(locale)` (#444 by @hijak)
- **fix(copilot)**: Correct GitHub Copilot account type display, filter misleading unlimited quota rows from limits dashboard (#445 by @hijak)
- **fix(providers)**: Stop rejecting valid Serper API keys — treat non-4xx responses as valid authentication (#446 by @hijak)

---

## [2.7.3] — 2026-03-18

> Sprint: Codex direct API quota fallback fix.

### 🐛 Bug Fixes

- **fix(codex)**: Block weekly-exhausted accounts in direct API fallback (#440)
  - `resolveQuotaWindow()` prefix matching: `"weekly"` now matches `"weekly (7d)"` cache keys
  - `applyCodexWindowPolicy()` enforces `useWeekly`/`use5h` toggles correctly
  - 4 new regression tests (766 total)

---

## [2.7.2] — 2026-03-18

> Sprint: Light mode UI contrast fixes.

### 🐛 Bug Fixes

- **fix(logs)**: Fix light mode contrast in request logs filter buttons and combo badge (#378)
  - Error/Success/Combo filter buttons now readable in light mode
  - Combo row badge uses stronger violet in light mode

---

## [2.7.1] — 2026-03-17

> Sprint: Unified web search routing (POST /v1/search) with 5 providers + Next.js 16.1.7 security fixes (6 CVEs).

### ✨ New Features

- **feat(search)**: Unified web search routing — `POST /v1/search` with 5 providers (Serper, Brave, Perplexity, Exa, Tavily)
  - Auto-failover across providers, 6,500+ free searches/month
  - In-memory cache with request coalescing (configurable TTL)
  - Dashboard: Search Analytics tab in `/dashboard/analytics` with provider breakdown, cache hit rate, cost tracking
  - New API: `GET /api/v1/search/analytics` for search request statistics
  - DB migration: `request_type` column on `call_logs` for non-chat request tracking
  - Zod validation (`v1SearchSchema`), auth-gated, cost recorded via `recordCost()`

### 🔒 Security

- **deps**: Next.js 16.1.6 → 16.1.7 — fixes 6 CVEs:
  - **Critical**: CVE-2026-29057 (HTTP request smuggling via http-proxy)
  - **High**: CVE-2026-27977, CVE-2026-27978 (WebSocket + Server Actions)
  - **Medium**: CVE-2026-27979, CVE-2026-27980, CVE-2026-jcc7

### 📁 New Files

| File                                                             | Purpose                                    |
| ---------------------------------------------------------------- | ------------------------------------------ |
| `open-sse/handlers/search.ts`                                    | Search handler with 5-provider routing     |
| `open-sse/config/searchRegistry.ts`                              | Provider registry (auth, cost, quota, TTL) |
| `open-sse/services/searchCache.ts`                               | In-memory cache with request coalescing    |
| `src/app/api/v1/search/route.ts`                                 | Next.js route (POST + GET)                 |
| `src/app/api/v1/search/analytics/route.ts`                       | Search stats API                           |
| `src/app/(dashboard)/dashboard/analytics/SearchAnalyticsTab.tsx` | Analytics dashboard tab                    |
| `src/lib/db/migrations/007_search_request_type.sql`              | DB migration                               |
| `tests/unit/search-registry.test.mjs`                            | 277 lines of unit tests                    |

---

## [2.7.0] — 2026-03-17

> Sprint: ClawRouter-inspired features — toolCalling flag, multilingual intent detection, benchmark-driven fallback, request deduplication, pluggable RouterStrategy, Grok-4 Fast + GLM-5 + MiniMax M2.5 + Kimi K2.5 pricing.

### ✨ New Models & Pricing

- **feat(pricing)**: xAI Grok-4 Fast — `$0.20/$0.50 per 1M tokens`, 1143ms p50 latency, tool calling supported
- **feat(pricing)**: xAI Grok-4 (standard) — `$0.20/$1.50 per 1M tokens`, reasoning flagship
- **feat(pricing)**: GLM-5 via Z.AI — `$0.5/1M`, 128K output context
- **feat(pricing)**: MiniMax M2.5 — `$0.30/1M input`, reasoning + agentic tasks
- **feat(pricing)**: DeepSeek V3.2 — updated pricing `$0.27/$1.10 per 1M`
- **feat(pricing)**: Kimi K2.5 via Moonshot API — direct Moonshot API access
- **feat(providers)**: Z.AI provider added (`zai` alias) — GLM-5 family with 128K output

### 🧠 Routing Intelligence

- **feat(registry)**: `toolCalling` flag per model in provider registry — combos can now prefer/require tool-calling capable models
- **feat(scoring)**: Multilingual intent detection for AutoCombo scoring — PT/ZH/ES/AR script/language patterns influence model selection per request context
- **feat(fallback)**: Benchmark-driven fallback chains — real latency data (p50 from `comboMetrics`) used to re-order fallback priority dynamically
- **feat(dedup)**: Request deduplication via content-hash — 5-second idempotency window prevents duplicate provider calls from retrying clients
- **feat(router)**: Pluggable `RouterStrategy` interface in `autoCombo/routerStrategy.ts` — custom routing logic can be injected without modifying core

### 🔧 MCP Server Improvements

- **feat(mcp)**: 2 new advanced tool schemas: `routiform_get_provider_metrics` (p50/p95/p99 per provider) and `routiform_explain_route` (routing decision explanation)
- **feat(mcp)**: MCP tool auth scopes updated — `metrics:read` scope added for provider metrics tools
- **feat(mcp)**: `routiform_best_combo_for_task` now accepts `languageHint` parameter for multilingual routing

### 📊 Observability

- **feat(metrics)**: `comboMetrics.ts` extended with real-time latency percentile tracking per provider/account
- **feat(health)**: Health API (`/api/monitoring/health`) now returns per-provider `p50Latency` and `errorRate` fields
- **feat(usage)**: Usage history migration for per-model latency tracking

### 🗄️ DB Migrations

- **feat(migrations)**: New column `latency_p50` in `combo_metrics` table — zero-breaking, safe for existing users

### 🐛 Bug Fixes / Closures

- **close(#411)**: better-sqlite3 hashed module resolution on Windows — fixed in v2.6.10 (f02c5b5)
- **close(#409)**: GitHub Copilot chat completions fail with Claude models when files attached — fixed in v2.6.9 (838f1d6)
- **close(#405)**: Duplicate of #411 — resolved

## [2.6.10] — 2026-03-17

> Windows fix: better-sqlite3 prebuilt download without node-gyp/Python/MSVC (#426).

### 🐛 Bug Fixes

- **fix(install/#426)**: On Windows, `npm install -g routiform` used to fail with `better_sqlite3.node is not a valid Win32 application` because the bundled native binary was compiled for Linux. Adds **Strategy 1.5** to `scripts/postinstall.mjs`: uses `@mapbox/node-pre-gyp install --fallback-to-build=false` (bundled within `better-sqlite3`) to download the correct prebuilt binary for the current OS/arch without requiring any build tools (no node-gyp, no Python, no MSVC). Falls back to `npm rebuild` only if the download fails. Adds platform-specific error messages with clear manual fix instructions.

---

## [2.6.9] — 2026-03-17

> CI fixes (t11 any-budget), bug fix #409 (file attachments via Copilot+Claude), release workflow correction.

### 🐛 Bug Fixes

- **fix(ci)**: Remove word "any" from comments in `openai-responses.ts` and `chatCore.ts` that were failing the t11 `\bany\b` budget check (false positive from regex counting comments)
- **fix(chatCore)**: Normalize unsupported content part types before forwarding to providers (#409 — Cursor sends `{type:"file"}` when `.md` files are attached; Copilot and other OpenAI-compat providers reject with "type has to be either 'image_url' or 'text'"; fix converts `file`/`document` blocks to `text` and drops unknown types)

### 🔧 Workflow

- **chore(generate-release)**: Add ATOMIC COMMIT RULE — version bump (`npm version patch`) MUST happen before committing feature files to ensure tag always points to a commit containing all version changes together

---

## [2.6.8] — 2026-03-17

> Sprint: Combo as Agent (system prompt + tool filter), Context Caching Protection, Auto-Update, Detailed Logs, MITM Kiro IDE.

### 🗄️ DB Migrations (zero-breaking — safe for existing users)

- **005_combo_agent_fields.sql**: `ALTER TABLE combos ADD COLUMN system_message TEXT DEFAULT NULL`, `tool_filter_regex TEXT DEFAULT NULL`, `context_cache_protection INTEGER DEFAULT 0`
- **006_detailed_request_logs.sql**: New `request_detail_logs` table with 500-entry ring-buffer trigger, opt-in via settings toggle

### ✨ Features

- **feat(combo)**: System Message Override per Combo (#399 — `system_message` field replaces or injects system prompt before forwarding to provider)
- **feat(combo)**: Tool Filter Regex per Combo (#399 — `tool_filter_regex` keeps only tools matching pattern; supports OpenAI + Anthropic formats)
- **feat(combo)**: Context Caching Protection (#401 — `context_cache_protection` tags responses with `<omniModel>provider/model</omniModel>` and pins model for session continuity)
- **feat(settings)**: Auto-Update via Settings (#320 — `GET /api/system/version` + `POST /api/system/update` — checks npm registry and updates in background with pm2 restart)
- **feat(logs)**: Detailed Request Logs (#378 — captures full pipeline bodies at 4 stages: client request, translated request, provider response, client response — opt-in toggle, 64KB trim, 500-entry ring-buffer)
- **feat(mitm)**: MITM Kiro IDE profile (#336 — `src/mitm/targets/kiro.ts` targets api.anthropic.com, reuses existing MITM infrastructure)

---

## [2.6.7] — 2026-03-17

> Sprint: SSE improvements, local provider_nodes extensions, proxy registry, Claude passthrough fixes.

### ✨ Features

- **feat(health)**: Background health check for local `provider_nodes` with exponential backoff (30s→300s) and `Promise.allSettled` to avoid blocking (#423, @Regis-RCR)
- **feat(embeddings)**: Route `/v1/embeddings` to local `provider_nodes` — `buildDynamicEmbeddingProvider()` with hostname validation (#422, @Regis-RCR)
- **feat(audio)**: Route TTS/STT to local `provider_nodes` — `buildDynamicAudioProvider()` with SSRF protection (#416, @Regis-RCR)
- **feat(proxy)**: Proxy registry, management APIs, and quota-limit generalization (#429, @Regis-RCR)

### 🐛 Bug Fixes

- **fix(sse)**: Strip Claude-specific fields (`metadata`, `anthropic_version`) when target is OpenAI-compat (#421, @prakersh)
- **fix(sse)**: Extract Claude SSE usage (`input_tokens`, `output_tokens`, cache tokens) in passthrough stream mode (#420, @prakersh)
- **fix(sse)**: Generate fallback `call_id` for tool calls with missing/empty IDs (#419, @prakersh)
- **fix(sse)**: Claude-to-Claude passthrough — forward body completely untouched, no re-translation (#418, @prakersh)
- **fix(sse)**: Filter orphaned `tool_result` items after Claude Code context compaction to avoid 400 errors (#417, @prakersh)
- **fix(sse)**: Skip empty-name tool calls in Responses API translator to prevent `placeholder_tool` infinite loops (#415, @prakersh)
- **fix(sse)**: Strip empty text content blocks before translation (#427, @prakersh)
- **fix(api)**: Add `refreshable: true` to Claude OAuth test config (#428, @prakersh)

### 📦 Dependencies

- Bump `vitest`, `@vitest/*` and related devDependencies (#414, @dependabot)

---

## [2.6.6] — 2026-03-17

> Hotfix: Turbopack/Docker compatibility — remove `node:` protocol from all `src/` imports.

### 🐛 Bug Fixes

- **fix(build)**: Removed `node:` protocol prefix from `import` statements in 17 files under `src/`. The `node:fs`, `node:path`, `node:url`, `node:os` etc. imports caused `Ecmascript file had an error` on Turbopack builds (Next.js 15 Docker) and on upgrades from older npm global installs. Affected files: `migrationRunner.ts`, `core.ts`, `backup.ts`, `prompts.ts`, `dataPaths.ts`, and 12 others in `src/app/api/` and `src/lib/`.
- **chore(workflow)**: Updated `generate-release.md` to make Docker Hub sync and dual-VPS deploy **mandatory** steps in every release.

---

## [2.6.5] — 2026-03-17

> Sprint: reasoning model param filtering, local provider 404 fix, Kilo Gateway provider, dependency bumps.

### ✨ New Features

- **feat(api)**: Added **Kilo Gateway** (`api.kilo.ai`) as a new API Key provider (alias `kg`) — 335+ models, 6 free models, 3 auto-routing models (`kilo-auto/frontier`, `kilo-auto/balanced`, `kilo-auto/free`). Passthrough models supported via `/api/gateway/models` endpoint. (PR #408 by @Regis-RCR)

### 🐛 Bug Fixes

- **fix(sse)**: Strip unsupported parameters for reasoning models (o1, o1-mini, o1-pro, o3, o3-mini). Models in the `o1`/`o3` family reject `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `logprobs`, `top_logprobs`, and `n` with HTTP 400. Parameters are now stripped at the `chatCore` layer before forwarding. Uses a declarative `unsupportedParams` field per model and a precomputed O(1) Map for lookup. (PR #412 by @Regis-RCR)
- **fix(sse)**: Local provider 404 now results in a **model-only lockout (5 seconds)** instead of a connection-level lockout (2 minutes). When a local inference backend (Ollama, LM Studio, oMLX) returns 404 for an unknown model, the connection remains active and other models continue working immediately. Also fixes a pre-existing bug where `model` was not passed to `markAccountUnavailable()`. Local providers detected via hostname (`localhost`, `127.0.0.1`, `::1`, extensible via `LOCAL_HOSTNAMES` env var). (PR #410 by @Regis-RCR)

### 📦 Dependencies

- `better-sqlite3` 12.6.2 → 12.8.0
- `undici` 7.24.2 → 7.24.4
- `https-proxy-agent` 7 → 8
- `agent-base` 7 → 8

---

## [2.6.4] — 2026-03-17

### 🐛 Bug Fixes

- **fix(providers)**: Removed non-existent model names across 5 providers:
  - **gemini / gemini-cli**: removed `gemini-3.1-pro/flash` and `gemini-3-*-preview` (don't exist in Google API v1beta); replaced with `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro/flash`
  - **antigravity**: removed `gemini-3.1-pro-high/low` and `gemini-3-flash` (invalid internal aliases); replaced with real 2.x models
  - **github (Copilot)**: removed `gemini-3-flash-preview` and `gemini-3-pro-preview`; replaced with `gemini-2.5-flash`
  - **nvidia**: corrected `nvidia/llama-3.3-70b-instruct` → `meta/llama-3.3-70b-instruct` (NVIDIA NIM uses `meta/` namespace for Meta models); added `nvidia/llama-3.1-70b-instruct` and `nvidia/llama-3.1-405b-instruct`
- **fix(db/combo)**: Updated `free-stack` combo on remote DB: removed `qw/qwen3-coder-plus` (expired refresh token), corrected `nvidia/llama-3.3-70b-instruct` → `nvidia/meta/llama-3.3-70b-instruct`, corrected `gemini/gemini-3.1-flash` → `gemini/gemini-2.5-flash`, added `if/deepseek-v3.2`

---

## [2.6.3] — 2026-03-16

> Sprint: zod/pino hash-strip baked into build pipeline, Synthetic provider added, VPS PM2 path corrected.

### 🐛 Bug Fixes

- **fix(build)**: Turbopack hash-strip now runs at **compile time** for ALL packages — not just `better-sqlite3`. Step 5.6 in `prepublish.mjs` walks every `.js` in `app/.next/server/` and strips the 16-char hex suffix from any hashed `require()`. Fixes `zod-dcb22c...`, `pino-...`, etc. MODULE_NOT_FOUND on global npm installs. Closes #398
- **fix(deploy)**: PM2 on both VPS was pointing to stale git-clone directories. Reconfigured to `app/server.js` in the npm global package. Updated `/deploy-vps` workflow to use `npm pack + scp` (npm registry rejects 299MB packages).

### ✨ Features

- **feat(provider)**: Synthetic ([synthetic.new](https://synthetic.new)) — privacy-focused OpenAI-compatible inference. `passthroughModels: true` for dynamic HuggingFace model catalog. Initial models: Kimi K2.5, MiniMax M2.5, GLM 4.7, DeepSeek V3.2. (PR #404 by @Regis-RCR)

### 📋 Issues Closed

- **close #398**: npm hash regression — fixed by compile-time hash-strip in prepublish
- **triage #324**: Bug screenshot without steps — requested reproduction details

---

## [2.6.2] — 2026-03-16

> Sprint: module hashing fully fixed, 2 PRs merged (Anthropic tools filter + custom endpoint paths), Alibaba Cloud DashScope provider added, 3 stale issues closed.

### 🐛 Bug Fixes

- **fix(build)**: Extended webpack `externals` hash-strip to cover ALL `serverExternalPackages`, not just `better-sqlite3`. Next.js 16 Turbopack hashes `zod`, `pino`, and every other server-external package into names like `zod-dcb22c6336e0bc69` that don't exist in `node_modules` at runtime. A HASH_PATTERN regex catch-all now strips the 16-char suffix and falls back to the base package name. Also added `NEXT_PRIVATE_BUILD_WORKER=0` in `prepublish.mjs` to reinforce webpack mode, plus a post-build scan that reports any remaining hashed refs. (#396, #398, PR #403)
- **fix(chat)**: Anthropic-format tool names (`tool.name` without `.function` wrapper) were silently dropped by the empty-name filter introduced in #346. LiteLLM proxies requests with `anthropic/` prefix in Anthropic Messages API format, causing all tools to be filtered and Anthropic to return `400: tool_choice.any may only be specified while providing tools`. Fixed by falling back to `tool.name` when `tool.function.name` is absent. Added 8 regression unit tests. (PR #397)

### ✨ Features

- **feat(api)**: Custom endpoint paths for OpenAI-compatible provider nodes — configure `chatPath` and `modelsPath` per node (e.g. `/v4/chat/completions`) in the provider connection UI. Includes a DB migration (`003_provider_node_custom_paths.sql`) and URL path sanitization (no `..` traversal, must start with `/`). (PR #400)
- **feat(provider)**: Alibaba Cloud DashScope added as OpenAI-compatible provider. International endpoint: `dashscope-intl.aliyuncs.com/compatible-mode/v1`. 12 models: `qwen-max`, `qwen-plus`, `qwen-turbo`, `qwen3-coder-plus/flash`, `qwq-plus`, `qwq-32b`, `qwen3-32b`, `qwen3-235b-a22b`. Auth: Bearer API key.

### 📋 Issues Closed

- **close #323**: Cline connection error `[object Object]` — fixed in v2.3.7; instructed user to upgrade from v2.2.9
- **close #337**: Kiro credit tracking — implemented in v2.5.5 (#381); pointed user to Dashboard → Usage
- **triage #402**: ARM64 macOS DMG damaged — requested macOS version, exact error, and advised `xattr -d com.apple.quarantine` workaround

---

## [2.6.1] — 2026-03-15

> Critical startup fix: v2.6.0 global npm installs crashed with a 500 error due to a Turbopack/webpack module-name hashing bug in the Next.js 16 instrumentation hook.

### 🐛 Bug Fixes

- **fix(build)**: Force `better-sqlite3` to always be required by its exact package name in the webpack server bundle. Next.js 16 compiled the instrumentation hook into a separate chunk and emitted `require('better-sqlite3-<hash>')` — a hashed module name that doesn't exist in `node_modules` — even though the package was listed in `serverExternalPackages`. Added an explicit `externals` function to the server webpack config so the bundler always emits `require('better-sqlite3')`, resolving the startup `500 Internal Server Error` on clean global installs. (#394, PR #395)

### 🔧 CI

- **ci**: Added `workflow_dispatch` to `npm-publish.yml` with version sync safeguard for manual triggers (#392)
- **ci**: Added `workflow_dispatch` to `docker-publish.yml`, updated GitHub Actions to latest versions (#392)

---

## [2.6.0] - 2026-03-15

> Issue resolution sprint: 4 bugs fixed, logs UX improved, Kiro credit tracking added.

### 🐛 Bug Fixes

- **fix(media)**: ComfyUI and SD WebUI no longer appear in the Media page provider list when unconfigured — fetches `/api/providers` on mount and hides local providers with no connections (#390)
- **fix(auth)**: Round-robin no longer re-selects rate-limited accounts immediately after cooldown — `backoffLevel` is now used as primary sort key in the LRU rotation (#340)
- **fix(oauth)**: Qoder (and other providers that redirect to their own UI) no longer leave the OAuth modal stuck at "Waiting for Authorization" — popup-closed detector auto-transitions to manual URL input mode (#344)
- **fix(logs)**: Request log table is now readable in light mode — status badges, token counts, and combo tags use adaptive `dark:` color classes (#378)

### ✨ Features

- **feat(kiro)**: Kiro credit tracking added to usage fetcher — queries `getUserCredits` from AWS CodeWhisperer endpoint (#337)

### 🛠 Chores

- **chore(tests)**: Aligned `test:plan3`, `test:fixes`, `test:security` to use same `tsx/esm` loader as `npm test` — eliminates module resolution false negatives in targeted runs (PR #386)

---

## [2.5.9] - 2026-03-15

> Codex native passthrough fix + route body validation hardening.

### 🐛 Bug Fixes

- **fix(codex)**: Preserve native Responses API passthrough for Codex clients — avoids unnecessary translation mutations (PR #387)
- **fix(api)**: Validate request bodies on pricing/sync and task-routing routes — prevents crashes from malformed inputs (PR #388)
- **fix(auth)**: JWT secrets persist across restarts via `src/lib/db/secrets.ts` — eliminates 401 errors after pm2 restart (PR #388)

---

## [2.5.8] - 2026-03-15

> Build fix: restore VPS connectivity broken by v2.5.7 incomplete publish.

### 🐛 Bug Fixes

- **fix(build)**: `scripts/prepublish.mjs` still used deprecated `--webpack` flag causing Next.js standalone build to fail silently — npm publish completed without `app/server.js`, breaking VPS deployment

---

## [2.5.7] - 2026-03-15

> Media playground error handling fixes.

### 🐛 Bug Fixes

- **fix(media)**: Transcription "API Key Required" false positive when audio contains no speech (music, silence) — now shows "No speech detected" instead
- **fix(media)**: `upstreamErrorResponse` in `audioTranscription.ts` and `audioSpeech.ts` now returns proper JSON (`{error:{message}}`), enabling correct 401/403 credential error detection in the MediaPageClient
- **fix(media)**: `parseApiError` now handles Deepgram's `err_msg` field and detects `"api key"` in error messages for accurate credential error classification

---

## [2.5.6] - 2026-03-15

> Critical security/auth fixes: Antigravity OAuth broken + JWT sessions lost after restart.

### 🐛 Bug Fixes

- **fix(oauth) #384**: Antigravity Google OAuth now correctly sends `client_secret` to the token endpoint. The fallback for `ANTIGRAVITY_OAUTH_CLIENT_SECRET` was an empty string, which is falsy — so `client_secret` was never included in the request, causing `"client_secret is missing"` errors for all users without a custom env var. Closes #383.
- **fix(auth) #385**: `JWT_SECRET` is now persisted to SQLite (`namespace='secrets'`) on first generation and reloaded on subsequent starts. Previously, a new random secret was generated each process startup, invalidating all existing cookies/sessions after any restart or upgrade. Affects both `JWT_SECRET` and `API_KEY_SECRET`. Closes #382.

---

## [2.5.5] - 2026-03-15

> Model list dedup fix, Electron standalone build hardening, and Kiro credit tracking.

### 🐛 Bug Fixes

- **fix(models) #380**: `GET /api/models` now includes provider aliases when building the active-provider filter — models for `claude` (alias `cc`) and `github` (alias `gh`) were always shown regardless of whether a connection was configured, because `PROVIDER_MODELS` keys are aliases but DB connections are stored under provider IDs. Fixed by expanding each active provider ID to also include its alias via `PROVIDER_ID_TO_ALIAS`. Closes #353.
- **fix(electron) #379**: New `scripts/prepare-electron-standalone.mjs` stages a dedicated `/.next/electron-standalone` bundle before Electron packaging. Aborts with a clear error if `node_modules` is a symlink (electron-builder would ship a runtime dependency on the build machine). Cross-platform path sanitization via `path.basename`. By @kfiramar.

### ✨ New Features

- **feat(kiro) #381**: Kiro credit balance tracking — usage endpoint now returns credit data for Kiro accounts by calling `codewhisperer.us-east-1.amazonaws.com/getUserCredits` (same endpoint Kiro IDE uses internally). Returns remaining credits, total allowance, renewal date, and subscription tier. Closes #337.

## [2.5.4] - 2026-03-15

> Logger startup fix, login bootstrap security fix, and dev HMR reliability improvement. CI infrastructure hardened.

### 🐛 Bug Fixes (PRs #374, #375, #376 by @kfiramar)

- **fix(logger) #376**: Restore pino transport logger path — `formatters.level` combined with `transport.targets` is rejected by pino. Transport-backed configs now strip the level formatter via `getTransportCompatibleConfig()`. Also corrects numeric level mapping in `/api/logs/console`: `30→info, 40→warn, 50→error` (was shifted by one).
- **fix(login) #375**: Login page now bootstraps from the public `/api/settings/require-login` endpoint instead of the protected `/api/settings`. In password-protected setups, the pre-auth page was receiving a 401 and falling back to safe defaults unnecessarily. The public route now returns all bootstrap metadata (`requireLogin`, `hasPassword`, `setupComplete`) with a conservative 200 fallback on error.
- **fix(dev) #374**: Add `localhost` and `127.0.0.1` to `allowedDevOrigins` in `next.config.mjs` — HMR websocket was blocked when accessing the app via loopback address, producing repeated cross-origin warnings.

### 🔧 CI & Infrastructure

- **ESLint OOM fix**: `eslint.config.mjs` now ignores `vscode-extension/**`, `electron/**`, `docs/**`, `app/.next/**`, and `clipr/**` — ESLint was crashing with a JS heap OOM by scanning VS Code binary blobs and compiled chunks.
- **Unit test fix**: Removed stale `ALTER TABLE provider_connections ADD COLUMN "group"` from 2 test files — column is now part of the base schema (added in #373), causing `SQLITE_ERROR: duplicate column name` on every CI run.
- **Pre-commit hook**: Added `npm run test:unit` to `.husky/pre-commit` — unit tests now block broken commits before they reach CI.

## [2.5.3] - 2026-03-14

> Critical bugfixes: DB schema migration, startup env loading, provider error state clearing, and i18n tooltip fix. Code quality improvements on top of each PR.

### 🐛 Bug Fixes (PRs #369, #371, #372, #373 by @kfiramar)

- **fix(db) #373**: Add `provider_connections.group` column to base schema + backfill migration for existing databases — column was used in all queries but missing from schema definition
- **fix(i18n) #371**: Replace non-existent `t("deleteConnection")` key with existing `providers.delete` key — fixes `MISSING_MESSAGE: providers.deleteConnection` runtime error on provider detail page
- **fix(auth) #372**: Clear stale error metadata (`errorCode`, `lastErrorType`, `lastErrorSource`) from provider accounts after genuine recovery — previously, recovered accounts kept appearing as failed
- **fix(startup) #369**: Unify env loading across `npm run start`, `run-standalone.mjs`, and Electron to respect `DATA_DIR/.env → ~/.routiform/.env → ./.env` priority — prevents generating a new `STORAGE_ENCRYPTION_KEY` over an existing encrypted database

### 🔧 Code Quality

- Documented `result.success` vs `response?.ok` patterns in `auth.ts` (both intentional, now explained)
- Normalized `overridePath?.trim()` in `electron/main.js` to match `bootstrap-env.mjs`
- Added `preferredEnv` merge order comment in Electron startup

> Codex account quota policy with auto-rotation, fast tier toggle, gpt-5.4 model, and analytics label fix.

### ✨ New Features (PRs #366, #367, #368)

- **Codex Quota Policy (PR #366)**: Per-account 5h/weekly quota window toggles in Provider dashboard. Accounts are automatically skipped when enabled windows reach 90% threshold and re-admitted after `resetAt`. Includes `quotaCache.ts` with side-effect free status getter.
- **Codex Fast Tier Toggle (PR #367)**: Dashboard → Settings → Codex Service Tier. Default-off toggle injects `service_tier: "flex"` only for Codex requests, reducing cost ~80%. Full stack: UI tab + API endpoint + executor + translator + startup restore.
- **gpt-5.4 Model (PR #368)**: Adds `cx/gpt-5.4` and `codex/gpt-5.4` to the Codex model registry. Regression test included.

### 🐛 Bug Fixes

- **fix #356**: Analytics charts (Top Provider, By Account, Provider Breakdown) now display human-readable provider names/labels instead of raw internal IDs for OpenAI-compatible providers.

> Major release: strict-random routing strategy, API key access controls, connection groups, external pricing sync, and critical bug fixes for thinking models, combo testing, and tool name validation.

### ✨ New Features (PRs #363 & #365)

- **Strict-Random Routing Strategy**: Fisher-Yates shuffle deck with anti-repeat guarantee and mutex serialization for concurrent requests. Independent decks per combo and per provider.
- **API Key Access Controls**: `allowedConnections` (restrict which connections a key can use), `is_active` (enable/disable key with 403), `accessSchedule` (time-based access control), `autoResolve` toggle, rename keys via PATCH.
- **Connection Groups**: Group provider connections by environment. Accordion view in Limits page with localStorage persistence and smart auto-switch.
- **External Pricing Sync (LiteLLM)**: 3-tier pricing resolution (user overrides → synced → defaults). Opt-in via `PRICING_SYNC_ENABLED=true`. MCP tool `routiform_sync_pricing`. 23 new tests.
- **i18n**: 30 languages updated with strict-random strategy, API key management strings. pt-BR fully translated.

### 🐛 Bug Fixes

- **fix #355**: Stream idle timeout increased from 60s to 300s — prevents aborting extended-thinking models (claude-opus-4-6, o3, etc.) during long reasoning phases. Configurable via `STREAM_IDLE_TIMEOUT_MS`.
- **fix #350**: Combo test now bypasses `REQUIRE_API_KEY=true` using internal header, and uses OpenAI-compatible format universally. Timeout extended from 15s to 20s.
- **fix #346**: Tools with empty `function.name` (forwarded by Claude Code) are now filtered before upstream providers receive them, preventing "Invalid input[N].name: empty string" errors.

### 🗑️ Closed Issues

- **#341**: Debug section removed — replacement is `/dashboard/logs` and `/dashboard/health`.

> API Key Round-Robin support for multi-key provider setups, and confirmation of wildcard routing and quota window rolling already in place.

### ✨ New Features

- **API Key Round-Robin (T07)**: Provider connections can now hold multiple API keys (Edit Connection → Extra API Keys). Requests rotate round-robin between primary + extra keys via `providerSpecificData.extraApiKeys[]`. Keys are held in-memory indexed per connection — no DB schema changes required.

### 📝 Already Implemented (confirmed in audit)

- **Wildcard Model Routing (T13)**: `wildcardRouter.ts` with glob-style wildcard matching (`gpt*`, `claude-?-sonnet`, etc.) is already integrated into `model.ts` with specificity ranking.
- **Quota Window Rolling (T08)**: `accountFallback.ts:isModelLocked()` already auto-advances the window — if `Date.now() > entry.until`, lock is deleted immediately (no stale blocking).

> UI polish, routing strategy additions, and graceful error handling for usage limits.

### ✨ New Features

- **Fill-First & P2C Routing Strategies**: Added `fill-first` (drain quota before moving on) and `p2c` (Power-of-Two-Choices low-latency selection) to combo strategy picker, with full guidance panels and color-coded badges.
- **Free Stack Preset Models**: Creating a combo with the Free Stack template now auto-fills 7 best-in-class free provider models (Gemini CLI, Kiro, Qoder×2, Qwen, NVIDIA NIM, Groq). Users just activate the providers and get a $0/month combo out-of-the-box.
- **Wider Combo Modal**: Create/Edit combo modal now uses `max-w-4xl` for comfortable editing of large combos.

### 🐛 Bug Fixes

- **Limits page HTTP 500 for Codex & GitHub**: `getCodexUsage()` and `getGitHubUsage()` now return a user-friendly message when the provider returns 401/403 (expired token), instead of throwing and causing a 500 error on the Limits page.
- **MaintenanceBanner false-positive**: Banner no longer shows "Server is unreachable" spuriously on page load. Fixed by calling `checkHealth()` immediately on mount and removing stale `show`-state closure.
- **Provider icon tooltips**: Edit (pencil) and delete icon buttons in the provider connection row now have native HTML tooltips — all 6 action icons are now self-documented.

> Multiple improvements from community issue analysis, new provider support, bug fixes for token tracking, model routing, and streaming reliability.

### ✨ New Features

- **Task-Aware Smart Routing (T05)**: Automatic model selection based on request content type — coding → deepseek-chat, analysis → gemini-2.5-pro, vision → gpt-4o, summarization → gemini-2.5-flash. Configurable via Settings. New `GET/PUT/POST /api/settings/task-routing` API.
- **HuggingFace Provider**: Added HuggingFace Router as an OpenAI-compatible provider with Llama 3.1 70B/8B, Qwen 2.5 72B, Mistral 7B, Phi-3.5 Mini.
- **Vertex AI Provider**: Added Vertex AI (Google Cloud) provider with Gemini 2.5 Pro/Flash, Gemma 2 27B, Claude via Vertex.
- **Playground File Uploads**: Audio upload for transcription, image upload for vision models (auto-detect by model name), inline image rendering for image generation results.
- **Model Select Visual Feedback**: Already-added models in combo picker now show ✓ green badge — prevents duplicate confusion.
- **Qwen Compatibility (PR #352)**: Updated User-Agent and CLI fingerprint settings for Qwen provider compatibility.
- **Round-Robin State Management (PR #349)**: Enhanced round-robin logic to handle excluded accounts and maintain rotation state correctly.
- **Clipboard UX (PR #360)**: Hardened clipboard operations with fallback for non-secure contexts; Claude tool normalization improvements.

### 🐛 Bug Fixes

- **Fix #302 — OpenAI SDK stream=False drops tool_calls**: T01 Accept header negotiation no longer forces streaming when `body.stream` is explicitly `false`. Was causing tool_calls to be silently dropped when using the OpenAI Python SDK in non-streaming mode.
- **Fix #73 — Claude Haiku routed to OpenAI without provider prefix**: `claude-*` models sent without a provider prefix now correctly route to the `antigravity` (Anthropic) provider. Added `gemini-*`/`gemma-*` → `gemini` heuristic as well.
- **Fix #74 — Token counts always 0 for Antigravity/Claude streaming**: The `message_start` SSE event which carries `input_tokens` was not being parsed by `extractUsage()`, causing all input token counts to drop. Input/output token tracking now works correctly for streaming responses.
- **Fix #180 — Model import duplicates with no feedback**: `ModelSelectModal` now shows ✓ green highlight for models already in the combo, making it obvious they're already added.
- **Media page generation errors**: Image results now render as `<img>` tags instead of raw JSON. Transcription results shown as readable text. Credential errors show an amber banner instead of silent failure.
- **Token refresh button on provider page**: Manual token refresh UI added for OAuth providers.

### 🔧 Improvements

- **Provider Registry**: HuggingFace and Vertex AI added to `providerRegistry.ts` and `providers.ts` (frontend).
- **Read Cache**: New `src/lib/db/readCache.ts` for efficient DB read caching.
- **Quota Cache**: Improved quota cache with TTL-based eviction.

### 📦 Dependencies

- `dompurify` → 3.3.3 (PR #347)
- `undici` → 7.24.2 (PR #348, #361)
- `docker/setup-qemu-action` → v4 (PR #342)
- `docker/setup-buildx-action` → v4 (PR #343)

### 📁 New Files

| File                                          | Purpose                                 |
| --------------------------------------------- | --------------------------------------- |
| `open-sse/services/taskAwareRouter.ts`        | Task-aware routing logic (7 task types) |
| `src/app/api/settings/task-routing/route.ts`  | Task routing config API                 |
| `src/app/api/providers/[id]/refresh/route.ts` | Manual OAuth token refresh              |
| `src/lib/db/readCache.ts`                     | Efficient DB read cache                 |
| `src/shared/utils/clipboard.ts`               | Hardened clipboard with fallback        |

## [2.4.1] - 2026-03-13

### 🐛 Fix

- **Combos modal: Free Stack visible and prominent** — Free Stack template was hidden (4th in 3-column grid). Fixed: moved to position 1, switched to 2x2 grid so all 4 templates are visible, green border + FREE badge highlight.

## [2.4.0] - 2026-03-13

> **Major release** — Free Stack ecosystem, transcription playground overhaul, 44+ providers, comprehensive free tier documentation, and UI improvements across the board.

### ✨ Features

- **Combos: Free Stack template** — New 4th template "Free Stack ($0)" using round-robin across Kiro + Qoder + Qwen + Gemini CLI. Suggests the pre-built zero-cost combo on first use.
- **Media/Transcription: Deepgram as default** — Deepgram (Nova 3, $200 free) is now the default transcription provider. AssemblyAI ($50 free) and Groq Whisper (free forever) shown with free credit badges.
- **README: "Start Free" section** — New early-README 5-step table showing how to set up zero-cost AI in minutes.
- **README: Free Transcription Combo** — New section with Deepgram/AssemblyAI/Groq combo suggestion and per-provider free credit details.
- **providers.ts: hasFree flag** — NVIDIA NIM, Cerebras, and Groq marked with hasFree badge and freeNote for the providers UI.
- **i18n: templateFreeStack keys** — Free Stack combo template translated and synced to all 30 languages.

## [2.3.16] - 2026-03-13

### 📖 Documentation

- **README: 44+ Providers** — Updated all 3 occurrences of "36+ providers" to "44+" reflecting the actual codebase count (44 providers in providers.ts)
- **README: New Section "🆓 Free Models — What You Actually Get"** — Added 7-provider table with per-model rate limits for: Kiro (Claude unlimited via AWS Builder ID), Qoder (5 models unlimited), Qwen (4 models unlimited), Gemini CLI (180K/mo), NVIDIA NIM (~40 RPM dev-forever), Cerebras (1M tok/day / 60K TPM), Groq (30 RPM / 14.4K RPD). Includes the \/usr/bin/bash Ultimate Free Stack combo recommendation.
- **README: Pricing Table Updated** — Added Cerebras to API KEY tier, fixed NVIDIA from "1000 credits" to "dev-forever free", updated Qoder/Qwen model counts and names
- **README: Qoder 8→5 models** (named: kimi-k2-thinking, qwen3-coder-plus, deepseek-r1, minimax-m2, kimi-k2)
- **README: Qwen 3→4 models** (named: qwen3-coder-plus, qwen3-coder-flash, qwen3-coder-next, vision-model)

## [2.3.15] - 2026-03-13

### ✨ Features

- **Auto-Combo Dashboard (Tier Priority)**: Added `🏷️ Tier` as the 7th scoring factor label in the `/dashboard/auto-combo` factor breakdown display — all 7 Auto-Combo scoring factors are now visible.
- **i18n — autoCombo section**: Added 20 new translation keys for the Auto-Combo dashboard (`title`, `status`, `modePack`, `providerScores`, `factorTierPriority`, etc.) to all 30 language files.

## [2.3.14] - 2026-03-13

### 🐛 Bug Fixes

- **Qoder OAuth (#339)**: Restored the valid default `clientSecret` — was previously an empty string, causing "Bad client credentials" on every connect attempt. The public credential is now the default fallback (overridable via `QODER_OAUTH_CLIENT_SECRET` env var).
- **MITM server not found (#335)**: `prepublish.mjs` now compiles `src/mitm/*.ts` to JavaScript using `tsc` before copying to the npm bundle. Previously only raw `.ts` files were copied — meaning `server.js` never existed in npm/Volta global installs.
- **GeminiCLI missing projectId (#338)**: Instead of throwing a hard 500 error when `projectId` is missing from stored credentials (e.g. after Docker restart), Routiform now logs a warning and attempts the request — returning a meaningful provider-side error instead of an Routiform crash.
- **Electron version mismatch (#323)**: Synced `electron/package.json` version to `2.3.13` (was `2.0.13`) so the desktop binary version matches the npm package.

### ✨ New Models (#334)

- **Kiro**: `claude-sonnet-4`, `claude-opus-4.6`, `deepseek-v3.2`, `minimax-m2.1`, `qwen3-coder-next`, `auto`
- **Codex**: `gpt5.4`

### 🔧 Improvements

- **Tier Scoring (API + Validation)**: Added `tierPriority` (weight `0.05`) to the `ScoringWeights` Zod schema and the `combos/auto` API route — the 7th scoring factor is now fully accepted by the REST API and validated on input. `stability` weight adjusted from `0.10` to `0.05` to keep total sum = `1.0`.

### ✨ New Features

- **Tiered Quota Scoring (Auto-Combo)**: Added `tierPriority` as a 7th scoring factor — accounts with Ultra/Pro tiers are now preferred over Free tiers when other factors are equal. New optional fields `accountTier` and `quotaResetIntervalSecs` on `ProviderCandidate`. All 4 mode packs updated (`ship-fast`, `cost-saver`, `quality-first`, `offline-friendly`).
- **Intra-Family Model Fallback (T5)**: When a model is unavailable (404/400/403), Routiform now automatically falls back to sibling models from the same family before returning an error (`modelFamilyFallback.ts`).
- **Configurable API Bridge Timeout**: `API_BRIDGE_PROXY_TIMEOUT_MS` env var lets operators tune the proxy timeout (default 30s). Fixes 504 errors on slow upstream responses. (#332)
- **Star History**: Replaced star-history.com widget with starchart.cc (`?variant=adaptive`) in all 30 READMEs — adapts to light/dark theme, real-time updates.

### 🐛 Bug Fixes

- **Auth — First-time password**: `INITIAL_PASSWORD` env var is now accepted when setting the first dashboard password. Uses `timingSafeEqual` for constant-time comparison, preventing timing attacks. (#333)
- **README Truncation**: Fixed a missing `</details>` closing tag in the Troubleshooting section that caused GitHub to stop rendering everything below it (Tech Stack, Docs, Roadmap, Contributors).
- **pnpm install**: Removed redundant `@swc/helpers` override from `package.json` that conflicted with the direct dependency, causing `EOVERRIDE` errors on pnpm. Added `pnpm.onlyBuiltDependencies` config.
- **CLI Path Injection (T12)**: Added `isSafePath()` validator in `cliRuntime.ts` to block path traversal and shell metacharacters in `CLI_*_BIN` env vars.
- **CI**: Regenerated `package-lock.json` after override removal to fix `npm ci` failures on GitHub Actions.

### 🔧 Improvements

- **Response Format (T1)**: `response_format` (json_schema/json_object) now injected as a system prompt for Claude, enabling structured output compatibility.
- **429 Retry (T2)**: Intra-URL retry for 429 responses (2× attempts with 2s delay) before falling back to next URL.
- **Gemini CLI Headers (T3)**: Added `User-Agent` and `X-Goog-Api-Client` fingerprint headers for Gemini CLI compatibility.
- **Pricing Catalog (T9)**: Added `deepseek-3.1`, `deepseek-3.2`, and `qwen3-coder-next` pricing entries.

### 📁 New Files

| File                                       | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `open-sse/services/modelFamilyFallback.ts` | Model family definitions and intra-family fallback logic |

### Fixed

- **KiloCode**: kilocode healthcheck timeout already fixed in v2.3.11
- **OpenCode**: Add opencode to cliRuntime registry with 15s healthcheck timeout
- **OpenClaw / Cursor**: Increase healthcheck timeout to 15s for slow-start variants
- **VPS**: Install droid and openclaw npm packages; activate CLI_EXTRA_PATHS for kiro-cli
- **cliRuntime**: Add opencode tool registration and increase timeout for continue

## [2.3.11] - 2026-03-12

### Fixed

- **KiloCode healthcheck**: Increase `healthcheckTimeoutMs` from 4000ms to 15000ms — kilocode renders an ASCII logo banner on startup causing false `healthcheck_failed` on slow/cold-start environments

## [2.3.10] - 2026-03-12

### Fixed

- **Lint**: Fix `check:any-budget:t11` failure — replace `as any` with `as Record<string, unknown>` in OAuthModal.tsx (3 occurrences)

### Docs

- **CLI-TOOLS.md**: Complete guide for all 11 CLI tools (claude, codex, gemini, opencode, cline, kilocode, continue, kiro-cli, cursor, droid, openclaw)
- **i18n**: CLI-TOOLS.md synced to 30 languages with translated title + intro

## [2.3.8] - 2026-03-12

## [2.3.9] - 2026-03-12

### Added

- **/v1/completions**: New legacy OpenAI completions endpoint — accepts both `prompt` string and `messages` array, normalizes to chat format automatically
- **EndpointPage**: Now shows all 3 OpenAI-compatible endpoint types: Chat Completions, Responses API, and Legacy Completions
- **i18n**: Added `completionsLegacy/completionsLegacyDesc` to 30 language files

### Fixed

- **OAuthModal**: Fix `[object Object]` displayed on all OAuth connection errors — properly extract `.message` from error response objects in all 3 `throw new Error(data.error)` calls (exchange, device-code, authorize)
- Affects Cline, Codex, GitHub, Qwen, Kiro, and all other OAuth providers

## [2.3.7] - 2026-03-12

### Fixed

- **Cline OAuth**: Add `decodeURIComponent` before base64 decode so URL-encoded auth codes from the callback URL are parsed correctly, fixing "invalid or expired authorization code" errors on remote (LAN IP) setups
- **Cline OAuth**: `mapTokens` now populates `name = firstName + lastName || email` so Cline accounts show real user names instead of "Account #ID"
- **OAuth account names**: All OAuth exchange flows (exchange, poll, poll-callback) now normalize `name = email` when name is missing, so every OAuth account shows its email as the display label in the Providers dashboard
- **OAuth account names**: Removed sequential "Account N" fallback in `db/providers.ts` — accounts with no email/name now use a stable ID-based label via `getAccountDisplayName()` instead of a sequential number that changes when accounts are deleted

## [2.3.6] - 2026-03-12

### Fixed

- **Provider test batch**: Fixed Zod schema to accept `providerId: null` (frontend sends null for non-provider modes); was incorrectly returning "Invalid request" for all batch tests
- **Provider test modal**: Fixed `[object Object]` display by normalizing API error objects to strings before rendering in `setTestResults` and `ProviderTestResultsView`
- **i18n**: Added missing keys `cliTools.toolDescriptions.opencode`, `cliTools.toolDescriptions.kiro`, `cliTools.guides.opencode`, `cliTools.guides.kiro` to `en.json`
- **i18n**: Synchronized 1111 missing keys across all 29 non-English language files using English values as fallbacks

## [2.3.5] - 2026-03-11

### Fixed

- **@swc/helpers**: Added permanent `postinstall` fix to copy `@swc/helpers` into the standalone app's `node_modules` — prevents MODULE_NOT_FOUND crash on global npm installs

## [2.3.4] - 2026-03-10

### Added

- Multiple provider integrations and dashboard improvements
