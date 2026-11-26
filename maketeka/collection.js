const stores = ['models', 'styles', 'scenes'];
let connection;

function database() {
 if (!connection) connection = new Promise((resolve, reject) => {
  const request = indexedDB.open('maketeka-collection', 1);
  request.onupgradeneeded = () => {
   for (const name of stores) request.result.createObjectStore(name, {keyPath:'id'});
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
 }).catch(error => {
  connection = null;
  throw error;
 });
 return connection;
}

async function transaction(store, mode, operation) {
 const db = await database();
 return new Promise((resolve, reject) => {
  const tx = db.transaction(store, mode);
  const request = operation(tx.objectStore(store));
  tx.oncomplete = () => resolve(request.result);
  tx.onabort = () => reject(Error('Не удалось сохранить данные в браузере'));
 });
}

export const list = (store) => transaction(store, 'readonly', table => table.getAll());
export const put = (store, entry) => transaction(store, 'readwrite', table => table.put(entry));
