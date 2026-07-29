import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskDeferModal } from "../TaskDeferModal";

vi.mock("@/shared/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date) => void }) => (
    <button
      type="button"
      onClick={() => onSelect(new Date(2026, 0, 2, 23, 30))}
    >
      choose-boundary-day
    </button>
  ),
}));

vi.mock("@/shared/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("TaskDeferModal", () => {
  it("emits the selected local calendar day as YYYY-MM-DD", () => {
    const onDeferConfirm = vi.fn();
    render(
      <TaskDeferModal
        isOpen
        onClose={vi.fn()}
        onDeferConfirm={onDeferConfirm}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "choose-boundary-day" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Отложить" }));

    expect(onDeferConfirm).toHaveBeenCalledWith("2026-01-02");
  });
});
