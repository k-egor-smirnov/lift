const requested = process.argv.includes("--all")
  ? ["http://127.0.0.1:8008", "http://127.0.0.1:8009"]
  : ["http://127.0.0.1:8008"];

const waitFor = async (baseUrl) => {
  const deadline = Date.now() + 45_000;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/_matrix/client/versions`);
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body.versions)) return body;
        lastError = "invalid versions response";
      } else {
        lastError = `${response.status} ${await response.text()}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`${baseUrl} unhealthy after 45s: ${lastError}`);
};

for (const baseUrl of requested) {
  const body = await waitFor(baseUrl);
  console.log(`${baseUrl} healthy (${body.versions.at(-1) ?? "unknown"})`);
}
