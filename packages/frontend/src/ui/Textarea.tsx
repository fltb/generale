import { type Component, type JSX, splitProps } from "solid-js";

/** Textarea primitive —— daisyui `textarea` 的薄封装。 */
export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  bordered?: boolean;
}

export const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ["bordered", "class"]);
  const cls = () =>
    ["textarea pixel-border", local.bordered ? "textarea-bordered" : "", local.class ?? ""]
      .filter(Boolean)
      .join(" ");
  return <textarea {...rest} class={cls()} />;
};

export default Textarea;
