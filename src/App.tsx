import { useEffect, useMemo, useState } from "react";

import "./App.css";
import type { SecureRuntime } from "./features/workspaces/application/SecureRuntime";
import { SecureMVPApp } from "./mvp/SecureMVPApp";
import { WorkspaceSetupScreen } from "./features/workspaces/presentation/components/WorkspaceSetupScreen";
import { WorkspaceSetupViewModel } from "./features/workspaces/presentation/view-models/WorkspaceSetupViewModel";
import { MatrixSetupViewModel } from "./features/workspaces/presentation/view-models/MatrixSetupViewModel";
import { MatrixDeviceVerification } from "./features/workspaces/presentation/components/MatrixDeviceVerification";
import { MATRIX_AUTHENTICATION_CAPABILITIES } from "./features/workspaces/application/security/MatrixAuthenticationCapabilities";

interface AppProps {
  readonly runtime: SecureRuntime;
}

function App({ runtime }: AppProps) {
  const [workspaceId, setWorkspaceId] = useState(runtime.workspaceId());
  const setup = useMemo(() => new WorkspaceSetupViewModel(runtime), [runtime]);
  const matrixSetup = useMemo(
    () => new MatrixSetupViewModel(runtime.matrixSession),
    [runtime]
  );

  useEffect(() => {
    if (workspaceId !== null) return;
    const interval = window.setInterval(() => {
      const acceptedWorkspaceId = runtime.workspaceId();
      if (acceptedWorkspaceId !== null) setWorkspaceId(acceptedWorkspaceId);
    }, 500);
    return () => window.clearInterval(interval);
  }, [runtime, workspaceId]);

  if (workspaceId === null) {
    return (
      <>
        <WorkspaceSetupScreen
          matrixSetup={matrixSetup}
          matrixProfiles={runtime.matrixProfiles}
          allowOfflineCreation={runtime.allowOfflineWorkspaceCreation}
          onCreate={async (settings) => {
            setWorkspaceId(await setup.create(settings));
          }}
        />
        {MATRIX_AUTHENTICATION_CAPABILITIES.sasEmojiVerification ? (
          <MatrixDeviceVerification session={runtime.matrixSession} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <SecureMVPApp runtime={runtime} />
      {MATRIX_AUTHENTICATION_CAPABILITIES.sasEmojiVerification ? (
        <MatrixDeviceVerification session={runtime.matrixSession} />
      ) : null}
    </>
  );
}

export default App;
