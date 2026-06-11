// src/constants/roles.js
// =====================================================
// Nguồn duy nhất cho tất cả các vai trò và phòng ban
// Import file này thay vì khai báo lại ở mỗi component
// =====================================================

/**
 * Danh sách phòng ban dùng cho Gemba audit scoring
 */
export const GEMBA_DEPARTMENTS = [
  { name: "Cutting", defaultPeople: 15 },
  { name: "Rolling", defaultPeople: 55 },
  { name: "Finishing", defaultPeople: 22 },
  { name: "Dipping", defaultPeople: 68 },
  { name: "Graphics", defaultPeople: 12 },
  { name: "QC", defaultPeople: 34 },
  { name: "Warehouse", defaultPeople: 72 },
  { name: "Arrow", defaultPeople: 17 },
  { name: "MTN", defaultPeople: 95 },
  { name: "ENG", defaultPeople: 110 },
];

/**
 * Tên bộ phận đơn giản (trích từ GEMBA_DEPARTMENTS)
 */
export const DEPARTMENT_NAMES = GEMBA_DEPARTMENTS.map(d => d.name);

/**
 * Danh sách vai trò thuộc "Bộ phận" (dùng cho Báo cơm, phân quyền menu...)
 */
export const DEPARTMENT_ROLES = [
  "G_Cutting", "G_Rolling", "G_Finishing", "G_Dipping", "G_Buffing", "G_Graphics",
  "G_QC", "A_QC", "QC_Management", "Kayak", "A_Rolling", "A_Cosmetics", "Planning",
  "Kho VW", "WH_SK", "WH_FG", "WH_EM", "WH_AG", "Apple", "MTN", "Paint Blending",
  "Engineering", "MFG", "Bảo Vệ", "Tạp Vụ", "Office"
];

/**
 * Tất cả vai trò trong hệ thống (bao gồm admin, ehs, bộ phận, nhà ăn...)
 */
export const ALL_ROLES = [
  "admin", "ehs", "ehs committee", "trainer", "manager", "Nhà Ăn",
  ...DEPARTMENT_ROLES
];

/**
 * Ca làm việc
 */
export const SHIFTS = ['S1', 'S2', 'S3', 'S8', 'HC'];
export const SHIFT_NAMES = {
  S1: "Ca 1",
  S2: "Ca 2",
  S3: "Ca 3",
  S8: "Ca 8",
  HC: "Ca HC"
};

/**
 * Giờ bắt đầu ca (dùng cho nhắc nhở tự động)
 */
export const SHIFT_START_HOURS = { S1: 6, S2: 14, S3: 22, HC: 8, S8: 8 };

/**
 * Loại suất ăn cho module Báo cơm
 */
export const MEAL_TYPES = {
  congNhan: { congNhanMan: 'Cơm mặn (CN)', congNhanChay: 'Cơm chay (CN)' },
  giamSat: { giamSatMan: 'Cơm mặn (GS)', giamSatChay: 'Cơm chay (GS)', giamSatSua: 'Sữa (cơm) (GS)' },
  tangCa: { tangCaMi: 'Mì (TC)', tangCaSua: 'Sữa (TC)' }
};

export const ALL_MEAL_KEYS = Object.values(MEAL_TYPES).flatMap(o => Object.keys(o));
export const LABEL_BY_KEY = Object.fromEntries(
  Object.entries(MEAL_TYPES).flatMap(([_, g]) => Object.entries(g))
);
