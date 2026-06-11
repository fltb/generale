import { type Component, type JSX, splitProps } from "solid-js";

/**
 * Button primitive.
 *
 * 当前实现就是 daisyui 的 `btn` 一族类的薄封装——零视觉变化。
 * 将来切像素风时，只改这里（换 9-slice 边框 / 像素字体 / 配色），业务组件不动。
 */
export type ButtonVariant =
  | "neutral"
  | "primary"
  | "secondary"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "ghost";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** daisyui btn-active（用于分段按钮的选中态） */
  active?: boolean;
  outline?: boolean;
  circle?: boolean;
  block?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  neutral: "",
  primary: "btn-primary",
  secondary: "btn-secondary",
  accent: "btn-accent",
  info: "btn-info",
  success: "btn-success",
  warning: "btn-warning",
  error: "btn-error",
  ghost: "btn-ghost",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "active",
    "outline",
    "circle",
    "block",
    "class",
  ]);

  const cls = () =>
    [
      "btn",
      VARIANT_CLASS[local.variant ?? "neutral"],
      SIZE_CLASS[local.size ?? "md"],
      local.active ? "btn-active" : "",
      local.outline ? "btn-outline" : "",
      local.circle ? "btn-circle" : "",
      local.block ? "btn-block" : "",
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  return <button {...rest} class={cls()} />;
};

export default Button;
