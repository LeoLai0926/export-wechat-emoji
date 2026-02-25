import type { ISelectOption } from '../types'
import { BaseDirectory, exists, readDir } from '@tauri-apps/api/fs'
import { fileMtimeMs } from './system'

// Legacy (WeChat 3.x and earlier) path root. Real data lives in versioned subdirs like `2.0b4.0.9`.
export const WECHAT_LEGACY_BASE_DIR =
  'Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat'

// WeChat 4.x path root. Each account is a `wxid_*` dir.
export const WECHAT_V4_BASE_DIR =
  'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files'

export type EmojiTarget =
  | { kind: 'legacy'; versionDir: string; userDir: string }
  | { kind: 'v4'; wxidDir: string }

export type EmojiTargetMeta =
  | {
      kind: 'v4'
      wxidDir: string
      emoticonDbPath: string
      mtimeMs: number | null
    }
  | {
      kind: 'legacy'
      versionDir: string
      userDir: string
      favArchivePath: string
      mtimeMs: number | null
    }

export function encodeEmojiTarget(target: EmojiTarget): string {
  if (target.kind === 'legacy') {
    return `legacy|${target.versionDir}|${target.userDir}`
  }
  return `v4|${target.wxidDir}`
}

export function parseEmojiTarget(value: string): EmojiTarget | null {
  if (!value) {
    return null
  }
  const parts = value.split('|')
  if (parts[0] === 'legacy' && parts.length === 3) {
    return { kind: 'legacy', versionDir: parts[1], userDir: parts[2] }
  }
  if (parts[0] === 'v4' && parts.length === 2) {
    return { kind: 'v4', wxidDir: parts[1] }
  }
  return null
}

export function legacyFavArchivePath(target: {
  versionDir: string
  userDir: string
}): string {
  return `${WECHAT_LEGACY_BASE_DIR}/${target.versionDir}/${target.userDir}/Stickers/fav.archive`
}

export function v4EmoticonDbPath(target: { wxidDir: string }): string {
  return `${WECHAT_V4_BASE_DIR}/${target.wxidDir}/db_storage/emoticon/emoticon.db`
}

export async function findEmojiTargets(): Promise<Array<ISelectOption>> {
  const out: Array<ISelectOption> = []

  // WeChat 4.x
  try {
    const dirs = await readDir(WECHAT_V4_BASE_DIR, {
      dir: BaseDirectory.Home,
      recursive: false
    })
    for (const dir of dirs) {
      const name = dir?.name || ''
      if (!name || name === 'all_users' || !name.startsWith('wxid_')) {
        continue
      }
      const emoticonDb = v4EmoticonDbPath({ wxidDir: name })
      const ok = await exists(emoticonDb, { dir: BaseDirectory.Home })
      if (ok) {
        out.push({
          label: `新版微信（4.x）: ${name}`,
          value: encodeEmojiTarget({ kind: 'v4', wxidDir: name })
        })
      }
    }
  } catch {
    // Ignore: WeChat 4.x folder may not exist on this machine.
  }

  // Legacy WeChat (3.x and earlier)
  try {
    const versionDirs = await readDir(WECHAT_LEGACY_BASE_DIR, {
      dir: BaseDirectory.Home,
      recursive: false
    })
    for (const version of versionDirs) {
      const versionName = version?.name || ''
      if (!versionName) {
        continue
      }
      const versionPath = `${WECHAT_LEGACY_BASE_DIR}/${versionName}`
      let subdirs: Awaited<ReturnType<typeof readDir>> = []
      try {
        subdirs = await readDir(versionPath, {
          dir: BaseDirectory.Home,
          recursive: false
        })
      } catch {
        continue
      }

      const maybeUserDirs = subdirs.filter((d) => (d?.name || '').length === 32)
      for (const user of maybeUserDirs) {
        const userName = user?.name || ''
        if (!userName) {
          continue
        }
        const fav = legacyFavArchivePath({
          versionDir: versionName,
          userDir: userName
        })
        const ok = await exists(fav, { dir: BaseDirectory.Home })
        if (ok) {
          out.push({
            label: `旧版微信（${versionName}）: ${userName}`,
            value: encodeEmojiTarget({
              kind: 'legacy',
              versionDir: versionName,
              userDir: userName
            })
          })
        }
      }
    }
  } catch {
    // Ignore: legacy folder may not exist.
  }

  return out
}

export async function findEmojiTargetsWithMeta(): Promise<
  Array<EmojiTargetMeta>
> {
  const out: Array<EmojiTargetMeta> = []

  // WeChat 4.x
  try {
    const dirs = await readDir(WECHAT_V4_BASE_DIR, {
      dir: BaseDirectory.Home,
      recursive: false
    })
    for (const dir of dirs) {
      const name = dir?.name || ''
      if (!name || name === 'all_users' || !name.startsWith('wxid_')) {
        continue
      }
      const emoticonDb = v4EmoticonDbPath({ wxidDir: name })
      const ok = await exists(emoticonDb, { dir: BaseDirectory.Home })
      if (!ok) {
        continue
      }
      const mtimeMs = await fileMtimeMs(`~/${emoticonDb}`)
      out.push({
        kind: 'v4',
        wxidDir: name,
        emoticonDbPath: emoticonDb,
        mtimeMs
      })
    }
  } catch {
    // Ignore: WeChat 4.x folder may not exist on this machine.
  }

  // Legacy WeChat (3.x and earlier)
  try {
    const versionDirs = await readDir(WECHAT_LEGACY_BASE_DIR, {
      dir: BaseDirectory.Home,
      recursive: false
    })
    for (const version of versionDirs) {
      const versionName = version?.name || ''
      if (!versionName) {
        continue
      }
      const versionPath = `${WECHAT_LEGACY_BASE_DIR}/${versionName}`
      let subdirs: Awaited<ReturnType<typeof readDir>> = []
      try {
        subdirs = await readDir(versionPath, {
          dir: BaseDirectory.Home,
          recursive: false
        })
      } catch {
        continue
      }

      const maybeUserDirs = subdirs.filter((d) => (d?.name || '').length === 32)
      for (const user of maybeUserDirs) {
        const userName = user?.name || ''
        if (!userName) {
          continue
        }
        const fav = legacyFavArchivePath({
          versionDir: versionName,
          userDir: userName
        })
        const ok = await exists(fav, { dir: BaseDirectory.Home })
        if (!ok) {
          continue
        }
        const mtimeMs = await fileMtimeMs(`~/${fav}`)
        out.push({
          kind: 'legacy',
          versionDir: versionName,
          userDir: userName,
          favArchivePath: fav,
          mtimeMs
        })
      }
    }
  } catch {
    // Ignore: legacy folder may not exist.
  }

  return out
}
