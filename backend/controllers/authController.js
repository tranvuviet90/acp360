// backend/controllers/authController.js
import pool from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "safeone_super_secret_key_2026";

// Auto-seed a default admin account if users table is empty
export async function seedDefaultAdmin() {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM users");
    if (rows[0].count === 0) {
      console.log("MySQL users table is empty. Seeding default admin account...");
      const uid = "admin-uid-123456";
      const email = "admin@safeone.com";
      const passwordHash = await bcrypt.hash("admin", 10);
      const name = "Admin Việt Trần";
      const role = "admin";
      await pool.query(
        "INSERT INTO users (uid, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)",
        [uid, email, passwordHash, name, role]
      );
      console.log("Default admin account seeded successfully: admin@safeone.com / admin");
    }
  } catch (e) {
    console.error("Failed to seed default admin user:", e.message);
  }
}

// JWT verification middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
    req.user = user;
    next();
  });
}

// Middleware to verify admin role
export function requireAdmin(req, res, next) {
  const roles = (req.user?.role || "").split(",").map(r => r.trim().toLowerCase());
  if (!roles.includes("admin")) {
    return res.status(403).json({ error: "Quyền truy cập bị từ chối" });
  }
  next();
}

// login endpoint
export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Thiếu email hoặc mật khẩu" });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: "Tài khoản hoặc mật khẩu không đúng" });
    }

    const user = rows[0];
    if (user.disabled) {
      return res.status(403).json({ error: "Tài khoản này đã bị khóa" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Tài khoản hoặc mật khẩu không đúng" });
    }

    // Role mapping back to expected format
    const roleList = user.role.split(",");
    const effectiveRole = roleList.length === 1 ? roleList[0] : roleList;

    const payload = {
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      meal_dept: user.meal_dept
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    res.status(200).json({ token, user: payload });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Lỗi đăng nhập hệ thống" });
  }
}

// getMe endpoint
export async function getMe(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE uid = ?", [req.user.uid]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Người dùng không tồn tại" });
    }
    const user = rows[0];
    const roleList = user.role.split(",");
    res.status(200).json({
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: roleList.length === 1 ? roleList[0] : roleList,
      meal_dept: user.meal_dept
    });
  } catch (error) {
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
}

// listUsers functions callable equivalent
export async function listUsers(req, res) {
  try {
    const [rows] = await pool.query("SELECT uid, email, name, role, disabled, created_at FROM users");
    const users = rows.map(u => ({
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role.includes(",") ? u.role.split(",") : u.role,
      disabled: !!u.disabled,
      createdAt: u.created_at
    }));
    res.status(200).json({ users });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Lỗi khi lấy danh sách người dùng" });
  }
}

// adminUserAction functions callable equivalent
export async function adminUserAction(req, res) {
  const { action, targetUid, data } = req.body;

  try {
    switch (action) {
      case "createUser": {
        if (!data || !data.email || !data.password || !data.role) {
          return res.status(400).json({ error: "Thiếu thông tin tạo tài khoản" });
        }
        const uid = "user-" + Date.now() + Math.random().toString(36).substr(2, 9);
        const passwordHash = await bcrypt.hash(data.password, 10);
        const roleStr = Array.isArray(data.role) ? data.role.join(",") : data.role;
        const name = data.name || data.email.split("@")[0];

        await pool.query(
          "INSERT INTO users (uid, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)",
          [uid, data.email, passwordHash, name, roleStr]
        );
        break;
      }
      case "resetPassword":
        if (!data || !data.newPassword) return res.status(400).json({ error: "Thiếu mật khẩu mới" });
        const newPasswordHash = await bcrypt.hash(data.newPassword, 10);
        await pool.query("UPDATE users SET password_hash = ? WHERE uid = ?", [newPasswordHash, targetUid]);
        break;
      case "changeRole":
        if (!data || !data.newRole) return res.status(400).json({ error: "Thiếu quyền mới" });
        const newRoleStr = Array.isArray(data.newRole) ? data.newRole.join(",") : data.newRole;
        await pool.query("UPDATE users SET role = ? WHERE uid = ?", [newRoleStr, targetUid]);
        break;
      case "disable":
        await pool.query("UPDATE users SET disabled = 1 WHERE uid = ?", [targetUid]);
        break;
      case "enable":
        await pool.query("UPDATE users SET disabled = 0 WHERE uid = ?", [targetUid]);
        break;
      case "delete":
        await pool.query("DELETE FROM users WHERE uid = ?", [targetUid]);
        break;
      case "changeName":
        if (!data || !data.newName) return res.status(400).json({ error: "Thiếu tên mới" });
        await pool.query("UPDATE users SET name = ? WHERE uid = ?", [data.newName, targetUid]);
        break;
      case "approveRoleRequest": {
        if (!data || !data.requestId || !data.newRole) return res.status(400).json({ error: "Thiếu thông tin yêu cầu" });
        const roleStr = Array.isArray(data.newRole) ? data.newRole.join(",") : data.newRole;
        await pool.query("UPDATE users SET role = ? WHERE uid = ?", [roleStr, targetUid]);
        await pool.query("UPDATE role_requests SET status = 'approved' WHERE id = ?", [data.requestId]);

        // Add Notification
        const notification = {
          type: "role_response",
          message: `Yêu cầu đổi quyền thành "${data.newRole}" của bạn đã được chấp nhận.`,
          target_user_id: targetUid,
          read_by: JSON.stringify([])
        };
        await pool.query(
          "INSERT INTO notifications (type, message, target_user_id, read_by) VALUES (?, ?, ?, ?)",
          [notification.type, notification.message, notification.target_user_id, notification.read_by]
        );
        break;
      }
      case "rejectRoleRequest":
        if (!data || !data.requestId) return res.status(400).json({ error: "Thiếu ID yêu cầu" });
        await pool.query("UPDATE role_requests SET status = 'rejected' WHERE id = ?", [data.requestId]);

        // Add Notification
        const notificationReject = {
          type: "role_response",
          message: "Yêu cầu đổi quyền của bạn đã bị từ chối.",
          target_user_id: targetUid,
          read_by: JSON.stringify([])
        };
        await pool.query(
          "INSERT INTO notifications (type, message, target_user_id, read_by) VALUES (?, ?, ?, ?)",
          [notificationReject.type, notificationReject.message, notificationReject.target_user_id, notificationReject.read_by]
        );
        break;
      default:
        return res.status(400).json({ error: "Hành động không hợp lệ" });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Admin user action error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
}

// submitRoleRequest functions callable equivalent
export async function submitRoleRequest(req, res) {
  const { requestedRole, currentRole, name, email } = req.body;
  if (!requestedRole) {
    return res.status(400).json({ error: "Thiếu quyền yêu cầu" });
  }

  try {
    await pool.query(
      "INSERT INTO role_requests (uid, name, email, current_role, requested_role) VALUES (?, ?, ?, ?, ?)",
      [req.user.uid, name, email, currentRole, requestedRole]
    );

    // Notify admins
    const notification = {
      type: "role_request",
      message: `${name} vừa yêu cầu đổi quyền từ "${currentRole || "Chưa có"}" sang "${requestedRole}".`,
      target_roles: JSON.stringify(["admin"]),
      read_by: JSON.stringify([])
    };
    await pool.query(
      "INSERT INTO notifications (type, message, target_roles, read_by) VALUES (?, ?, ?, ?)",
      [notification.type, notification.message, notification.target_roles, notification.read_by]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Submit role request error:", error);
    res.status(500).json({ error: "Lỗi khi gửi yêu cầu đổi quyền" });
  }
}

// verifyPassword for reauthentication
export async function verifyPassword(req, res) {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Thiếu mật khẩu xác thực" });

  try {
    const [rows] = await pool.query("SELECT password_hash FROM users WHERE uid = ?", [req.user.uid]);
    if (rows.length === 0) return res.status(404).json({ error: "Người dùng không tồn tại" });

    const validPassword = await bcrypt.compare(password, rows[0].password_hash);
    if (!validPassword) return res.status(401).json({ error: "Mật khẩu xác thực không đúng" });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Verify password error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
}

// updatePassword for users changing their own password
export async function updateUserPassword(req, res) {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: "Thiếu mật khẩu mới" });

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE uid = ?", [passwordHash, req.user.uid]);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
}
