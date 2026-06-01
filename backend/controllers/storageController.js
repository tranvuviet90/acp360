// backend/controllers/storageController.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storageConfig = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

export const uploadMiddleware = multer({
  storage: storageConfig,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single("file");

export function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Không tìm thấy file để upload" });
  }

  const host = req.get("host");
  const protocol = req.protocol;
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

  res.status(200).json({
    message: "Upload file thành công",
    url: fileUrl,
    filename: req.file.filename
  });
}
