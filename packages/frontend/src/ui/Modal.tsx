import { type Component, type JSX, splitProps } from "solid-js";

/**
 * Modal primitive —— daisyui `modal modal-open` + `modal-box` 的薄封装。
 * 可见性由调用方用 <Show> 控制挂载（与现有用法一致）。
 */
export interface ModalProps {
  /** modal-box 的额外类（如 max-w-2xl） */
  boxClass?: string;
  children?: JSX.Element;
}

export const Modal: Component<ModalProps> = (props) => {
  const [local] = splitProps(props, ["boxClass", "children"]);
  return (
    <div class="modal modal-open">
      <div class={["modal-box pixel-border", local.boxClass ?? ""].filter(Boolean).join(" ")}>
        {local.children}
      </div>
    </div>
  );
};

export default Modal;
