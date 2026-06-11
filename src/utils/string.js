// src/utils/string.js
// =====================================================
// Hàm xử lý chuỗi dùng chung cho toàn bộ ứng dụng
// Import file này thay vì copy-paste ở mỗi component
// =====================================================

/**
 * Loại bỏ dấu tiếng Việt để so sánh vai trò không phân biệt dấu
 * Ví dụ: "Bảo Vệ" → "Bao Ve"
 * @param {string} s
 * @returns {string}
 */
export const stripDiacritics = (s = "") =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Chuẩn hóa vai trò: bỏ dấu, trim, lowercase
 * Dùng để so sánh vai trò bất kể dấu và viết hoa/thường
 * @param {string} r
 * @returns {string}
 */
export const normalizeRole = (r) =>
  stripDiacritics(String(r || "").trim()).toLowerCase();

/**
 * Format ngày thành chuỗi YYYY-MM-DD (dùng làm document ID trong Firestore)
 * @param {Date} date
 * @returns {string}
 */
export const formatDateToId = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Tính số tuần ISO của một ngày
 * @param {Date} d
 * @returns {number}
 */
export const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

/**
 * Lấy danh sách 7 ngày trong tuần chứa baseDate (Thứ 2 → Chủ nhật)
 * @param {Date} baseDate
 * @returns {Date[]}
 */
export const getWeekDates = (baseDate) => {
  const d = new Date(baseDate);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const firstDayOfWeek = new Date(d);
  firstDayOfWeek.setDate(diff);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(firstDayOfWeek);
    day.setDate(day.getDate() + i);
    weekDays.push(day);
  }
  return weekDays;
};

/**
 * Format thời gian tương đối kiểu Facebook ("5 phút trước", "Hôm qua"...)
 * @param {object|number} timestamp - Firestore Timestamp hoặc milliseconds
 * @returns {string}
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "";
  const timeMs = timestamp.seconds ? timestamp.seconds * 1000 : timestamp;
  const diffMs = Date.now() - timeMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Vài giây trước";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay === 1) return "Hôm qua";
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(timeMs).toLocaleDateString("vi-VN");
};
