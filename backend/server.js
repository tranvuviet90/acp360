// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Import Controllers and helper methods
import { 
  login, 
  getMe, 
  authenticateToken, 
  requireAdmin, 
  listUsers, 
  adminUserAction, 
  submitRoleRequest,
  seedDefaultAdmin,
  verifyPassword,
  updateUserPassword
} from "./controllers/authController.js";

import { 
  getCollection, 
  getDocument, 
  updateDocument, 
  addDocument, 
  commitBatch,
  setIoInstance
} from "./controllers/dbController.js";

import { uploadMiddleware, uploadFile } from "./controllers/storageController.js";
import { askAI } from "./controllers/functionsController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment configurations
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const server = http.createServer(app);

// Initialize Socket.io WebSocket server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Sync WebSocket server with database controller broadcasts
setIoInstance(io);

// Enable CORS and Express body parsers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically at /uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===================================================================
// ### API ROUTING SECTION ###
// ===================================================================

// 1. Custom authentication routes
app.post("/api/auth/login", login);
app.get("/api/auth/me", authenticateToken, getMe);
app.post("/api/auth/verify-password", authenticateToken, verifyPassword);
app.post("/api/auth/update-password", authenticateToken, updateUserPassword);

// 2. Generic Database CRUD endpoints mimicking Firestore calls
app.get("/api/db/:collection", authenticateToken, getCollection);
app.get("/api/db/:collection/:id", authenticateToken, getDocument);
app.post("/api/db/:collection/:id", authenticateToken, updateDocument);
app.patch("/api/db/:collection/:id", authenticateToken, updateDocument);
app.post("/api/db/:collection", authenticateToken, addDocument);
app.post("/api/db/batch", authenticateToken, commitBatch);

// 3. File upload storage endpoint
app.post("/api/storage/upload", authenticateToken, uploadMiddleware, uploadFile);

// 4. Cloud functions equivalents mapping
app.post("/api/functions/askAI", askAI);
app.post("/api/functions/listUsers", authenticateToken, requireAdmin, listUsers);
app.post("/api/functions/adminUserAction", authenticateToken, requireAdmin, adminUserAction);
app.post("/api/functions/submitRoleRequest", authenticateToken, submitRoleRequest);

// ===================================================================
// ### PRODUCTION DEPLOYMENT & STATIC ASSETS ###
// ===================================================================

// Serve React production build statically from dist directory
const FRONTEND_DIST_DIR = path.join(__dirname, "../dist");
if (fs.existsSync(FRONTEND_DIST_DIR)) {
  console.log("Serving static frontend files from:", FRONTEND_DIST_DIR);
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get("*", (req, res, next) => {
    // Only serve index.html for non-API client requests
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST_DIR, "index.html"));
  });
} else {
  console.log("Frontend production build ('../dist') not found. Server running in API-only mode.");
  app.get("/", (req, res) => {
    res.status(200).json({ ok: true, message: "SafeOne API Server is running" });
  });
}

// ===================================================================
// ### WEBSOCKET SUBSCRIBER CHANNELS ###
// ===================================================================

io.on("connection", (socket) => {
  console.log("WebSocket client connected:", socket.id);

  // Subscribe client to real-time updates of a collection or document path
  socket.on("subscribe", ({ path }) => {
    console.log(`Socket ${socket.id} subscribed to path: ${path}`);
    socket.join(path);
  });

  // Unsubscribe client from updates
  socket.on("unsubscribe", ({ path }) => {
    console.log(`Socket ${socket.id} unsubscribed from path: ${path}`);
    socket.leave(path);
  });

  socket.on("disconnect", () => {
    console.log("WebSocket client disconnected:", socket.id);
  });
});

// ===================================================================
// ### SERVER INITIALIZATION & DATA SEEDING ###
// ===================================================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`SafeOne local server successfully listening on port ${PORT}`);
  
  // Seed the default admin account: admin@safeone.com / admin
  await seedDefaultAdmin();
});
