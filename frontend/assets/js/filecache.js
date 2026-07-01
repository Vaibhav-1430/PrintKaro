// Print Karo frontend — tiny IndexedDB blob cache so the just-uploaded File can be
// previewed on the options page (a separate navigation) without re-fetching from
// storage. Best-effort: all failures degrade to "no cached file" (metadata-only).
const DB = 'pk-files';
const STORE = 'blobs';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(key, file) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ name: file.name, type: file.type, blob: file }, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore — preview just won't be available cross-page */
  }
}

export async function getFile(key) {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v ? new File([v.blob], v.name, { type: v.type }) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function pruneExcept(keepKey) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.getAllKeys().onsuccess = (e) => {
      e.target.result.forEach((k) => {
        if (k !== keepKey) store.delete(k);
      });
    };
  } catch {
    /* ignore */
  }
}
