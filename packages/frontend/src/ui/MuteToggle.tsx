import type { Component } from "solid-js";
import { isMuted, toggleMuted } from "./sound";
import { useT } from "~/i18n/useT";

/** 音效开关（喇叭图标）。点击切换全局静音并持久化。 */
export const MuteToggle: Component<{ class?: string }> = (props) => {
  const { t } = useT();
  return (
    <button
      type="button"
      class={`px-2 py-1 ${props.class ?? ""}`}
      title={isMuted() ? t("Enable sound") : t("Mute")}
      aria-label={isMuted() ? t("Enable sound") : t("Mute")}
      onClick={() => toggleMuted()}
    >
      <span class="text-lg">{isMuted() ? "🔇" : "🔊"}</span>
    </button>
  );
};

export default MuteToggle;
