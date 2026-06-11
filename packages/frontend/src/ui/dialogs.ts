/**
 * 确认 / 提示对话框的单一入口。
 *
 * 现在内部就是原生 window.confirm / window.alert —— 行为与之前完全一致（同步、阻塞）。
 * 之所以收口到这里，是为了将来换像素风时只在这一处替换成自绘的模态对话框，
 * 而不必去改每个调用点（投降确认、删除队伍确认、建队提示等）。
 */

/** 确认对话框；用户点确定返回 true。 */
export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}

/** 提示对话框。 */
export function alertDialog(message: string): void {
  window.alert(message);
}
