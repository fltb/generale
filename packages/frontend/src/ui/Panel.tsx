import { type Component, type JSX, Show, splitProps } from "solid-js";

/**
 * Panel —— 房间页反复出现的 `card bg-base-<tone> p-4` + 标题 的便捷封装。
 * 不传 title 时就是个带背景的卡片容器。
 */
export type PanelTone = "base-100" | "base-200" | "base-300";

export interface PanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: JSX.Element;
  /** 标题样式（不同位置标题字号不同，可覆盖） */
  titleClass?: string;
  tone?: PanelTone;
}

export const Panel: Component<PanelProps> = (props) => {
  const [local, rest] = splitProps(props, ["title", "titleClass", "tone", "class", "children"]);

  const cls = () =>
    ["card", `bg-${local.tone ?? "base-200"}`, "p-4", local.class ?? ""]
      .filter(Boolean)
      .join(" ");

  return (
    <div {...rest} class={cls()}>
      <Show when={local.title != null}>
        <div class={local.titleClass ?? "text-md font-medium mb-2"}>{local.title}</div>
      </Show>
      {local.children}
    </div>
  );
};

export default Panel;
