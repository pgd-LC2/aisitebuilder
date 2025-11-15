const DB_NAME = 'aisitebuilder-prebuilt';
const STORE_NAME = 'node-modules-snapshots';
const DB_VERSION = 2;
const MAX_PERSISTED_RECORDS = 2;

type CacheRecord = {
  key: string;
  data: string; // base64
  timestamp: number;
};

const inMemoryCache = new Map<string, Uint8Array>();

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

const encodeBinary = (value: Uint8Array) => {
  let output = '';
  for (let i = 0; i < value.length; i += 3) {
    const byte1 = value[i];
    const byte2 = i + 1 < value.length ? value[i + 1] : 0;
    const byte3 = i + 2 < value.length ? value[i + 2] : 0;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 0x3f;

    if (i + 1 >= value.length) {
      output += `${BASE64_ALPHABET[enc1]}${BASE64_ALPHABET[enc2]}==`;
    } else if (i + 2 >= value.length) {
      output += `${BASE64_ALPHABET[enc1]}${BASE64_ALPHABET[enc2]}${BASE64_ALPHABET[enc3]}=`;
    } else {
      output += `${BASE64_ALPHABET[enc1]}${BASE64_ALPHABET[enc2]}${BASE64_ALPHABET[enc3]}${BASE64_ALPHABET[enc4]}`;
    }
  }
  return output;
};

const decodeBinary = (value: string) => {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = BASE64_ALPHABET.indexOf(clean[i]);
    const enc2 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const enc3 = BASE64_ALPHABET.indexOf(clean[i + 2]);
    const enc4 = BASE64_ALPHABET.indexOf(clean[i + 3]);

    const byte1 = (enc1 << 2) | (enc2 >> 4);
    const byte2 = ((enc2 & 0x0f) << 4) | (enc3 >> 2);
    const byte3 = ((enc3 & 0x03) << 6) | enc4;

    bytes.push(byte1);
    if (enc3 !== 64) {
      bytes.push(byte2);
    }
    if (enc4 !== 64) {
      bytes.push(byte3);
    }
  }
  return new Uint8Array(bytes);
};

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isBrowserEnvironment()) {
      reject(new Error('indexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (db.objectStoreNames.contains('node-modules-cache')) {
        db.deleteObjectStore('node-modules-cache');
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

const persistRecord = async (record: CacheRecord) => {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await cleanupOldRecords();
  } catch (error) {
    console.warn('保存预制 node_modules 缓存失败:', error);
  }
};

const cleanupOldRecords = async () => {
  if (!isBrowserEnvironment()) return;

  try {
    const db = await openDatabase();
    const records = await new Promise<CacheRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as CacheRecord[]);
      request.onerror = () => reject(request.error);
    });

    if (records.length <= MAX_PERSISTED_RECORDS) {
      return;
    }

    const sorted = records.sort((a, b) => b.timestamp - a.timestamp);
    const toRemove = sorted.slice(MAX_PERSISTED_RECORDS);

    await Promise.all(
      toRemove.map(
        record =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(record.key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          })
      )
    );
  } catch (error) {
    console.warn('清理预制 node_modules 缓存失败:', error);
  }
};

const loadPersistedRecord = async (key: string): Promise<CacheRecord | null> => {
  if (!isBrowserEnvironment()) return null;

  try {
    const db = await openDatabase();
    const record = await new Promise<CacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as CacheRecord) || null);
      request.onerror = () => reject(request.error);
    });

    return record;
  } catch (error) {
    console.warn('读取预制 node_modules 缓存失败:', error);
    return null;
  }
};

export const loadNodeModulesSnapshot = async (key: string): Promise<Uint8Array | null> => {
  if (!key) return null;

  if (inMemoryCache.has(key)) {
    return inMemoryCache.get(key)!.slice();
  }

  const record = await loadPersistedRecord(key);
  if (record?.data) {
    const snapshot = decodeBinary(record.data);
    inMemoryCache.set(key, snapshot);
    return snapshot.slice();
  }

  return null;
};

export const saveNodeModulesSnapshot = async (key: string, snapshot: Uint8Array): Promise<void> => {
  if (!key) return;

  const copy = snapshot.slice();
  inMemoryCache.set(key, copy);

  await persistRecord({
    key,
    data: encodeBinary(copy),
    timestamp: Date.now()
  });
};

export const clearNodeModulesCache = async (key?: string) => {
  if (key) {
    inMemoryCache.delete(key);
  } else {
    inMemoryCache.clear();
  }

  if (!isBrowserEnvironment()) return;

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (key) {
        store.delete(key);
      } else {
        store.clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('清空预制 node_modules 缓存失败:', error);
  }
};
