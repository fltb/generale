import { type JSX } from "solid-js";

/**
 * 通用头像组件。纯 <img> 的薄包装：
 *  - 处理圆形裁剪 + 固定尺寸 + object-cover
 *  - 不做颜色 / 首字母 fallback（后端在用户没上传时也会返回 default avatar URL，
 *    所以 src 永远存在；不要在前端再做一套占位逻辑）
 *
 * 用法：
 *   <Avatar src={user.avatarThumbUrl} size={32} alt={user.username} />
 */
export interface AvatarProps {
  src: string;
  /** 头像直径，px，默认 40 */
  size?: number;
  /** 额外 class（合并到最外层 div） */
  class?: string;
  alt?: string;
}

export function Avatar(props: AvatarProps): JSX.Element {
  const size = () => props.size ?? 40;
  return (
    <div
      class={`inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-base-300 ${props.class ?? ""}`}
      style={{ width: `${size()}px`, height: `${size()}px` }}
    >
      <img
        src={props.src}
        alt={props.alt ?? "avatar"}
        class="object-cover w-full h-full"
        loading="lazy"
      />
    </div>
  );
}

export default Avatar;
