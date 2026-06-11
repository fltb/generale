import { type Component, type JSX, splitProps } from "solid-js";

/** Badge primitive —— daisyui `badge` 一族的薄封装。 */
export type BadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "outline";

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "",
  info: "badge-info",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  outline: "badge-outline",
};

export const Badge: Component<BadgeProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "class"]);
  const cls = () =>
    ["badge", VARIANT_CLASS[local.variant ?? "neutral"], local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return <span {...rest} class={cls()} />;
};

export default Badge;
