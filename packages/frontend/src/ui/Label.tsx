import { type Component, type JSX, Show, splitProps } from "solid-js";

export interface LabelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  text?: string;
  alt?: string;
}

export const Label: Component<LabelProps> = (props) => {
  const [local, rest] = splitProps(props, ["text", "alt", "class", "children"]);
  const cls = () => ["label", local.class ?? ""].filter(Boolean).join(" ");
  return (
    <div {...rest} class={cls()}>
      {local.children}
      <Show when={local.text}>
        <span class="label-text">{local.text}</span>
      </Show>
      <Show when={local.alt}>
        <span class="label-text-alt">{local.alt}</span>
      </Show>
    </div>
  );
};

export const LabelText: Component<JSX.HTMLAttributes<HTMLSpanElement>> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return <span {...rest} class={["label-text", local.class ?? ""].filter(Boolean).join(" ")} />;
};

export const LabelTextAlt: Component<JSX.HTMLAttributes<HTMLSpanElement>> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return <span {...rest} class={["label-text-alt", local.class ?? ""].filter(Boolean).join(" ")} />;
};
