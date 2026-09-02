import type { IntegrationProvider } from "@prisma/client";
import type { IntegrationProviderAdapter } from "./provider.types";
import { jiraProvider } from "./jira.provider";
import { clickupProvider } from "./clickup.provider";

const PROVIDERS: Record<IntegrationProvider, IntegrationProviderAdapter> = {
  jira: jiraProvider,
  clickup: clickupProvider,
};

export function getProviderAdapter(provider: IntegrationProvider): IntegrationProviderAdapter {
  return PROVIDERS[provider];
}

export * from "./provider.types";
