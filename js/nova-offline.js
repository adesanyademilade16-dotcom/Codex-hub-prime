
/**
 * Codex Hub — Nova offline queue
 * Queues messages when offline; flushes when back online.
 * Optional FCM: when a reply is ready after offline, show a local notification.
 */
(function (w) {
  "use strict";
  var DB_NAME = "codex_nova_offline";
  var STORE = "queue";

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function enqueue(item) {
    return add(item);
  }

  function add(item) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).add(Object.assign({ createdAt: Date.now(), status: "pending" }, item));
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function allPending() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          resolve((req.result || []).filter(function (x) { return x.status === "pending"; }));
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function markDone(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, "readwrite");
        var store = tx.objectStore(STORE);
        var g = store.get(id);
        g.onsuccess = function () {
          var row = g.result;
          if (row) { row.status = "done"; store.put(row); }
        };
        tx.oncomplete = function () { resolve(); };
      });
    });
  }

  function notify(title, body) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title || "Nova", { body: body || "Your offline message was processed.", tag: "nova-offline" });
      }
    } catch (e) {}
  }

  function flush(sendFn) {
    if (!navigator.onLine || typeof sendFn !== "function") return Promise.resolve();
    return allPending().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function () {
          return Promise.resolve(sendFn(item)).then(function () {
            return markDone(item.id).then(function () {
              notify("Nova is back", "Replied to: " + String(item.text || "").slice(0, 60));
            });
          }).catch(function (e) { console.warn("offline flush fail", e); });
        });
      });
      return chain;
    });
  }

  w.NovaOffline = {
    add: add, enqueue: enqueue,
    allPending: allPending,
    flush: flush,
    notify: notify,
    isOnline: function () { return navigator.onLine !== false; }
  };

  w.addEventListener("online", function () {
    if (w.NovaOffline && w.__novaFlushHandler) w.NovaOffline.flush(w.__novaFlushHandler);
  });
})(window);
