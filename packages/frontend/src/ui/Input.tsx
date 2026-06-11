import { type Component, type JSX, splitProps } from "solid-js";

/** Input primitive —— daisyui `input` 的薄封装。 */
export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  size?: "xs" | "sm" | "md";
  bordered?: boolean;
}

const SIZE_CLASS = { xs: "input-xs", sm: "input-sm", md: "" } as const;

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ["size", "bordered", "class"]);
  const cls = () =>
    ["input pixel-border", SIZE_CLASS[local.size ?? "md"], local.bordered ? "input-bordered" : "", local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return <input {...rest} class={cls()} />;
};

export default Input;
