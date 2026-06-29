import { api } from "./base";

export function getSettingsApi(): Promise<Record<string, string>> {
  return api<Record<string, string>>("/api/profile/settings", { method: "GET" });
}

export function updateSettingsApi(key: string, value: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>("/api/profile/settings", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}
