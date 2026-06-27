import { type Component, type JSX, splitProps } from "solid-js";

/** Select primitive —— daisyui `select` 的薄封装。 */
export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  size?: "xs" | "sm" | "md";
  bordered?: boolean;
}

const SIZE_CLASS = { xs: "select-xs", sm: "select-sm", md: "" } as const;

export const Select: Component<SelectProps> = (props) => {
  const [local, rest] = splitProps(props, ["size", "bordered", "class", "children"]);
  const cls = () =>
    ["select pixel-border", SIZE_CLASS[local.size ?? "md"], local.bordered ? "select-bordered" : "", local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return (
    <select {...rest} class={cls()}>
      {local.children}
    </select>
  );
};

export default Select;
