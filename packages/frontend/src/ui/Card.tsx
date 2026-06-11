import { type Component, type JSX, splitProps } from "solid-js";

/**
 * Card primitive —— daisyui `card` 的薄封装。
 * class 透传，保证迁移时零视觉变化；reskin 时统一改这里。
 */
export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const Card: Component<CardProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={["card pixel-border", local.class ?? ""].filter(Boolean).join(" ")} />;
};

export default Card;
