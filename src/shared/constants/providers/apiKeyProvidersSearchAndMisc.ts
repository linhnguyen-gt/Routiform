import type { ProviderMap } from "./types";

const WEB_SESSION_PROVIDER_FLAGS = {
  "perplexity-web": process.env.ENABLE_PERPLEXITY_WEB_PROVIDER === "true",
  "grok-web": process.env.ENABLE_GROK_WEB_PROVIDER === "true",
};

const ENABLED_WEB_SESSION_PROVIDERS: ProviderMap = {
  ...(WEB_SESSION_PROVIDER_FLAGS["perplexity-web"]
    ? {
        "perplexity-web": {
          id: "perplexity-web",
          alias: "pplx-web",
          name: "Perplexity Web",
          icon: "travel_explore",
          color: "#20808D",
          textIcon: "PW",
          website: "https://www.perplexity.ai",
        },
      }
    : {}),
  ...(WEB_SESSION_PROVIDER_FLAGS["grok-web"]
    ? {
        "grok-web": {
          id: "grok-web",
          alias: "grok-web",
          name: "Grok Web",
          icon: "auto_awesome",
          color: "#1DA1F2",
          textIcon: "GW",
          website: "https://grok.com",
        },
      }
    : {}),
};

export const APIKEY_PROVIDERS_SEARCH_AND_MISC = {
  "perplexity-search": {
    id: "perplexity-search",
    alias: "pplx-search",
    name: "Perplexity Search",
    icon: "search",
    color: "#20808D",
    textIcon: "PS",
    website: "https://docs.perplexity.ai/guides/search-quickstart",
    authHint: "Same API key as Perplexity (pplx-...)",
  },
  "serper-search": {
    id: "serper-search",
    alias: "serper-search",
    name: "Serper Search",
    icon: "search",
    color: "#4285F4",
    textIcon: "SP",
    website: "https://serper.dev",
    authHint: "API key from serper.dev dashboard",
  },
  "brave-search": {
    id: "brave-search",
    alias: "brave-search",
    name: "Brave Search",
    icon: "travel_explore",
    color: "#FB542B",
    textIcon: "BR",
    website: "https://brave.com/search/api",
    authHint: "Subscription token from Brave Search API dashboard",
  },
  "exa-search": {
    id: "exa-search",
    alias: "exa-search",
    name: "Exa Search",
    icon: "neurology",
    color: "#1E40AF",
    textIcon: "EX",
    website: "https://exa.ai",
    authHint: "API key from dashboard.exa.ai",
  },
  "tavily-search": {
    id: "tavily-search",
    alias: "tavily-search",
    name: "Tavily Search",
    icon: "manage_search",
    color: "#5B4FDB",
    textIcon: "TV",
    website: "https://tavily.com",
    authHint: "API key from app.tavily.com (format: tvly-...)",
  },
  novita: {
    id: "novita",
    alias: "novita",
    name: "Novita AI",
    icon: "auto_awesome",
    color: "#FF4081",
    textIcon: "NV",
    website: "https://novita.ai",
    passthroughModels: true,
  },
  piapi: {
    id: "piapi",
    alias: "pi",
    name: "PiAPI",
    icon: "api",
    color: "#7C4DFF",
    textIcon: "PI",
    website: "https://piapi.ai",
    passthroughModels: true,
  },
  getgoapi: {
    id: "getgoapi",
    alias: "ggo",
    name: "GoAPI",
    icon: "rocket_launch",
    color: "#FF6D00",
    textIcon: "GO",
    website: "https://api.getgoapi.com",
    passthroughModels: true,
  },
  laozhang: {
    id: "laozhang",
    alias: "lz",
    name: "LaoZhang AI",
    icon: "hub",
    color: "#FF1744",
    textIcon: "LZ",
    website: "https://api.laozhang.ai",
    passthroughModels: true,
  },
  "xiaomi-mimo": {
    id: "xiaomi-mimo",
    alias: "mimo",
    name: "Xiaomi MiMo",
    icon: "smart_toy",
    color: "#FF6900",
    textIcon: "XM",
    website: "https://platform.xiaomimimo.com",
  },
  "xiaomi-mimo-token-plan": {
    id: "xiaomi-mimo-token-plan",
    alias: "mimotp",
    name: "Xiaomi MiMo (Token Plan)",
    icon: "smart_toy",
    color: "#FF6900",
    textIcon: "MT",
    website: "https://platform.xiaomimimo.com",
  },
  ...ENABLED_WEB_SESSION_PROVIDERS,
} satisfies ProviderMap;
