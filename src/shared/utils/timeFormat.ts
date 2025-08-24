import { TFunction } from "i18next";

export function formatTimeAgo(
  date: Date,
  now: Date,
  t: TFunction,
  locale: string
): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 10) {
    return t("time.justNow");
  }
  if (diffSeconds < 60) {
    return t("time.secondsAgo", { count: diffSeconds });
  }
  if (diffMinutes < 60) {
    return t("time.minutesAgo", { count: diffMinutes });
  }
  if (diffHours < 24) {
    return t("time.hoursAgo", { count: diffHours });
  }
  if (diffDays < 3) {
    return t("time.daysAgo", { count: diffDays });
  }

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
  };
  if (date.getFullYear() < now.getFullYear()) {
    options.year = "numeric";
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}
