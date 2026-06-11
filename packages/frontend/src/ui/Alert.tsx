import { type Component, type JSX, splitProps } from "solid-js";

/** Alert primitive —— daisyui `alert` 一族的薄封装。 */
export type AlertVariant = "neutral" | "info" | "success" | "warning" | "error";

export interface AlertProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const VARIANT_CLASS: Record<AlertVariant, string> = {
  neutral: "",
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

export const Alert: Component<AlertProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "class"]);
  const cls = () =>
    ["alert", VARIANT_CLASS[local.variant ?? "neutral"], local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return <div {...rest} class={cls()} />;
};

export default Alert;
