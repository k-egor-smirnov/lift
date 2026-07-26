import { createHmac } from "node:crypto";

const stacks = process.argv.includes("--all")
  ? [
      {
        baseUrl: "http://127.0.0.1:8008",
        secret: "lift-primary-registration-dev-only",
      },
      {
        baseUrl: "http://127.0.0.1:8009",
        secret: "lift-secondary-registration-dev-only",
      },
    ]
  : [
      {
        baseUrl: "http://127.0.0.1:8008",
        secret: "lift-primary-registration-dev-only",
      },
    ];

const users = [
  ["alice", "lift-alice-local-dev"],
  ["bob", "lift-bob-local-dev"],
  ["viewer", "lift-viewer-local-dev"],
];

const requireOkJson = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
};

const register = async (
  baseUrl,
  sharedSecret,
  username,
  password,
  admin = false
) => {
  const { nonce } = await requireOkJson(
    await fetch(`${baseUrl}/_synapse/admin/v1/register`)
  );
  const mac = createHmac("sha1", sharedSecret)
    .update(
      [nonce, username, password, admin ? "admin" : "notadmin"].join("\0")
    )
    .digest("hex");
  const response = await fetch(`${baseUrl}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce,
      username,
      password,
      admin,
      mac,
      displayname: username,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (
    response.ok ||
    (response.status === 400 && body.errcode === "M_USER_IN_USE")
  ) {
    return;
  }
  throw new Error(
    `${baseUrl} ${username}: ${response.status} ${JSON.stringify(body)}`
  );
};

const verifyLogin = async (baseUrl, username, password) => {
  const body = await requireOkJson(
    await fetch(`${baseUrl}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: username },
        password,
        device_id: `PROVISION_${username.toUpperCase()}`,
        initial_device_display_name: "Lift local provision check",
      }),
    })
  );
  if (
    typeof body.access_token !== "string" ||
    typeof body.device_id !== "string"
  ) {
    throw new Error(`${baseUrl} ${username}: incomplete login response`);
  }
};

for (const { baseUrl, secret } of stacks) {
  for (const [username, password] of users) {
    await register(baseUrl, secret, username, password);
    await verifyLogin(baseUrl, username, password);
    console.log(`${baseUrl} provisioned ${username}`);
  }
}
