import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import type { MatrixSession } from "../../../application/ports/MatrixSession";
import { MatrixDeviceVerification } from "../MatrixDeviceVerification";

describe("MatrixDeviceVerification", () => {
  it("surfaces and accepts an incoming own-device verification request", async () => {
    const acceptDeviceVerification = vi.fn(async () => undefined);
    const verification = {
      phase: "requested" as const,
      otherUserId: "@alice:primary.localhost",
      otherDeviceId: "ELEMENT_DEVICE",
      initiatedByMe: false,
      emojis: [],
      decimals: [],
    };
    const session = {
      verificationSnapshot: () => verification,
      subscribeVerification: () => () => undefined,
      acceptDeviceVerification,
      rejectDeviceVerification: async () => undefined,
    } as unknown as MatrixSession;

    render(<MatrixDeviceVerification session={session} />);

    expect(
      screen.getByRole("dialog", { name: "Подтверждение Matrix-устройства" })
    ).toBeVisible();
    expect(screen.getByText("Устройство ELEMENT_DEVICE")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Принять и сравнить" }));
    await waitFor(() =>
      expect(acceptDeviceVerification).toHaveBeenCalledOnce()
    );
  });
});
