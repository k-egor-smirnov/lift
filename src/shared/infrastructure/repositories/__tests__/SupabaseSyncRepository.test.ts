import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";
import { SupabaseSyncRepository } from "../SupabaseSyncRepository";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import { TaskCategory, TaskStatus } from "../../../domain/types";
import { TestTaskIdUtils } from "../../../../test/utils/testHelpers";
import type { TaskRepository } from "../../../domain/repositories/TaskRepository";
import type {
  Database,
  SupabaseClientFactory,
} from "../../database/SupabaseClient";
import type { TodoDatabase } from "../../database/TodoDatabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock dependencies
const mockTaskRepository: Mocked<TaskRepository> = {
  findById: vi.fn(),
  saveMany: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findByCategoryAndStatus: vi.fn(),
  findOverdueTasks: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  countByCategory: vi.fn(),
  exists: vi.fn(),
};

const mockClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    }),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          gte: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
  })),
};

const mockClientFactory = {
  getClient: vi.fn(() => mockClient as unknown as SupabaseClient<Database>),
} as unknown as SupabaseClientFactory;

const mockDb = {
  dailySelectionEntries: {
    toArray: vi.fn(() => Promise.resolve([])),
  },
  taskLogs: {
    toArray: vi.fn(() => Promise.resolve([])),
  },
} as unknown as TodoDatabase;

type TestableSupabaseSyncRepository = {
  updateSyncMetadata(timestamp: Date): Promise<void>;
};

describe("SupabaseSyncRepository - First Device Login Fix", () => {
  let repository: SupabaseSyncRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create repository instance with mocked dependencies
    repository = new SupabaseSyncRepository(
      mockClientFactory,
      mockTaskRepository,
      mockDb
    );
  });

  it("should not call pushTasks when localTasks is empty (first device login)", async () => {
    // Arrange
    const remoteTasks = [
      new Task(
        new TaskId(TestTaskIdUtils.getValidTaskIdString()),
        new NonEmptyTitle("Remote Task 1"),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        1,
        new Date(),
        new Date()
      ),
    ];

    // Mock empty local tasks (new device scenario)
    mockTaskRepository.findAll.mockResolvedValue([]);

    // Mock pullTasks to return remote tasks
    vi.spyOn(repository, "pullTasks").mockResolvedValue(remoteTasks);

    // Mock pushTasks to track if it's called
    const pushTasksSpy = vi
      .spyOn(repository, "pushTasks")
      .mockResolvedValue(undefined);

    // Mock updateSyncMetadata
    vi.spyOn(
      repository as unknown as TestableSupabaseSyncRepository,
      "updateSyncMetadata"
    ).mockResolvedValue(undefined);

    // Act
    const result = await repository.syncTasks();

    // Assert
    expect(result.success).toBe(true);
    expect(result.pulledCount).toBe(1); // Should pull remote tasks
    expect(result.pushedCount).toBe(0); // Should not push empty local tasks
    expect(mockTaskRepository.saveMany).toHaveBeenCalledWith(remoteTasks); // Should save remote tasks locally
    expect(pushTasksSpy).not.toHaveBeenCalled(); // Should NOT call pushTasks when localTasks is empty
  });

  it("should call pushTasks when localTasks is not empty", async () => {
    // Arrange
    const localTasks = [
      new Task(
        new TaskId(TestTaskIdUtils.getValidTaskIdString()),
        new NonEmptyTitle("Local Task 1"),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        1,
        new Date(),
        new Date()
      ),
    ];

    // Mock local tasks exist
    mockTaskRepository.findAll.mockResolvedValue(localTasks);

    // Mock pullTasks to return empty (no new remote tasks)
    vi.spyOn(repository, "pullTasks").mockResolvedValue([]);

    // Mock pushTasks to track if it's called
    const pushTasksSpy = vi
      .spyOn(repository, "pushTasks")
      .mockResolvedValue(undefined);

    // Mock updateSyncMetadata
    vi.spyOn(
      repository as unknown as TestableSupabaseSyncRepository,
      "updateSyncMetadata"
    ).mockResolvedValue(undefined);

    // Act
    const result = await repository.syncTasks();

    // Assert
    expect(result.success).toBe(true);
    expect(result.pushedCount).toBe(1); // Should push local tasks
    expect(pushTasksSpy).toHaveBeenCalledWith(localTasks); // Should call pushTasks with local tasks
  });
});
