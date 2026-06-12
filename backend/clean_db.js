// backend/clean_db.js
import pool from "./db.js";

async function main() {
  try {
    console.log("🔄 Đang dọn dẹp bảng 'users' trong database local...");
    await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
    await pool.query("DELETE FROM users;");
    await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("✅ Đã xóa sạch toàn bộ tài khoản người dùng thành công!");
    console.log("👉 Bây giờ hãy F5/Tải lại trang web local để thấy popup khởi tạo Admin đầu tiên theo ý muốn!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Lỗi khi dọn dẹp database:", err);
    process.exit(1);
  }
}

main();
