import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { profiles } from "../db/schema";

/**
 * 头像物理存储目录。映射到 URL `/api/avatars/`（见 index.ts 静态托管挂载）。
 * 走 /api 前缀复用 rsbuild 已有反向代理；dev/prod 行为一致。
 *
 * 目录结构：
 *   ./public/avatars/<userId>/original.webp  —— 原图（profile 页用）
 *   ./public/avatars/<userId>/thumb.webp     —— 缩略（Nav、PlayerList 等小尺寸场景用）
 */
const AVATAR_DIR = "./public/avatars";
const AVATAR_URL_PREFIX = "/api/avatars";

/** 默认头像（用户未上传时返回这两个 URL，前端不需要做 fallback） */
const DEFAULT_AVATAR_DIR = "./public/avatars/default";
export const DEFAULT_AVATAR_URL = `${AVATAR_URL_PREFIX}/default/original.webp`;
export const DEFAULT_AVATAR_THUMB_URL = `${AVATAR_URL_PREFIX}/default/thumb.webp`;

/** 允许的输入 MIME 白名单 */
const ALLOWED_INPUT_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/** 单文件最大 4MB —— 比原来 2MB 放宽一点，因为后端会重压缩 */
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/** 原图：长边 ≤ 1024，方形 cover；webp 质量 90 */
const ORIGINAL_SIZE = 1024;
/** 缩略图：方形 128×128，cover 裁剪；webp 质量 80 */
const THUMB_SIZE = 128;

/** 防解码炸弹：拒绝像素数超过这个的输入 */
const MAX_PIXELS = 4096 * 4096;

export class ProfileService {
  getProfile(userId: string) {
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
   * 这里做了"原样字节绝不落地"——所有上传都经 Bun.Image 解码 → 重编码，
   * 自动剥 EXIF / 拒绝 MIME 伪造 / 拒绝解码炸弹。
   */
  async saveAvatarBytes(
    userId: string,
    bytes: Uint8Array | ArrayBuffer | Buffer,
    declaredMime: string,
  ): Promise<{ avatarUrl: string; avatarThumbUrl: string }> {
    if (!ALLOWED_INPUT_MIME.has(declaredMime)) {
      throw new Error(`Unsupported input mime: ${declaredMime}`);
    }

    const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBufferLike);

    // 1) 探一下元数据，做维度上限校验（防解码炸弹）
    const meta = await new Bun.Image(input, { maxPixels: MAX_PIXELS }).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("Invalid image: missing dimensions");
    }
    if (meta.width > 8000 || meta.height > 8000) {
      throw new Error(`Image dimensions too large: ${meta.width}x${meta.height} (max 8000)`);
    }
    if (!(meta.format && ["png", "jpeg", "webp"].includes(meta.format))) {
      throw new Error(`Detected format not allowed: ${meta.format}`);
    }

    // 2) 生成原图 + 缩略两份 buffer。autoOrient 默认 true，自动按 EXIF orientation 校正，
    //    重编码会自动丢弃 EXIF（隐私）
    const [originalBuf, thumbBuf] = await Promise.all([
      new Bun.Image(input, { autoOrient: true })
        .resize(ORIGINAL_SIZE, ORIGINAL_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .buffer(),
      new Bun.Image(input, { autoOrient: true })
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: "fill",
        })
        .webp({ quality: 80 })
        .buffer(),
    ]);

    // 3) 落地
    const userDir = join(AVATAR_DIR, userId);
    await mkdir(userDir, { recursive: true });
    const originalPath = join(userDir, "original.webp");
    const thumbPath = join(userDir, "thumb.webp");
    await Promise.all([Bun.write(originalPath, originalBuf), Bun.write(thumbPath, thumbBuf)]);

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
    await this.updateProfile(userId, { avatarUrl: "", avatarThumbUrl: "" });
  }

  /**
   * 默认头像的 URL 对（用户没上传时返回，前端无需再 fallback）。
   */
  static defaultAvatarUrls(): { avatarUrl: string; avatarThumbUrl: string } {
    return { avatarUrl: DEFAULT_AVATAR_URL, avatarThumbUrl: DEFAULT_AVATAR_THUMB_URL };
  }

  /**
   * 启动期调用一次：确保 default avatar 两个 webp 存在。
   * 文件由构建阶段生成并提交到仓库，这里只做存在性检查。
   */
  static async ensureDefaultAvatars(): Promise<void> {
    await mkdir(DEFAULT_AVATAR_DIR, { recursive: true });
    const original = join(DEFAULT_AVATAR_DIR, "original.webp");
    const thumb = join(DEFAULT_AVATAR_DIR, "thumb.webp");
    if (await Bun.file(original).exists() && await Bun.file(thumb).exists()) return;
    console.warn("[ProfileService] default avatar files missing, run generation script to create them");
  }
}

export const profileService = new ProfileService();
