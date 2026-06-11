/**
 * 极简 chiptune 音效层。
 *
 * 全部用 WebAudio 实时合成方波/三角波，**不依赖任何音频资源文件**，
 * 因此零素材依赖即可给交互加"街机音效"。AudioContext 在首次播放（用户手势内）
 * 时惰性创建，符合浏览器自动播放策略。
 *
 * 静音状态持久化在 localStorage，供右上角喇叭开关使用。
 */
import { createSignal } from "solid-js";

const MUTE_KEY = "generale.muted";

const initialMuted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
})();

const [muted, setMutedSignal] = createSignal(initialMuted);

export const isMuted = muted;
export function setMuted(v: boolean) {
  setMutedSignal(v);
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { }
}
export function toggleMuted() { setMuted(!muted()); }

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (muted()) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Wave = "square" | "triangle" | "sawtooth" | "sine";

/** 播放一个简单的衰减音符 */
function tone(freq: number, dur: number, opts: { type?: Wave; when?: number; gain?: number } = {}) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.when ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(freq, t0);
  const peak = opts.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 播放一串音符（旋律） */
function melody(notes: Array<[freq: number, dur: number]>, opts: { type?: Wave; gain?: number } = {}) {
  let when = 0;
  for (const [freq, dur] of notes) {
    tone(freq, dur, { type: opts.type, when, gain: opts.gain });
    when += dur;
  }
}

// 音名 → 频率（够用的几个）
const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5,
};

export const sfx = {
  /** 通用按钮咔哒 */
  click() { tone(660, 0.05, { type: "square", gain: 0.12 }); },
  /** 准备就绪：上行两音 */
  ready() { melody([[N.E5, 0.07], [N.G5, 0.11]], { type: "square", gain: 0.16 }); },
  /** 取消准备：下行 */
  unready() { melody([[N.G4, 0.07], [N.D4, 0.1]], { type: "square", gain: 0.13 }); },
  /** 倒计时滴答 */
  countdownBeep() { tone(N.A4, 0.12, { type: "square", gain: 0.18 }); },
  /** 开战！ */
  go() { melody([[N.C5, 0.08], [N.E5, 0.08], [N.G5, 0.18]], { type: "square", gain: 0.2 }); },
  /** 占领格子：短促上行（地图迭代会用到） */
  capture() { tone(N.C5, 0.05, { type: "square", gain: 0.1 }); },
  /** 夺取王座：重音 */
  throne() { melody([[N.C5, 0.06], [N.G5, 0.06], [N.C6, 0.16]], { type: "square", gain: 0.22 }); },
  /** 胜利号角 */
  victory() {
    melody([[N.C5, 0.14], [N.E5, 0.14], [N.G5, 0.14], [N.C6, 0.34]], { type: "square", gain: 0.2 });
  },
  /** 失败哀号：下行 */
  defeat() {
    melody([[N.G4, 0.16], [N.F4, 0.16], [N.D4, 0.16], [N.C4, 0.4]], { type: "triangle", gain: 0.2 });
  },
};

export default sfx;
