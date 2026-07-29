import type { SecureRuntime } from "../../application/SecureRuntime";

export interface WorkspaceSetupInput {
  readonly timezone: string;
  readonly startOfDay: string;
}

const START_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Owns setup validation and delegates the only mutation to the runtime facade. */
export class WorkspaceSetupViewModel {
  constructor(private readonly runtime: SecureRuntime) {}

  async create(input: WorkspaceSetupInput): Promise<string> {
    const timezone = input.timezone.trim();
    if (timezone.length === 0) throw new Error("Timezone is required");
    if (!START_OF_DAY.test(input.startOfDay)) {
      throw new Error("Start of day must use HH:mm format");
    }

    try {
      return await this.runtime.createWorkspace({
        timezone,
        startOfDay: input.startOfDay,
      });
    } catch {
      throw new Error(
        "Не удалось безопасно создать пространство. Проверьте соединение и повторите попытку."
      );
    }
  }
}
