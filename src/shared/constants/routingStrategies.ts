export type RoutingStrategyValue =
  | "priority"
  | "weighted"
  | "round-robin"
  | "fill-first"
  | "p2c"
  | "random"
  | "least-used"
  | "cost-optimized"
  | "strict-random"
  | "auto"
  | "context-optimized"
  | "lkgp"
  | "headroom";

type RoutingStrategyOption = {
  value: RoutingStrategyValue;
  labelKey: string;
  combosDescKey: string;
  settingsDescKey: string;
  icon: string;
};

export const ROUTING_STRATEGIES: RoutingStrategyOption[] = [
  {
    value: "priority",
    labelKey: "priority",
    combosDescKey: "priorityDesc",
    settingsDescKey: "priorityDesc",
    icon: "sort",
  },
  {
    value: "weighted",
    labelKey: "weighted",
    combosDescKey: "weightedDesc",
    settingsDescKey: "weightedDesc",
    icon: "percent",
  },
  {
    value: "round-robin",
    labelKey: "roundRobin",
    combosDescKey: "roundRobinDesc",
    settingsDescKey: "roundRobinDesc",
    icon: "autorenew",
  },
  {
    value: "fill-first",
    labelKey: "fillFirst",
    combosDescKey: "fillFirstDesc",
    settingsDescKey: "fillFirstDesc",
    icon: "vertical_align_top",
  },
  {
    value: "p2c",
    labelKey: "p2c",
    combosDescKey: "p2cDesc",
    settingsDescKey: "p2cDesc",
    icon: "balance",
  },
  {
    value: "random",
    labelKey: "random",
    combosDescKey: "randomDesc",
    settingsDescKey: "randomDesc",
    icon: "shuffle",
  },
  {
    value: "least-used",
    labelKey: "leastUsed",
    combosDescKey: "leastUsedDesc",
    settingsDescKey: "leastUsedDesc",
    icon: "low_priority",
  },
  {
    value: "cost-optimized",
    labelKey: "costOpt",
    combosDescKey: "costOptimizedDesc",
    settingsDescKey: "costOptDesc",
    icon: "savings",
  },
  {
    value: "strict-random",
    labelKey: "strictRandom",
    combosDescKey: "strictRandomDesc",
    settingsDescKey: "strictRandomDesc",
    icon: "casino",
  },
  {
    value: "auto",
    labelKey: "auto",
    combosDescKey: "autoDesc",
    settingsDescKey: "autoDesc",
    icon: "auto_awesome",
  },
  {
    value: "lkgp",
    labelKey: "lkgp",
    combosDescKey: "lkgpDesc",
    settingsDescKey: "lkgpDesc",
    icon: "verified",
  },
  {
    value: "headroom",
    labelKey: "headroom",
    combosDescKey: "headroomDesc",
    settingsDescKey: "headroomDesc",
    icon: "battery_full",
  },
  {
    value: "context-optimized",
    labelKey: "contextOpt",
    combosDescKey: "contextOptimizedDesc",
    settingsDescKey: "contextOptDesc",
    icon: "text_snippet",
  },
];

export const SETTINGS_FALLBACK_STRATEGY_VALUES: RoutingStrategyValue[] = [
  "priority",
  "weighted",
  "fill-first",
  "round-robin",
  "p2c",
  "random",
  "least-used",
  "cost-optimized",
  "strict-random",
  "auto",
  "context-optimized",
  "lkgp",
  "headroom",
];
