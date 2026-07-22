import {
  can,
  isWorkspaceRole,
  matrixPowerLevel,
  validateRoleTransition,
  WorkspaceRole,
} from "../WorkspaceRole";

describe("workspace roles", () => {
  it("exposes the exact capabilities for every role", () => {
    const capabilities = [
      "read",
      "edit",
      "invite",
      "remove-member",
      "assign-editor",
      "assign-admin",
      "assign-owner",
      "revoke-device",
      "migrate-server",
    ] as const;

    const expected: Record<
      WorkspaceRole,
      readonly (typeof capabilities)[number][]
    > = {
      [WorkspaceRole.Owner]: capabilities,
      [WorkspaceRole.Admin]: [
        "read",
        "edit",
        "invite",
        "remove-member",
        "assign-editor",
        "revoke-device",
      ],
      [WorkspaceRole.Editor]: ["read", "edit"],
      [WorkspaceRole.Viewer]: ["read"],
    };

    for (const role of Object.values(WorkspaceRole)) {
      for (const capability of capabilities) {
        expect(can(role, capability)).toBe(expected[role].includes(capability));
      }
    }
  });

  it("maps roles to the fixed Matrix power levels", () => {
    expect(matrixPowerLevel).toEqual({
      [WorkspaceRole.Owner]: 100,
      [WorkspaceRole.Admin]: 75,
      [WorkspaceRole.Editor]: 50,
      [WorkspaceRole.Viewer]: 0,
    });
  });

  it.each([[undefined], [null], ["CUSTOM"], [42]])(
    "rejects malformed roles deliberately: %p",
    (role) => {
      expect(isWorkspaceRole(role)).toBe(false);
      expect(() => can(role as WorkspaceRole, "read")).toThrow(
        "Invalid WorkspaceRole"
      );
    }
  );

  it.each([[undefined], [null], ["CUSTOM"], [42]])(
    "rejects a malformed actor role before evaluating a transition: %p",
    (role) => {
      expect(() =>
        validateRoleTransition({
          actorRole: role as WorkspaceRole,
          previousRoles: { "@owner:test": WorkspaceRole.Owner },
          nextRoles: { "@owner:test": WorkspaceRole.Owner },
        })
      ).toThrow("Invalid WorkspaceRole");
    }
  );

  it.each([[undefined], [null], ["CUSTOM"], [42]])(
    "rejects every malformed own previous role value, including undefined: %p",
    (role) => {
      expect(() =>
        validateRoleTransition({
          actorRole: WorkspaceRole.Owner,
          previousRoles: {
            "@owner:test": WorkspaceRole.Owner,
            "@member:test": role as WorkspaceRole,
          },
          nextRoles: { "@owner:test": WorkspaceRole.Owner },
        })
      ).toThrow("Invalid WorkspaceRole");
    }
  );

  it.each([[undefined], [null], ["CUSTOM"], [42]])(
    "rejects every malformed own next role value, including undefined: %p",
    (role) => {
      expect(() =>
        validateRoleTransition({
          actorRole: WorkspaceRole.Owner,
          previousRoles: {
            "@owner:test": WorkspaceRole.Owner,
            "@member:test": WorkspaceRole.Viewer,
          },
          nextRoles: {
            "@owner:test": WorkspaceRole.Owner,
            "@member:test": role as WorkspaceRole,
          },
        })
      ).toThrow("Invalid WorkspaceRole");
    }
  );

  it("rejects the Editor Viewer-to-CUSTOM role bypass", () => {
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Editor,
        previousRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": "CUSTOM" as WorkspaceRole,
        },
      })
    ).toThrow("Invalid WorkspaceRole");
  });

  it("does not let an admin grant Owner or Admin", () => {
    expect(can(WorkspaceRole.Admin, "assign-owner")).toBe(false);

    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Admin,
        previousRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Admin,
        },
      })
    ).toThrow("assign-admin");

    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Admin,
        previousRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Owner,
        },
      })
    ).toThrow("assign-owner");
  });

  it("allows an admin to invite a Viewer and promote that member to Editor", () => {
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Admin,
        previousRoles: { "@owner:test": WorkspaceRole.Owner },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
      })
    ).not.toThrow();

    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Admin,
        previousRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Editor,
        },
      })
    ).not.toThrow();
  });

  it("rejects role changes by an Editor", () => {
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Editor,
        previousRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Viewer,
        },
        nextRoles: {
          "@owner:test": WorkspaceRole.Owner,
          "@viewer:test": WorkspaceRole.Editor,
        },
      })
    ).toThrow("assign-editor");
  });

  it("does not let a non-Owner demote any Owner", () => {
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Admin,
        previousRoles: {
          "@owner-a:test": WorkspaceRole.Owner,
          "@owner-b:test": WorkspaceRole.Owner,
        },
        nextRoles: {
          "@owner-a:test": WorkspaceRole.Owner,
          "@owner-b:test": WorkspaceRole.Viewer,
        },
      })
    ).toThrow("assign-owner");
  });

  it("does not let an Owner demote or remove the last Owner", () => {
    const previousRoles = { "@owner:test": WorkspaceRole.Owner };

    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Owner,
        previousRoles,
        nextRoles: { "@owner:test": WorkspaceRole.Admin },
      })
    ).toThrow("last Owner");

    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Owner,
        previousRoles,
        nextRoles: {},
      })
    ).toThrow("last Owner");
  });

  it("allows an Owner to transfer ownership before demoting the prior Owner", () => {
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Owner,
        previousRoles: { "@owner-a:test": WorkspaceRole.Owner },
        nextRoles: {
          "@owner-a:test": WorkspaceRole.Admin,
          "@owner-b:test": WorkspaceRole.Owner,
        },
      })
    ).not.toThrow();
  });
});
