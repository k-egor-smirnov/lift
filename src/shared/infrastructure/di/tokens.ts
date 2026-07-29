/** Tokens are named after inward-facing capabilities, never concrete adapters. */
export const DATABASE_TOKEN = Symbol("SecureLocalDatabase");
export const WORKSPACE_REPOSITORY_TOKEN = Symbol("WorkspaceRepository");
export const WORKSPACE_UNIT_OF_WORK_TOKEN = Symbol("WorkspaceUnitOfWork");
export const EFFECTIVE_DATE_PROVIDER_TOKEN = Symbol("EffectiveDateProvider");
export const EVENT_BUS_TOKEN = Symbol("EventBus");
export const SECURE_RUNTIME_TOKEN = Symbol("SecureRuntime");
