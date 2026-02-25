import { invoke } from '@tauri-apps/api/tauri'

export type WeChatRunningCheck = {
  running: boolean
  matches: Array<string>
}

export async function checkWeChatRunning(
  wechatAppPath?: string
): Promise<WeChatRunningCheck> {
  return await invoke<WeChatRunningCheck>('check_wechat_running', {
    wechatAppPath
  })
}

export async function fileMtimeMs(path: string): Promise<number | null> {
  return await invoke<number | null>('file_mtime_ms', { path })
}
