import { useT } from "~/i18n/useT";
import { type Component, type JSX, splitProps } from "solid-js";

/**
 * Overlay —— 铺满视口的居中浮层。
 * 用 fixed + z-50（相对视口铺满，覆盖在房间组件 / chat 浮窗 / pixi 容器之上；
 * 用 absolute 会受无 position 的祖先影响导致覆盖不全）。
 */
export interface OverlayProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** 背景遮罩透明度（tailwind bg-black/<dim>） */
  dim?: 60 | 70;
}

export const Overlay: Component<OverlayProps> = (props) => {
  const [local, rest] = splitProps(props, ["dim", "class", "children"]);
  const cls = () =>
    [
      "fixed inset-0 z-50",
      `bg-black/${local.dim ?? 70}`,
      "flex flex-col items-center justify-center text-white px-6",
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <div {...rest} class={cls()}>
      {local.children}
    </div>
  );
};

/**
 * TakeoverOverlay —— "该页面已被同账号的另一个标签页/设备接管" 提示。
 * 原先在 Room.tsx 和 Game.tsx 里各复制了一份，现统一。
 */
export interface TakeoverOverlayProps {
  /** 场景词：房间 / 游戏 */
  scope?: string;
  dim?: 60 | 70;
}

export const TakeoverOverlay: Component<TakeoverOverlayProps> = (props) => {
  const { t } = useT();
  return (
    <Overlay dim={props.dim ?? 70}>
      <h2 class="text-3xl font-bold mb-3">{t("该页面已被接管")}</h2>
      <p class="opacity-80 mb-4 text-center max-w-md">
        {t("你的账号在另一个标签页或设备上打开了这个{scope}，所有操作都将在那一边进行。", { scope: props.scope ?? t("房间") })}
      </p>
      <p class="text-sm opacity-60">{t("关掉这个页面或刷新可重新接管")}</p>
    </Overlay>
  );
};

export default Overlay;
