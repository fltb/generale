import { type Component, type JSX, splitProps } from "solid-js";

/** Range primitive —— daisyui `range` 的薄封装。 */
export interface RangeProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  variant?: "neutral" | "primary";
}

export const Range: Component<RangeProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "class"]);
  const cls = () =>
    ["range", local.variant === "primary" ? "range-primary" : "", local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return <input type="range" {...rest} class={cls()} />;
};

export default Range;
