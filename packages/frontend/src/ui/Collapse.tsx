import { type Component, type JSX, splitProps } from "solid-js";

export interface CollapseProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** show the collapse-arrow indicator */
  arrow?: boolean;
}

export const Collapse: Component<CollapseProps> = (props) => {
  const [local, rest] = splitProps(props, ["arrow", "class", "children"]);
  const cls = () =>
    ["collapse pixel-border", local.arrow ? "collapse-arrow" : "", local.class ?? ""].filter(Boolean).join(" ");
  return (
    <div {...rest} class={cls()}>
      {local.children}
    </div>
  );
};

export const CollapseTitle: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={["collapse-title", local.class ?? ""].filter(Boolean).join(" ")} />;
};

export const CollapseContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={["collapse-content", local.class ?? ""].filter(Boolean).join(" ")} />;
};
