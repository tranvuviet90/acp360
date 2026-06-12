// src/firebase-mock.js
import { io } from "socket.io-client";

// Global local server base URL
const API_BASE = "http://localhost:5000";

// Global state variables
let socket = null;
const socketListeners = new Map(); // path -> Set of callbacks

function getSocket() {
  if (socket) return socket;
  try {
    socket = io(API_BASE, { autoConnect: true });
    socket.on("db_change", (event) => {
      const { path, data } = event;
      const callbacks = socketListeners.get(path);
      if (callbacks) {
        callbacks.forEach(cb => cb(data));
      }
    });
  } catch (e) {
    console.warn("WebSocket connection failed, falling back to polling", e);
  }
  return socket;
}

function subscribeSocket(path, callback) {
  let callbacks = socketListeners.get(path);
  if (!callbacks) {
    callbacks = new Set();
    socketListeners.set(path, callbacks);
    const s = getSocket();
    if (s && s.connected) {
      s.emit("subscribe", { path });
    }
  }
  callbacks.add(callback);

  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      socketListeners.delete(path);
      const s = getSocket();
      if (s && s.connected) {
        s.emit("unsubscribe", { path });
      }
    }
  };
}

// Helper to fetch with JWT auth header
async function authorizedFetch(url, options = {}) {
  const token = localStorage.getItem("safeone_jwt_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    // Session expired or unauthenticated
    localStorage.removeItem("safeone_jwt_token");
  }
  return response;
}

// Mock Firestore Document & Query Snapshot Classes
class MockDocumentSnapshot {
  constructor(id, exists, docData = null) {
    this.id = id;
    this.existsStatus = exists;
    this.docData = docData;
  }
  exists() {
    return this.existsStatus;
  }
  data() {
    return this.docData;
  }
}

class MockQuerySnapshot {
  constructor(docs = []) {
    this.docs = docs;
  }
  forEach(callback) {
    this.docs.forEach(callback);
  }
  get size() {
    return this.docs.length;
  }
}

export class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromDate(date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromMillis(ms) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }
  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }
}

// -------------------------------------------------------------
// 1. firebase/app
// -------------------------------------------------------------
export function initializeApp(config) {
  console.log("Mock Firebase App initialized with config", config);
  return { name: "[MockApp]" };
}

// -------------------------------------------------------------
// 2. firebase/auth
// -------------------------------------------------------------
const mockAuthInstance = {
  currentUser: null,
  authStateListeners: new Set(),
  isMock: true,
  checkSystemInit: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/check-init`);
      if (!res.ok) return { initialized: true };
      return await res.json();
    } catch (e) {
      console.warn("Check system init failed, assuming initialized:", e);
      return { initialized: true };
    }
  },
  initAdmin: async (email, password, name) => {
    const res = await fetch(`${API_BASE}/api/auth/init-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Khởi tạo Admin thất bại");
    }
    return await res.json();
  }
};

export function getAuth(app) {
  return mockAuthInstance;
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const res = await authorizedFetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Đăng nhập thất bại");
  }
  const data = await res.json();
  localStorage.setItem("safeone_jwt_token", data.token);
  auth.currentUser = data.user;
  
  // Notify listeners
  auth.authStateListeners.forEach(cb => cb(data.user));
  
  return { user: data.user };
}

export async function signOut(auth) {
  localStorage.removeItem("safeone_jwt_token");
  auth.currentUser = null;
  auth.authStateListeners.forEach(cb => cb(null));
  return true;
}

export function onAuthStateChanged(auth, callback) {
  auth.authStateListeners.add(callback);
  
  // Immediate initial load
  const token = localStorage.getItem("safeone_jwt_token");
  if (token) {
    authorizedFetch(`${API_BASE}/api/auth/me`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Expired");
      })
      .then(user => {
        auth.currentUser = user;
        callback(user);
      })
      .catch(() => {
        localStorage.removeItem("safeone_jwt_token");
        auth.currentUser = null;
        callback(null);
      });
  } else {
    callback(null);
  }

  return () => {
    auth.authStateListeners.delete(callback);
  };
}

export class EmailAuthProvider {
  static credential(email, password) {
    return { type: "email_credential", email, password };
  }
}

export async function reauthenticateWithCredential(authCurrentUser, credential) {
  const res = await authorizedFetch(`${API_BASE}/api/auth/verify-password`, {
    method: "POST",
    body: JSON.stringify({ password: credential.password })
  });
  if (!res.ok) throw new Error("Mật khẩu hiện tại không đúng");
  return true;
}

export async function updatePassword(authCurrentUser, newPassword) {
  const res = await authorizedFetch(`${API_BASE}/api/auth/update-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword })
  });
  if (!res.ok) throw new Error("Cập nhật mật khẩu thất bại");
  return true;
}

// -------------------------------------------------------------
// 3. firebase/firestore
// -------------------------------------------------------------
export function getFirestore(app) {
  return { name: "[MockFirestore]" };
}

export function doc(db, collectionName, id) {
  return { type: "doc", collection: collectionName, id };
}

export function collection(db, collectionName) {
  return { type: "collection", collection: collectionName };
}

export async function getDoc(docRef) {
  const res = await authorizedFetch(`${API_BASE}/api/db/${docRef.collection}/${docRef.id}`);
  if (!res.ok) {
    return new MockDocumentSnapshot(docRef.id, false);
  }
  const data = await res.json();
  return new MockDocumentSnapshot(docRef.id, true, data);
}

export async function getDocs(queryRef) {
  const collectionName = queryRef.collection;
  const res = await authorizedFetch(`${API_BASE}/api/db/${collectionName}`);
  if (!res.ok) {
    return new MockQuerySnapshot();
  }
  const list = await res.json();
  const docs = list.map(item => new MockDocumentSnapshot(item.id || item.uid, true, item));
  return new MockQuerySnapshot(docs);
}

export async function getCountFromServer(queryRef) {
  const collectionName = queryRef.collection;
  const res = await authorizedFetch(`${API_BASE}/api/db/${collectionName}`);
  if (!res.ok) {
    return {
      data() { return { count: 0 }; }
    };
  }
  const list = await res.json();
  return {
    data() { return { count: list.length }; }
  };
}

export async function setDoc(docRef, data, options = {}) {
  const res = await authorizedFetch(`${API_BASE}/api/db/${docRef.collection}/${docRef.id}`, {
    method: "POST",
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Lưu dữ liệu thất bại");
  return true;
}

export async function updateDoc(docRef, data) {
  const res = await authorizedFetch(`${API_BASE}/api/db/${docRef.collection}/${docRef.id}`, {
    method: "PATCH",
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Cập nhật dữ liệu thất bại");
  return true;
}

export async function addDoc(colRef, data) {
  const res = await authorizedFetch(`${API_BASE}/api/db/${colRef.collection}`, {
    method: "POST",
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Thêm dữ liệu thất bại");
  const result = await res.json();
  return { id: result.id };
}

export async function deleteDoc(docRef) {
  const res = await authorizedFetch(`${API_BASE}/api/db/${docRef.collection}/${docRef.id}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Xóa dữ liệu thất bại");
  return true;
}

export function query(colRef, ...constraints) {
  // Simple constraint mapping
  return colRef;
}

export function where(field, op, value) {
  return { type: "where", field, op, value };
}

export function orderBy(field, direction = "asc") {
  return { type: "orderBy", field, direction };
}

export function limit(num) {
  return { type: "limit", num };
}

export function onSnapshot(ref, callback, errorCallback) {
  const path = ref.type === "doc" ? `${ref.collection}/${ref.id}` : ref.collection;
  let active = true;

  // Immediate Initial Fetch
  const fetchAndTrigger = () => {
    if (ref.type === "doc") {
      getDoc(ref).then(snap => {
        if (active) callback(snap);
      }).catch(err => errorCallback && errorCallback(err));
    } else {
      getDocs(ref).then(snap => {
        if (active) callback(snap);
      }).catch(err => errorCallback && errorCallback(err));
    }
  };

  fetchAndTrigger();

  // 1. Try WebSocket Subscription
  const unsubSocket = subscribeSocket(path, (data) => {
    if (!active) return;
    if (ref.type === "doc") {
      callback(new MockDocumentSnapshot(ref.id, !!data, data));
    } else if (Array.isArray(data)) {
      const docs = data.map(item => new MockDocumentSnapshot(item.id || item.uid, true, item));
      callback(new MockQuerySnapshot(docs));
    } else {
      fetchAndTrigger();
    }
  });

  // 2. Fail-safe Fallback: Polling every 4 seconds
  const intervalId = setInterval(() => {
    if (active) fetchAndTrigger();
  }, 4000);

  return () => {
    active = false;
    unsubSocket();
    clearInterval(intervalId);
  };
}

export function serverTimestamp() {
  return { type: "serverTimestamp", value: new Date().toISOString() };
}

export function arrayUnion(...elements) {
  return { type: "arrayUnion", elements };
}

export function writeBatch(db) {
  const batchQueue = [];
  return {
    set(docRef, data, options) {
      batchQueue.push({ method: "POST", path: `/api/db/${docRef.collection}/${docRef.id}`, body: data });
    },
    update(docRef, data) {
      batchQueue.push({ method: "PATCH", path: `/api/db/${docRef.collection}/${docRef.id}`, body: data });
    },
    delete(docRef) {
      batchQueue.push({ method: "DELETE", path: `/api/db/${docRef.collection}/${docRef.id}` });
    },
    async commit() {
      const res = await authorizedFetch(`${API_BASE}/api/db/batch`, {
        method: "POST",
        body: JSON.stringify({ operations: batchQueue })
      });
      if (!res.ok) throw new Error("Commit batch thất bại");
      return true;
    }
  };
}

// -------------------------------------------------------------
// 4. firebase/storage
// -------------------------------------------------------------
export function getStorage(app) {
  return { name: "[MockStorage]" };
}

export function ref(storage, path) {
  return { type: "storageRef", path };
}

export function uploadBytesResumable(storageRef, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", storageRef.path);

  const token = localStorage.getItem("safeone_jwt_token");
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const promise = fetch(`${API_BASE}/api/storage/upload`, {
    method: "POST",
    headers,
    body: formData
  }).then(async res => {
    if (!res.ok) throw new Error("Upload thất bại");
    const data = await res.json();
    return {
      ref: storageRef,
      downloadURL: data.url
    };
  });

  // Mock upload task behavior
  return {
    then(onResolve, onReject) {
      return promise.then(onResolve, onReject);
    },
    catch(onReject) {
      return promise.catch(onReject);
    }
  };
}

export async function uploadBytes(storageRef, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", storageRef.path);

  const token = localStorage.getItem("safeone_jwt_token");
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/storage/upload`, {
    method: "POST",
    headers,
    body: formData
  });
  if (!res.ok) throw new Error("Upload thất bại");
  const data = await res.json();
  
  // Save resolved URL inside storageRef so getDownloadURL can return it instantly
  storageRef.downloadURL = data.url;
  return {
    ref: storageRef,
    metadata: {}
  };
}

export async function deleteObject(storageRef) {
  console.log("Mock Storage: deleting object", storageRef.path);
  return true;
}

export async function getDownloadURL(storageRef) {
  // If the ref was already resolved during upload, return direct local URL
  if (storageRef.downloadURL) return storageRef.downloadURL;
  return `${API_BASE}/uploads/${storageRef.path.split("/").pop()}`;
}

// -------------------------------------------------------------
// 5. firebase/functions
// -------------------------------------------------------------
export function getFunctions(app, region) {
  return { name: "[MockFunctions]", region };
}

export function httpsCallable(functions, name) {
  return async (data) => {
    const res = await authorizedFetch(`${API_BASE}/api/functions/${name}`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Lỗi hàm backend");
    }
    const resultData = await res.json();
    return { data: resultData };
  };
}
