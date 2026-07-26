import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");
const composePath = resolve(projectRoot, "infra/matrix/docker-compose.yml");

describe("local Matrix Compose", () => {
  it("renders a pinned loopback-only durable Matrix stack", () => {
    const rendered = execFileSync(
      "docker",
      ["compose", "-f", composePath, "--profile", "migration", "config"],
      { cwd: projectRoot, encoding: "utf8" }
    );

    expect(rendered).toContain("matrixdotorg/synapse:v1.157.0");
    expect(rendered).toContain("postgres:18.4-alpine3.24");
    expect(rendered.match(/host_ip: 127\.0\.0\.1/g)).toHaveLength(2);
    expect(rendered).toContain('published: "8008"');
    expect(rendered).toContain('published: "8009"');
    expect(rendered).not.toMatch(/0\.0\.0\.0:800[89]/);
    expect(rendered.match(/restart: unless-stopped/g)).toHaveLength(4);
    expect(rendered).toContain("primary-postgres:");
    expect(rendered).toContain("secondary-postgres:");
    expect(rendered.match(/healthcheck:/g)).toHaveLength(4);
  });

  it("enables local signup while keeping guests, public rooms and federation disabled", () => {
    for (const stack of ["primary", "secondary"]) {
      const config = readFileSync(
        resolve(projectRoot, `infra/matrix/${stack}/homeserver.yaml`),
        "utf8"
      );
      expect(config).toMatch(/enable_registration: true/);
      expect(config).toMatch(/enable_registration_without_verification: true/);
      expect(config).toMatch(/allow_guest_access: false/);
      expect(config).toMatch(/names: \[client\]/);
      expect(config).not.toMatch(/names: \[[^\]]*federation/);
      expect(config).toMatch(/trusted_key_servers: \[\]/);
    }
  });
});
