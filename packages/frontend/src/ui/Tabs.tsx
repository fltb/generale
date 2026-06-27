import { type Component, type JSX, splitProps } from "solid-js";

export interface TabsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

export const Tabs: Component<TabsProps> = (props) => {
  const [local, rest] = splitProps(props, ["bordered", "class"]);
  const cls = () =>
    ["tabs", local.bordered ? "tabs-bordered" : "", local.class ?? ""].filter(Boolean).join(" ");
  return <div {...rest} class={cls()} />;
};

export interface TabProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
}

export const Tab: Component<TabProps> = (props) => {
  const [local, rest] = splitProps(props, ["active", "class"]);
  const cls = () =>
    ["tab", local.active ? "tab-active" : "", local.class ?? ""].filter(Boolean).join(" ");
  return <a {...rest} class={cls()} />;
};
