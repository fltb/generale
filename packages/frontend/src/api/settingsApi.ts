import { api } from "./base";

export async function getSettingsApi(): Promise<Record<string, string>> {
  return api<Record<string, string>>("/api/profile/settings", { method: "GET" });
}

export async function updateSettingsApi(key: string, value: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>("/api/profile/settings", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}
