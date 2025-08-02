import { describe, it, expect, beforeEach } from "vitest";
import { container, tokens } from "../index";
import { TodoDatabase } from "../../database/TodoDatabase";
import { TaskRepositoryImpl } from "../../repositories/TaskRepositoryImpl";
import { CreateTaskUseCase } from "../../../application/use-cases/CreateTaskUseCase";
import { TaskLogService } from "../../../application/services/TaskLogService";

describe("DI Container", () => {
  beforeEach(() => {
    // Clear any existing registrations for clean tests
    container.clearInstances();
  });

  it("should resolve database instance", () => {
    const database = container.resolve(tokens.DATABASE_TOKEN);
    expect(database).toBeInstanceOf(TodoDatabase);
  });

  it("should resolve task repository instance", () => {
    const taskRepository = container.resolve(tokens.TASK_REPOSITORY_TOKEN);
    expect(taskRepository).toBeInstanceOf(TaskRepositoryImpl);
  });

  it("should resolve create task use case instance", () => {
    const createTaskUseCase = container.resolve(
      tokens.CREATE_TASK_USE_CASE_TOKEN
    );
    expect(createTaskUseCase).toBeInstanceOf(CreateTaskUseCase);
  });

  it("should resolve log service instance", () => {
    const logService = container.resolve(tokens.LOG_SERVICE_TOKEN);
    expect(logService).toBeInstanceOf(TaskLogService);
  });

  it("should return same instance for singletons", () => {
    const database1 = container.resolve(tokens.DATABASE_TOKEN);
    const database2 = container.resolve(tokens.DATABASE_TOKEN);
    expect(database1).toBe(database2);
  });

  it("should inject dependencies correctly", () => {
    const createTaskUseCase = container.resolve(
      tokens.CREATE_TASK_USE_CASE_TOKEN
    );
    expect(createTaskUseCase).toBeDefined();

    // The use case should have its dependencies injected
    // We can't directly test private properties, but we can test that it was created successfully
    expect(createTaskUseCase.execute).toBeDefined();
  });
});
