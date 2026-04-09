import type { CompatModelRow } from "./compat";

export interface ModelRowProps {
  model: { id: string };
  fullModel: string;
  displayModel?: string;
  copyModel?: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  showDeveloperToggle?: boolean;
  effectiveModelNormalize: (modelId: string, protocol?: string) => boolean;
  effectiveModelPreserveDeveloper: (modelId: string, protocol?: string) => boolean;
  saveModelCompatFlags: (modelId: string, patch: unknown) => void;
  getUpstreamHeadersRecord: (protocol: string) => Record<string, string>;
  compatDisabled?: boolean;
  testStatus?: "ok" | "error";
  onTest?: () => void;
  isTesting?: boolean;
}

export interface PassthroughModelRowProps {
  modelId: string;
  fullModel: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onDeleteAlias: () => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  showDeveloperToggle?: boolean;
  effectiveModelNormalize: (modelId: string, protocol?: string) => boolean;
  effectiveModelPreserveDeveloper: (modelId: string, protocol?: string) => boolean;
  saveModelCompatFlags: (modelId: string, patch: unknown) => void;
  getUpstreamHeadersRecord: (protocol: string) => Record<string, string>;
  compatDisabled?: boolean;
  testStatus?: "ok" | "error";
  onTest?: () => void;
  isTesting?: boolean;
}

export interface PassthroughModelsSectionProps {
  providerAlias: string;
  modelAliases: Record<string, string>;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onSetAlias: (modelId: string, alias: string) => Promise<void>;
  onDeleteAlias: (alias: string) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  effectiveModelNormalize: (alias: string) => boolean;
  effectiveModelPreserveDeveloper: (alias: string) => boolean;
  getUpstreamHeadersRecord: (modelId: string, protocol: string) => Record<string, string>;
  saveModelCompatFlags: (modelId: string, flags: unknown) => Promise<void>;
  compatSavingModelId?: string;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  onTestModel?: (fullModel: string) => void;
  canTestModels?: boolean;
}

export interface CustomModelsSectionProps {
  providerId: string;
  providerAlias: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onModelsChanged?: () => void;
  onTestModel?: (fullModel: string) => Promise<boolean>;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  canTestModels?: boolean;
}

export interface CompatibleModelsSectionProps {
  providerStorageAlias: string;
  providerDisplayAlias: string;
  modelAliases: Record<string, string>;
  fallbackModels?: CompatModelRow[];
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  copied?: string;
  onCopy: (text: string, key: string) => void;
  onSetAlias: (modelId: string, alias: string, providerStorageAlias?: string) => Promise<void>;
  onDeleteAlias: (alias: string) => void;
  connections: { id?: string; isActive?: boolean }[];
  isAnthropic?: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
  effectiveModelNormalize: (alias: string) => boolean;
  effectiveModelPreserveDeveloper: (alias: string) => boolean;
  getUpstreamHeadersRecord: (modelId: string, protocol: string) => Record<string, string>;
  saveModelCompatFlags: (modelId: string, flags: unknown) => Promise<void>;
  compatSavingModelId?: string;
  onModelsChanged?: () => void;
  modelTestResults?: Record<string, "ok" | "error">;
  testingModelKey?: string | null;
  onTestModel?: (fullModel: string) => void;
  canTestModels?: boolean;
}
