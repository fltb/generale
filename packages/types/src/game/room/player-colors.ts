// 玩家可选颜色常量与类型，最大 16 人，每人颜色唯一

export const PLAYER_COLOR_PALETTE: number[] = [
  0x2f4f4f, // darkslategray
  0x800000, // maroon
  0x808000, // olive
  0x00008b, // darkblue
  0xff0000, // red
  0xffa500, // orange
  0x7cfc00, // lawngreen
  0xe9967a, // darksalmon
  0x0000ff, // blue
  0xff00ff, // fuchsia
  0x1e90ff, // dodgerblue
  0xffff54, // laserlemon
  0xdda0dd, // plum
  0xb0e0e6, // powderblue
  0x90ee90, // lightgreen
  0xff1493, // deeppink
];

export type PlayerColor = typeof PLAYER_COLOR_PALETTE[number];
