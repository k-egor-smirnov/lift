import React, { useEffect, useState } from "react";
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
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Separator } from "@/shared/ui/separator";
import { Badge } from "@/shared/ui/badge";
import { useSync } from "@/shared/infrastructure/sync";
import { useAuth } from "@/shared/presentation/hooks/useAuth";
import { useCurrentTime } from "@/shared/presentation/contexts/CurrentTimeContext";
import { formatTimeAgo } from "@/shared/utils/timeFormat";
import { useUserSettingsViewModel } from "@/features/onboarding/presentation/view-models/UserSettingsViewModel";
import { useDeviceSyncManagement } from "@/features/settings/presentation/hooks/useDeviceSyncManagement";
import { Wifi, WifiOff } from "lucide-react";

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
  } = useSync();

  const { user, loading, serverUrl, setServerUrl, signIn, signUp, signOut } =
    useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncServerInput, setSyncServerInput] = useState(serverUrl);

  const [language, setLanguage] = useState(i18n.language);
  const [startOfDayTime, setStartOfDayTime] = useState("09:00");

  const {
    settings: userSettings,
    loadSettings: loadUserSettings,
    setStartOfDayTime: saveStartOfDayTime,
  } = useUserSettingsViewModel();

  const {
    devices,
    error: deviceManagementError,
    deviceName,
    setDeviceName,
    addDevice,
    revokeDevice,
    mlsState,
  } = useDeviceSyncManagement(user?.id ?? "anonymous");

  useEffect(() => {
    setSyncServerInput(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (!userSettings) {
      loadUserSettings();
    }
  }, [loadUserSettings, userSettings]);

  useEffect(() => {
    if (userSettings?.startOfDayTime) {
      setStartOfDayTime(userSettings.startOfDayTime);
    }
  }, [userSettings]);

  const now = useCurrentTime();

  const formatLastSync = (date: Date | null) => {
    if (!date) return t("settings.sync.never");
    return formatTimeAgo(date, now, t, i18n.language);
  };

  const saveSyncServer = () => {
    setServerUrl(syncServerInput);
  };

  const handleSignIn = async () => {
    if (!login || !password) {
      setAuthError(t("settings.auth.fillAllFields"));
      return;
    }

    const { error: signInError } = await signIn(login, password);
    setAuthError(signInError || null);
  };

  const handleSignUp = async () => {
    if (!login || !password) {
      setAuthError(t("settings.auth.fillAllFields"));
      return;
    }

    const { error: signUpError } = await signUp(login, password);
    setAuthError(signUpError || null);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    i18n.changeLanguage(newLanguage);
    localStorage.setItem("language", newLanguage);
  };

  const handleStartOfDayTimeChange = async (value: string) => {
    setStartOfDayTime(value);
    await saveStartOfDayTime(value);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-6">
      <Tabs defaultValue="sync" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sync">{t("settings.tabs.sync")}</TabsTrigger>
          <TabsTrigger value="app">{t("settings.tabs.app")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.sync.title")}</CardTitle>
              <CardDescription>
                {t("settings.sync.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sync-server-url">
                  {t("settings.sync.serverUrl")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="sync-server-url"
                    value={syncServerInput}
                    onChange={(event) => setSyncServerInput(event.target.value)}
                    placeholder={t("settings.sync.serverUrlPlaceholder")}
                  />
                  <Button type="button" onClick={saveSyncServer}>
                    {t("common.save")}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>{t("settings.sync.authTitle")}</Label>
                {user ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-1">
                      <p className="font-medium">{user.login}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.sync.connected")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSignOut}
                    >
                      {t("settings.auth.signOut")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={login}
                      onChange={(event) => setLogin(event.target.value)}
                      placeholder={t("settings.auth.emailPlaceholder")}
                    />
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("settings.auth.passwordPlaceholder")}
                    />
                    {authError && (
                      <Alert variant="destructive">
                        <AlertDescription>{authError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={handleSignIn}
                      >
                        {t("settings.auth.signIn")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={handleSignUp}
                      >
                        {t("settings.auth.signUp")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2">
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

              <div className="rounded-md border p-3 text-sm space-y-1">
                <p>
                  {t("settings.sync.status")}:{" "}
                  {t(`settings.sync.statuses.${syncStatus}`)}
                </p>
                <p>
                  {t("settings.sync.lastSync")}: {formatLastSync(lastSyncAt)}
                </p>
                <p>
                  {t("settings.sync.autoSync")}:{" "}
                  {t("settings.sync.alwaysEnabled")}
                </p>
                <p>
                  {t("settings.sync.realtime")}: {realtimeStatus}
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              <Button type="button" className="w-full" onClick={performSync}>
                {t("settings.sync.manualSync")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.deviceSync.title")}</CardTitle>
              <CardDescription>
                {t("settings.deviceSync.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deviceManagementError && (
                <Alert variant="destructive">
                  <AlertDescription>{deviceManagementError}</AlertDescription>
                </Alert>
              )}

              <Label htmlFor="device-sync-name">
                {t("settings.deviceSync.deviceNameLabel")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="device-sync-name"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  placeholder={t("settings.deviceSync.deviceNamePlaceholder")}
                  aria-label={t("settings.deviceSync.deviceNameLabel")}
                />
                <Button type="button" onClick={() => addDevice("web")}>
                  {t("settings.deviceSync.addDevice")}
                </Button>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <p>
                  {t("settings.deviceSync.group")}:{" "}
                  <b>{mlsState?.groupId ?? "-"}</b>
                </p>
                <p>
                  {t("settings.deviceSync.epoch")}:{" "}
                  <b>{mlsState?.epoch ?? 0}</b>
                </p>
                <p>
                  {t("settings.deviceSync.pendingCommits")}:{" "}
                  <b>{mlsState?.pendingCommits ?? 0}</b>
                </p>
              </div>

              <div className="space-y-2">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div>
                      <p className="font-medium">{device.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {device.platform} · {device.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {device.isCurrent && (
                        <Badge>{t("settings.deviceSync.current")}</Badge>
                      )}
                      {device.isRevoked && (
                        <Badge variant="secondary">
                          {t("settings.deviceSync.revoked")}
                        </Badge>
                      )}
                      {!device.isCurrent && !device.isRevoked && (
                        <Button
                          size="sm"
                          variant="destructive"
                          type="button"
                          onClick={() => revokeDevice(device.id)}
                        >
                          {t("settings.deviceSync.remove")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
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

              <div className="space-y-2">
                <Label htmlFor="start-of-day-time">
                  {t("settings.app.startOfDayTime")}
                </Label>
                <Input
                  id="start-of-day-time"
                  type="time"
                  value={startOfDayTime}
                  onChange={(event) =>
                    handleStartOfDayTimeChange(event.target.value)
                  }
                  className="max-w-[200px]"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
