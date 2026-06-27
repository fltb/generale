import { type Component, type JSX, splitProps } from "solid-js";

export interface CheckboxProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZE_CLASS = { xs: "checkbox-xs", sm: "checkbox-sm", md: "", lg: "checkbox-lg" } as const;

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ["size", "class"]);
  const cls = () =>
    ["checkbox", SIZE_CLASS[local.size ?? "md"], local.class ?? ""].filter(Boolean).join(" ");
  return <input type="checkbox" {...rest} class={cls()} />;
};
