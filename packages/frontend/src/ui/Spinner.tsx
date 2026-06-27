import { type Component, type JSX, splitProps } from "solid-js";

/** Spinner primitive —— daisyui `loading loading-spinner` 的薄封装。 */
export interface SpinnerProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = { sm: "loading-sm", md: "loading-md", lg: "loading-lg" } as const;

export const Spinner: Component<SpinnerProps> = (props) => {
  const [local, rest] = splitProps(props, ["size", "class"]);
  const cls = () =>
    ["loading", "loading-spinner", SIZE_CLASS[local.size ?? "md"], local.class ?? ""].filter(Boolean).join(" ");
  return <span {...rest} class={cls()} />;
};

export default Spinner;
