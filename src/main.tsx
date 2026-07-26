import React from "react";
import ReactDOM from "react-dom/client";

import "./shared/lib/i18n";
import "./App.css";
import App from "./App";
import { createSecureRuntime } from "./features/workspaces/infrastructure/composition/createSecureRuntime";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Missing application root");
const root = ReactDOM.createRoot(rootElement);

const boot = async () => {
  try {
    const runtime = await createSecureRuntime();
    window.addEventListener("pagehide", () => void runtime.stop(), {
      once: true,
    });
    root.render(
      <React.StrictMode>
        <App runtime={runtime} />
      </React.StrictMode>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Secure runtime failed";
    root.render(
      <main className="min-h-screen bg-slate-950 p-8 text-red-300">
        Не удалось открыть локальное защищённое хранилище: {message}
      </main>
    );
  }
};

void boot();
