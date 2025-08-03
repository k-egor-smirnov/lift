import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { container } from "tsyringe";
import { SupabaseClientFactory } from "@/shared/infrastructure/database/SupabaseClient";
import { SUPABASE_CLIENT_FACTORY_TOKEN } from "@/shared/infrastructure/di/tokens";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
}

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// Глобальное состояние авторизации для кеширования
let globalAuthState: AuthState = {
  user: null,
  loading: true,
  initialized: false,
};

// Подписчики на изменения состояния
const subscribers = new Set<(state: AuthState) => void>();

// Функция для уведомления всех подписчиков
const notifySubscribers = (newState: AuthState) => {
  globalAuthState = newState;
  subscribers.forEach((callback) => callback(newState));
};

// Инициализация авторизации (выполняется один раз)
let authInitialized = false;
const initializeAuth = async () => {
  if (authInitialized) return;
  authInitialized = true;

  const supabaseClientFactory = container.resolve<SupabaseClientFactory>(
    SUPABASE_CLIENT_FACTORY_TOKEN
  );
  const supabase = supabaseClientFactory.getClient();

  try {
    // Получаем текущего пользователя
    const {
      data: { user },
    } = await supabase.auth.getUser();

    notifySubscribers({
      user,
      loading: false,
      initialized: true,
    });

    // Подписываемся на изменения авторизации
    supabase.auth.onAuthStateChange((event, session) => {
      notifySubscribers({
        user: session?.user ?? null,
        loading: false,
        initialized: true,
      });
    });
  } catch (error) {
    console.error("Auth initialization error:", error);
    notifySubscribers({
      user: null,
      loading: false,
      initialized: true,
    });
  }
};

/**
 * Хук для работы с авторизацией
 * Кеширует состояние авторизации и предотвращает повторные проверки
 */
export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(globalAuthState);

  useEffect(() => {
    // Инициализируем авторизацию при первом использовании
    initializeAuth();

    // Подписываемся на изменения
    const updateState = (newState: AuthState) => {
      setAuthState(newState);
    };

    subscribers.add(updateState);

    // Если состояние уже инициализировано, обновляем локальное состояние
    if (globalAuthState.initialized) {
      setAuthState(globalAuthState);
    }

    return () => {
      subscribers.delete(updateState);
    };
  }, []);

  const supabaseClientFactory = container.resolve<SupabaseClientFactory>(
    SUPABASE_CLIENT_FACTORY_TOKEN
  );
  const supabase = supabaseClientFactory.getClient();

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (err) {
      return { error: "Unexpected error occurred" };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (err) {
      return { error: "Unexpected error occurred" };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  return {
    user: authState.user,
    loading: authState.loading,
    initialized: authState.initialized,
    signIn,
    signUp,
    signOut,
  };
}
