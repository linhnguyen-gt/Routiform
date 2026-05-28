export interface ProviderDefinition {
  id: string;
  alias?: string;
  name: string;
  icon: string;
  color: string;
  textIcon?: string;
  website?: string;
  passthroughModels?: boolean;
  deprecated?: boolean;
  deprecationReason?: string;
  hasFree?: boolean;
  freeNote?: string;
  authHint?: string;
  apiHint?: string;
  defaultPort?: number;
  healthEndpoint?: string;
  managementPrefix?: string;
  configDir?: string;
  binaryName?: string;
  githubRepo?: string;
}

export type ProviderMap = Record<string, ProviderDefinition>;
