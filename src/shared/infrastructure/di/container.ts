import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";

import type { SecureRuntime } from "../../../features/workspaces/application/SecureRuntime";
import type { EffectiveDateProvider } from "../../../features/workspaces/application/ports/EffectiveDateProvider";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import type { LiftSecureDatabase } from "../../../features/workspaces/infrastructure/database/LiftSecureDatabase";
import type { EventBus } from "../../application/ports/EventBus";
import * as tokens from "./tokens";

export interface SecureContainerRegistrations {
  readonly database: LiftSecureDatabase;
  readonly workspaceRepository: WorkspaceRepository;
  readonly workspaceUnitOfWork: WorkspaceUnitOfWork;
  readonly effectiveDateProvider: EffectiveDateProvider;
  readonly eventBus: EventBus;
  readonly runtime: SecureRuntime;
}

/** Creates an isolated composition scope; no dependency is resolved on import. */
export const configureSecureContainer = (
  registrations: SecureContainerRegistrations
): DependencyContainer => {
  const scope = container.createChildContainer();
  scope.registerInstance(tokens.DATABASE_TOKEN, registrations.database);
  scope.registerInstance(
    tokens.WORKSPACE_REPOSITORY_TOKEN,
    registrations.workspaceRepository
  );
  scope.registerInstance(
    tokens.WORKSPACE_UNIT_OF_WORK_TOKEN,
    registrations.workspaceUnitOfWork
  );
  scope.registerInstance(
    tokens.EFFECTIVE_DATE_PROVIDER_TOKEN,
    registrations.effectiveDateProvider
  );
  scope.registerInstance(tokens.EVENT_BUS_TOKEN, registrations.eventBus);
  scope.registerInstance(tokens.SECURE_RUNTIME_TOKEN, registrations.runtime);
  return scope;
};
