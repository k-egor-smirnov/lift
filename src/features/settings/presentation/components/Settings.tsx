import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Switch } from "@/shared/ui/switch";
import { Separator } from "@/shared/ui/separator";
import { Badge } from "@/shared/ui/badge";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { useSync } from "@/shared/infrastructure/sync";
import { useAuth } from "@/shared/presentation/hooks/useAuth";
import { container } from "tsyringe";
import { SupabaseClientFactory } from "@/shared/infrastructure/database/SupabaseClient";
import { SUPABASE_CLIENT_FACTORY_TOKEN } from "@/shared/infrastructure/di/tokens";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Database,
  Wifi,
  WifiOff,
} from "lucide-react";

interface SettingsProps {
  onClose?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const {
    isOnline,
    syncStatus,
    lastSyncAt,
    error,
    realtimeStatus,
    performSync,
    enableAutoSync,
    enableRealtime,
  } = useSync();

  // Auth state
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App settings
  const [language, setLanguage] = useState(i18n.language);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<
    string | null
  >(null);

  // Get Supabase client
  const supabaseClientFactory = container.resolve<SupabaseClientFactory>(
    SUPABASE_CLIENT_FACTORY_TOKEN
  );
  const supabase = supabaseClientFactory.getClient();

  const handleSignIn = async () => {
    if (!email || !password) {
      setAuthError("Please enter both email and password");
      return;
    }

    setAuthError(null);
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);

      if (error) {
        setAuthError(error);
      } else {
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setAuthError("Unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setAuthError("Please enter both email and password");
      return;
    }

    setAuthError(null);
    setIsLoading(true);

    try {
      const { error } = await signUp(email, password);

      if (error) {
        setAuthError(error);
      } else {
        setAuthError(null);
        alert("Please check your email for confirmation");
      }
    } catch (err) {
      setAuthError("Unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      setAuthError(null);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    i18n.changeLanguage(newLanguage);
    localStorage.setItem("language", newLanguage);
  };

  const handleAutoSyncToggle = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    enableAutoSync(enabled);
  };

  const handleRealtimeToggle = (enabled: boolean) => {
    setRealtimeEnabled(enabled);
    enableRealtime(enabled);
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setConnectionTestResult(null);

    const testResults: string[] = [];

    try {
      // Тест 1: Проверка статуса браузера
      testResults.push(
        `✓ Статус браузера: ${navigator.onLine ? "Онлайн" : "Оффлайн"}`
      );

      // Тест 2: Проверка конфигурации Supabase
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        testResults.push("✗ Отсутствуют переменные окружения Supabase");
      } else {
        testResults.push("✓ Переменные окружения Supabase настроены");

        // Тест 3: Проверка подключения к Supabase
        try {
          const { data, error } = await supabase
            .from("tasks")
            .select("count")
            .limit(1);
          if (error) {
            testResults.push(
              `✗ Ошибка подключения к Supabase: ${error.message}`
            );
          } else {
            testResults.push("✓ Подключение к Supabase работает");
          }
        } catch (err) {
          testResults.push(`✗ Ошибка запроса к Supabase: ${err}`);
        }

        // Тест 4: Проверка аутентификации
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            testResults.push("✓ Пользователь аутентифицирован");
          } else {
            testResults.push("⚠ Пользователь не аутентифицирован");
          }
        } catch (err) {
          testResults.push(`✗ Ошибка проверки аутентификации: ${err}`);
        }

        // Тест 5: Проверка таблицы sync_metadata
        try {
          const { data, error } = await supabase
            .from("sync_metadata")
            .select("*")
            .limit(1);
          if (error) {
            testResults.push(
              `✗ Ошибка доступа к sync_metadata: ${error.message}`
            );
          } else {
            testResults.push("✓ Таблица sync_metadata доступна");
          }
        } catch (err) {
          testResults.push(`✗ Ошибка запроса к sync_metadata: ${err}`);
        }
      }
    } catch (err) {
      testResults.push(`✗ Общая ошибка тестирования: ${err}`);
    }

    setConnectionTestResult(testResults.join("\n"));
    setIsLoading(false);
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return t("settings.sync.never");
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case "syncing":
        return "bg-blue-500";
      case "synced":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="">
      <Tabs defaultValue="auth" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="auth" className="flex items-center space-x-2">
            <UserIcon className="h-4 w-4" />
            <span>{t("settings.tabs.auth")}</span>
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center space-x-2">
            <Database className="h-4 w-4" />
            <span>{t("settings.tabs.sync")}</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="flex items-center space-x-2">
            <SettingsIcon className="h-4 w-4" />
            <span>{t("settings.tabs.app")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.auth.title")}</CardTitle>
              <CardDescription>
                {t("settings.auth.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      {t("settings.auth.signedInAs")}
                    </Badge>
                    <span className="font-medium">{user.email}</span>
                  </div>
                  <Button
                    onClick={handleSignOut}
                    disabled={isLoading}
                    variant="outline"
                  >
                    {t("settings.auth.signOut")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("settings.auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("settings.auth.emailPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      {t("settings.auth.password")}
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("settings.auth.passwordPlaceholder")}
                    />
                  </div>
                  {authError && (
                    <Alert variant="destructive">
                      <AlertDescription>{authError}</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex space-x-2">
                    <Button
                      onClick={handleSignIn}
                      disabled={isLoading}
                      className="flex-1"
                    >
                      {t("settings.auth.signIn")}
                    </Button>
                    <Button
                      onClick={handleSignUp}
                      disabled={isLoading}
                      variant="outline"
                      className="flex-1"
                    >
                      {t("settings.auth.signUp")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.sync.title")}</CardTitle>
              <CardDescription>
                {t("settings.sync.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connection Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isOnline ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span>{t("settings.sync.connectionStatus")}</span>
                </div>
                <Badge variant={isOnline ? "default" : "destructive"}>
                  {isOnline
                    ? t("settings.sync.online")
                    : t("settings.sync.offline")}
                </Badge>
              </div>

              <Separator />

              {/* Sync Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>{t("settings.sync.status")}</span>
                  <Badge className={getSyncStatusColor(syncStatus)}>
                    {t(`settings.sync.statuses.${syncStatus}`)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t("settings.sync.lastSync")}</span>
                  <span>{formatLastSync(lastSyncAt)}</span>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">{error.message}</div>
                      {error.code && (
                        <div className="text-xs opacity-75">
                          Код ошибки: {error.code}
                        </div>
                      )}

                      {/* Специальные рекомендации для ошибок Realtime */}
                      {error.code === "REALTIME_NOT_ENABLED" && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <div className="font-medium text-yellow-800">
                            Решение:
                          </div>
                          <div className="text-sm text-yellow-700 mt-1">
                            1. Откройте Supabase Dashboard
                            <br />
                            2. Перейдите в раздел Database → Replication
                            <br />
                            3. Включите Realtime для таблицы 'tasks'
                            <br />
                            4. Или выполните миграцию:{" "}
                            <code className="bg-yellow-100 px-1 rounded">
                              002_enable_realtime.sql
                            </code>
                          </div>
                        </div>
                      )}

                      {error.code === "POSTGRES_CHANGES_ERROR" && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                          <div className="font-medium text-blue-800">
                            Решение:
                          </div>
                          <div className="text-sm text-blue-700 mt-1">
                            1. Проверьте настройки Realtime в Supabase
                            <br />
                            2. Убедитесь, что таблица 'tasks' добавлена в
                            публикацию
                            <br />
                            3. Проверьте RLS политики для таблицы
                          </div>
                        </div>
                      )}

                      {error.details && (
                        <details className="text-xs">
                          <summary className="cursor-pointer hover:opacity-75">
                            Подробности
                          </summary>
                          <pre className="mt-1 whitespace-pre-wrap">
                            {JSON.stringify(error.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Диагностическая информация */}
              {!isOnline && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">Проблема с подключением</div>
                      <div className="text-sm">
                        Приложение находится в оффлайн режиме. Возможные
                        причины:
                      </div>
                      <ul className="text-xs space-y-1 ml-4 list-disc">
                        <li>Отсутствует подключение к интернету</li>
                        <li>Проблемы с сетью</li>
                        <li>Блокировка брандмауэром</li>
                        <li>Неправильная конфигурация Supabase</li>
                      </ul>
                      <div className="text-xs mt-2">
                        Статус браузера:{" "}
                        {navigator.onLine ? "Онлайн" : "Оффлайн"}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Sync Controls */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("settings.sync.autoSync")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.sync.autoSyncDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={autoSyncEnabled}
                    onCheckedChange={handleAutoSyncToggle}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("settings.sync.realtime")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.sync.realtimeDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={realtimeEnabled}
                    onCheckedChange={handleRealtimeToggle}
                  />
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={performSync}
                    disabled={!isOnline}
                    className="w-full"
                  >
                    {t("settings.sync.manualSync")}
                  </Button>

                  <Button
                    onClick={handleTestConnection}
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Тестирование..." : "Тестировать подключение"}
                  </Button>
                </div>

                {/* Результаты тестирования подключения */}
                {connectionTestResult && (
                  <Alert className="mt-4">
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="font-medium">
                          Результаты диагностики:
                        </div>
                        <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-2 rounded">
                          {connectionTestResult}
                        </pre>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="app" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.app.title")}</CardTitle>
              <CardDescription>{t("settings.app.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Language Settings */}
              <div className="space-y-2">
                <Label>{t("settings.app.language")}</Label>
                <div className="flex space-x-2">
                  <Button
                    variant={language === "ru" ? "default" : "outline"}
                    onClick={() => handleLanguageChange("ru")}
                    size="sm"
                  >
                    Русский
                  </Button>
                  <Button
                    variant={language === "en" ? "default" : "outline"}
                    onClick={() => handleLanguageChange("en")}
                    size="sm"
                  >
                    English
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Debug Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("settings.app.debugMode")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.app.debugModeDescription")}
                  </p>
                </div>
                <Switch checked={debugMode} onCheckedChange={setDebugMode} />
              </div>

              <Separator />

              {/* App Info */}
              <div className="space-y-2">
                <Label>{t("settings.app.info")}</Label>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Version: 2.0.0</div>
                  <div>Build: {import.meta.env.MODE}</div>
                  <div>Real-time Status: {realtimeStatus}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
