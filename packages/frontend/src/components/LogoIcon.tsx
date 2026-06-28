import type { Component } from "solid-js";
import { useT } from "~/i18n/useT";

interface LogoIconProps {
  size?: number;
}

const LogoIcon: Component<LogoIconProps> = (props) => {
  const { t } = useT();
  const s = () => props.size ?? 32;
  return (
    <svg width={s()} height={s()} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated" role="img" aria-label={t("General E logo")}>
      <title>{t("General E")}</title>
      <rect x="0" y="0" width="32" height="32" rx="4" fill="currentColor" opacity="0.15"/>
      <rect x="4" y="10" width="6" height="14" fill="currentColor"/>
      <rect x="22" y="10" width="6" height="14" fill="currentColor"/>
      <rect x="4" y="6" width="2" height="4" fill="currentColor"/>
      <rect x="8" y="6" width="2" height="4" fill="currentColor"/>
      <rect x="22" y="6" width="2" height="4" fill="currentColor"/>
      <rect x="26" y="6" width="2" height="4" fill="currentColor"/>
      <rect x="12" y="14" width="8" height="10" fill="currentColor"/>
      <rect x="12" y="10" width="2" height="4" fill="currentColor"/>
      <rect x="18" y="10" width="2" height="4" fill="currentColor"/>
      <rect x="14" y="20" width="4" height="4" fill="#1a1424"/>
    </svg>
  );
};

export default LogoIcon;
