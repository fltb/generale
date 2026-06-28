import type { JSX } from "solid-js";

/**
 * 通用头像组件。纯 <img> 的薄包装：
 *  - 处理圆形裁剪 + 固定尺寸 + object-cover
 *  - 当 src 为空时自动使用 DiceBear Pixel Art 生成头像
 */
export interface AvatarProps {
  src?: string;
  /** 头像直径，px，默认 40 */
  size?: number;
  /** 额外 class（合并到最外层 div） */
  class?: string;
  alt?: string;
}

export function Avatar(props: AvatarProps): JSX.Element {
  const size = () => props.size ?? 40;
  const avatarSrc = () => {
    if (props.src) return props.src;
    const seed = encodeURIComponent(props.alt ?? "default");
    return `https://api.dicebear.com/10.x/pixel-art/svg?seed=${seed}`;
  };
  return (
    <div
      class={`inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-base-300 ${props.class ?? ""}`}
      style={{ width: `${size()}px`, height: `${size()}px` }}
    >
      <img src={avatarSrc()} alt={props.alt ?? "avatar"} class="object-cover w-full h-full" loading="lazy" />
    </div>
  );
}

export default Avatar;
