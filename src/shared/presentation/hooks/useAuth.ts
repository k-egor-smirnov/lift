import { useEffect, useState } from "react";
import {
  relaySyncClient,
  RelayUser,
} from "@/shared/infrastructure/sync-engine/RelaySyncClient";

interface AuthState {
  user: RelayUser | null;
  loading: boolean;
  initialized: boolean;
  serverUrl: string;
}

interface UseAuthReturn {
  user: RelayUser | null;
  loading: boolean;
  initialized: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  signIn: (login: string, password: string) => Promise<{ error?: string }>;
  signUp: (login: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

let globalAuthState: AuthState = {
  user: null,
  loading: false,
  initialized: true,
  serverUrl: relaySyncClient.getServerUrl(),
};

const subscribers = new Set<(state: AuthState) => void>();

const notifySubscribers = (newState: AuthState) => {
  globalAuthState = newState;
  subscribers.forEach((callback) => callback(newState));
};

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(globalAuthState);

  useEffect(() => {
    const updateState = (newState: AuthState) => {
      setAuthState(newState);
    };

    subscribers.add(updateState);

    notifySubscribers({
      ...globalAuthState,
      user: relaySyncClient.getCurrentUser(),
      serverUrl: relaySyncClient.getServerUrl(),
      initialized: true,
      loading: false,
    });

    return () => {
      subscribers.delete(updateState);
    };
  }, []);

  const setServerUrl = (url: string) => {
    relaySyncClient.setServerUrl(url);
    notifySubscribers({
      ...globalAuthState,
      serverUrl: relaySyncClient.getServerUrl(),
    });
  };

  const signIn = async (login: string, password: string) => {
    try {
      const user = await relaySyncClient.signIn(login, password);
      notifySubscribers({
        ...globalAuthState,
        user,
      });
      return {};
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unexpected error occurred",
      };
    }
  };

  const signUp = async (login: string, password: string) => {
    try {
      await relaySyncClient.signUp(login, password);
      return {};
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unexpected error occurred",
      };
    }
  };

  const signOut = async () => {
    relaySyncClient.signOut();
    notifySubscribers({
      ...globalAuthState,
      user: null,
    });
  };

  return {
    user: authState.user,
    loading: authState.loading,
    initialized: authState.initialized,
    serverUrl: authState.serverUrl,
    setServerUrl,
    signIn,
    signUp,
    signOut,
  };
}
