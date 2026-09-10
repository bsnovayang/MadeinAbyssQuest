import type { MetaState } from '../core/meta'
import type { RunState } from '../core/types'

export interface SaveData {
  version: 1
  meta: MetaState
  run: RunState | null
}

const DB_NAME = 'madeinabyss-quest'
const STORE = 'save'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveGame(data: SaveData): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(structuredClone(data), KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // 存檔失敗不該中斷遊戲（無痕視窗、封鎖網站資料等情況）
  }
}

export async function loadGame(): Promise<SaveData | null> {
  try {
    const db = await openDb()
    const data = await new Promise<SaveData | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as SaveData | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return data?.version === 1 ? data : null
  } catch {
    return null
  }
}

export async function clearGame(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // 同上
  }
}
