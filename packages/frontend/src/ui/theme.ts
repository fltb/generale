/**
 * UI 语义 token。
 *
 * 目前 primitives 直接用 daisyui 类，token 还很少；这里作为将来像素风重皮肤时
 * 颜色 / 间距 / 字体的集中落点。把硬编码的语义颜色逐步搬进来，reskin 时只改此文件。
 */
export const uiTheme = {
  /** 结算 overlay 的标题强调色（赢 / 输） */
  outcome: {
    won: "text-amber-300",
    lost: "text-rose-300",
  },
} as const;

export type UiTheme = typeof uiTheme;
