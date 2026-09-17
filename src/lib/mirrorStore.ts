import type { SplitResult } from '../types'

const DB_NAME = 'kern-registro'
const STORE_NAME = 'espelhos'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('employeePeriod', ['employeeCode', 'periodStart', 'periodEnd'], { unique: false })
        store.createIndex('registeredAt', 'registeredAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Falha ao abrir o armazenamento local.'))
  })
}

function cloneForStorage(item: SplitResult) {
  const bytes = new Uint8Array(item.bytes.byteLength)
  bytes.set(item.bytes)
  return { ...item, bytes }
}

export async function saveMirrors(items: SplitResult[]) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const item of items) store.put(cloneForStorage(item))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Falha ao registrar os espelhos.'))
    tx.onabort = () => reject(tx.error || new Error('Registro dos espelhos cancelado.'))
  })
  db.close()
}

export async function listMirrors(): Promise<SplitResult[]> {
  const db = await openDb()
  const values = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error || new Error('Falha ao listar os espelhos.'))
  })
  db.close()
  return values
    .map((value) => ({
      ...value,
      bytes: value.bytes instanceof Uint8Array ? value.bytes : new Uint8Array(value.bytes),
    }))
    .sort((a, b) => String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')))
}

export async function updateMirror(item: SplitResult) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(cloneForStorage(item))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar o espelho.'))
  })
  db.close()
}

export async function deleteMirror(id: string) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Falha ao excluir o espelho.'))
  })
  db.close()
}

export async function clearMirrors() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar os espelhos.'))
  })
  db.close()
}
