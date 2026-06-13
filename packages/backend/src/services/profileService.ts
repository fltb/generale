import { db } from '../db/client';
import { profiles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * 头像物理存储目录。映射到 URL `/api/avatars/`（见 index.ts 静态托管挂载）。
 * 走 /api 前缀复用 rsbuild 已有反向代理；dev/prod 行为一致。
 *
 * 目录结构：
 *   ./public/avatars/<userId>/original.webp  —— 原图（profile 页用）
 *   ./public/avatars/<userId>/thumb.webp     —— 缩略（Nav、PlayerList 等小尺寸场景用）
 */
const AVATAR_DIR = './public/avatars';
const AVATAR_URL_PREFIX = '/api/avatars';

/** 默认头像（用户未上传时返回这两个 URL，前端不需要做 fallback） */
const DEFAULT_AVATAR_DIR = './public/avatars/default';
export const DEFAULT_AVATAR_URL = `${AVATAR_URL_PREFIX}/default/original.webp`;
export const DEFAULT_AVATAR_THUMB_URL = `${AVATAR_URL_PREFIX}/default/thumb.webp`;

/** 允许的输入 MIME 白名单（sharp 自己也会拒非图片，但提前 reject 错误更友好） */
const ALLOWED_INPUT_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** 单文件最大 4MB —— 比原来 2MB 放宽一点，因为后端会重压缩 */
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/** 原图：长边 ≤ 1024，方形 cover；webp 质量 90 */
const ORIGINAL_SIZE = 1024;
/** 缩略图：方形 128×128，cover 裁剪；webp 质量 80 */
const THUMB_SIZE = 128;

/** 防解码炸弹：拒绝维度超过这个的输入 */
const MAX_INPUT_DIMENSION = 8000;

export class ProfileService {
  async getProfile(userId: string) {
    return db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  }

  async updateBio(userId: string, bio: string) {
    const now = new Date();
    await db
      .insert(profiles)
      .values({ userId, bio, updatedAt: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { bio, updatedAt: now },
      })
      .run();
  }

  async updateDisplayName(userId: string, displayName: string) {
    const now = new Date();
    await db
      .insert(profiles)
      .values({ userId, displayName, updatedAt: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { displayName, updatedAt: now },
      })
      .run();
  }

  async updateProfile(
    userId: string,
    updates: Partial<{
      displayName: string;
      bio: string;
      avatarUrl: string;
      avatarThumbUrl: string;
    }>,
  ) {
    const now = new Date();
    await db
      .insert(profiles)
      .values({ userId, ...updates, updatedAt: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { ...updates, updatedAt: now },
      })
      .run();
  }

  /**
   * 把头像字节解码、校验、重新编码为原图 + 缩略两份 webp 落地，
   * 更新 DB 里的 avatarUrl / avatarThumbUrl 并返回两个 URL。
   *
   * 这里做了"原样字节绝不落地"——所有上传都经 sharp 解码 → 重编码，
   * 自动剥 EXIF / 拒绝 MIME 伪造 / 拒绝解码炸弹。
   *
   * 抽象在这里是为将来要换 R2/S3 时只改这个方法。
   */
  async saveAvatarBytes(
    userId: string,
    bytes: Uint8Array | ArrayBuffer | Buffer,
    declaredMime: string,
  ): Promise<{ avatarUrl: string; avatarThumbUrl: string }> {
    if (!ALLOWED_INPUT_MIME.has(declaredMime)) {
      throw new Error(`Unsupported input mime: ${declaredMime}`);
    }

    const input = Buffer.isBuffer(bytes)
      ? bytes
      : Buffer.from(bytes as ArrayBufferLike);

    // 1) 探一下元数据，做维度上限校验（防解码炸弹）
    let meta: sharp.Metadata;
    try {
      meta = await sharp(input).metadata();
    } catch (e: any) {
      throw new Error(`Invalid image: ${e?.message ?? e}`);
    }
    if (!meta.width || !meta.height) {
      throw new Error('Invalid image: missing dimensions');
    }
    if (meta.width > MAX_INPUT_DIMENSION || meta.height > MAX_INPUT_DIMENSION) {
      throw new Error(
        `Image dimensions too large: ${meta.width}x${meta.height} (max ${MAX_INPUT_DIMENSION})`,
      );
    }
    // sharp 解出来的 format 可以再校一遍，比 declaredMime 更可信
    if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
      throw new Error(`Detected format not allowed: ${meta.format}`);
    }

    // 2) 生成原图 + 缩略两份 buffer。两者都先 .rotate() 按 EXIF orientation 校正，
    //    然后重编码会自动丢弃 EXIF（隐私）
    const [originalBuf, thumbBuf] = await Promise.all([
      sharp(input)
        .rotate()
        .resize(ORIGINAL_SIZE, ORIGINAL_SIZE, {
          fit: 'cover',
          withoutEnlargement: true, // 不放大：小图保留原始分辨率
        })
        .webp({ quality: 90 })
        .toBuffer(),
      sharp(input)
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: 'cover',
          withoutEnlargement: false, // 缩略一律强制到 128，小图也放大
        })
        .webp({ quality: 80 })
        .toBuffer(),
    ]);

    // 3) 落地
    const userDir = join(AVATAR_DIR, userId);
    await mkdir(userDir, { recursive: true });
    const originalPath = join(userDir, 'original.webp');
    const thumbPath = join(userDir, 'thumb.webp');
    await Promise.all([
      Bun.write(originalPath, originalBuf as any),
      Bun.write(thumbPath, thumbBuf as any),
    ]);

    // 4) URL 加 ?v=<ms> 缓存破
    const v = Date.now();
    const avatarUrl = `${AVATAR_URL_PREFIX}/${userId}/original.webp?v=${v}`;
    const avatarThumbUrl = `${AVATAR_URL_PREFIX}/${userId}/thumb.webp?v=${v}`;
    await this.updateProfile(userId, { avatarUrl, avatarThumbUrl });
    return { avatarUrl, avatarThumbUrl };
  }

  /** 删除用户的整个头像目录（包含原图 + 缩略）。当前没暴露 UI，先留接口。 */
  async deleteAvatar(userId: string): Promise<void> {
    const userDir = join(AVATAR_DIR, userId);
    await rm(userDir, { recursive: true, force: true });
    await this.updateProfile(userId, { avatarUrl: '', avatarThumbUrl: '' });
  }

  /**
   * 默认头像的 URL 对（用户没上传时返回，前端无需再 fallback）。
   *
   * 没提供"按 userId 一步拿头像 URL"的便捷方法是故意的：调用方通常会同时还需要
   * displayName / bio 等字段，那种 helper 会诱使在同一次请求里调两次 getProfile。
   * 直接在调用端 `profile?.avatarUrl || defaults.avatarUrl` 一行就够了。
   */
  static defaultAvatarUrls(): { avatarUrl: string; avatarThumbUrl: string } {
    return { avatarUrl: DEFAULT_AVATAR_URL, avatarThumbUrl: DEFAULT_AVATAR_THUMB_URL };
  }

  /**
   * 启动期调用一次：确保 default avatar 两个 webp 存在。
   *
   * 不依赖任何位图资源 —— 用 sharp 把一段 SVG（灰底 + 人头剪影）渲染成 webp。
   * 这样 repo 里就不需要 commit 二进制文件，部署起来也不会因为漏文件就 404。
   */
  static async ensureDefaultAvatars(): Promise<void> {
    await mkdir(DEFAULT_AVATAR_DIR, { recursive: true });

    const variants: Array<{ filename: string; size: number; quality: number }> = [
      { filename: 'original.webp', size: ORIGINAL_SIZE, quality: 90 },
      { filename: 'thumb.webp', size: THUMB_SIZE, quality: 80 },
    ];

    for (const v of variants) {
      const path = join(DEFAULT_AVATAR_DIR, v.filename);
      if (await Bun.file(path).exists()) continue;

      const s = v.size;
      // 灰底 + 简化人头剪影；尺寸跟变体一致避免后续再 resize
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="100%" height="100%" fill="#cbd5e1"/>
  <circle cx="${s / 2}" cy="${s * 0.4}" r="${s * 0.18}" fill="#94a3b8"/>
  <path d="M ${s * 0.18} ${s * 0.95} Q ${s / 2} ${s * 0.55} ${s * 0.82} ${s * 0.95} L ${s * 0.82} ${s} L ${s * 0.18} ${s} Z" fill="#94a3b8"/>
</svg>`;
      const buf = await sharp(Buffer.from(svg))
        .webp({ quality: v.quality })
        .toBuffer();
      await Bun.write(path, buf as any);
      console.info(`[ProfileService] default avatar generated: ${path}`);
    }
  }
}

export const profileService = new ProfileService();
