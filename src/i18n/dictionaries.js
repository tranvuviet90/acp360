export const DICTS = {
  vi: {
    // ===== Common =====
    "common.loading": "Đang tải...",
    "common.close": "Đóng",
    "common.send": "Gửi",
    "common.sending": "Đang gửi...",
    "common.noImage": "Chưa có ảnh",
    "common.attach": "Ảnh đính kèm",
    "common.error": "Đã xảy ra lỗi",
    "common.success": "Thành công",
    "common.all": "Tất cả",

    // System
    "logout": "Đăng xuất",
    "language.vi": "Tiếng Việt",
    "language.en": "English",

    // ===== Login =====
    "login.title": "Đăng Nhập",
    "login.subtitle": "Chào mừng trở lại!",
    "login.error.empty": "Vui lòng nhập email và mật khẩu.",
    "login.error.invalid": "Email hoặc mật khẩu không chính xác.",
    "login.error.generic": "Đã xảy ra lỗi. Vui lòng thử lại.",
    "login.email": "Email",
    "login.password": "Mật khẩu",
    "login.remember": "Ghi nhớ đăng nhập",
    "login.forgot": "Quên mật khẩu?",
    "login.forgot.dev": "Chức năng khôi phục mật khẩu đang được phát triển.",
    "login.button": "Đăng Nhập",

    // ===== Bodam =====
    "bodam.title": "Quản lý bộ đàm",
    "bodam.unavailable": "Không khả dụng",
    "bodam.inuse": "Đang sử dụng",
    "bodam.returned": "Đã trả",
    "bodam.reopen": "Mở lại",
    "bodam.disable": "Tắt (Bảo trì)",

    // ===== BaoCom =====
    "meal.header": "Báo cơm ngày {date} – Bộ phận: {dep}",
    "meal.loading": "Đang tải form...",
    "meal.worker": "Cơm công nhân",
    "meal.supervisor": "Cơm giám sát",
    "meal.overtime": "Tăng ca",
    "meal.saveShift": "Lưu ca {shift}",
    "meal.detail.title": "Chi tiết báo cơm – {dep}",
    "meal.detail.counts": "Số lượng theo từng ca",
    "meal.detail.history": "Lịch sử thay đổi của bộ phận",
    "meal.detail.noHistory": "Chưa ghi nhận lịch sử cho bộ phận này.",
    "meal.admin.summary": "Tổng hợp ca: {shift}",
    "meal.status.canteenConfirmed": "Nhà ăn đã xác nhận",
    "meal.status.sent": "Đã gửi cho Nhà Ăn",
    "meal.status.notSent": "Chưa gửi",
    "meal.admin.resendWarning": "Có cập nhật mới sau khi gửi. Vui lòng kiểm tra và bấm Gửi lại.",
    "meal.table.type": "Loại cơm",
    "meal.table.total": "Tổng báo cáo",
    "meal.table.adjust": "Điều chỉnh",
    "meal.admin.resend": "Gửi lại",

    // ===== Ca làm việc =====
    "tasks.smoking": "Giám sát hút thuốc",
    "tasks.gembaOuter": "Gemba vòng ngoài",
    "tasks.trash": "Giám sát nhà rác",
    "tasks.gembaDept": "Gemba tại bộ phận",
    "shift.S1": "Ca 1",
    "shift.S2": "Ca 2",
    "shift.S3": "Ca 3",
    "shift.HC": "Ca HC",
    "shift.S8": "Ca 8",
    "shift.Off": "Off",
    "page.shifts.title": "Phân ca & Công việc EHS Committee",
    "shifts.myWeek": "Ca làm việc của tôi (Tuần {week})",
    "shifts.selectShift": "-- Chọn ca --",
    "shifts.availableStaff": "Ca làm việc (Nhân sự có sẵn)",
    "board.titleForDay": "Bảng phân công ngày: {date}",
    "nav.prevWeek": "« Tuần trước",
    "nav.nextWeek": "Tuần sau »",
    "nav.weekRange": "Tuần {week} ({from} - {to})",
    "nav.backToCurrentWeek": "Quay về tuần hiện tại",
    "loading.shifts": "Đang tải dữ liệu ca làm việc.",
    "errors.updateShift": "Không thể cập nhật ca làm việc. Vui lòng kiểm tra quyền truy cập của bạn.",

    // ===== Reports =====
    "report.export.cap": "Xuất CAP",
    "report.export.score": "Xuất BẢNG CHẤM ĐIỂM",
    "report.export.range": "Chọn khoảng ngày",
    "report.export.department": "Chọn bộ phận",
    "report.export": "Xuất báo cáo",

    // ===== Improvement form =====
    "improve.responsible": "Người phụ trách",
    "improve.dueDate": "Ngày dự kiến hoàn thành",
    "improve.notes": "Ghi chú tiến độ",
    "improve.doneDate": "Ngày hoàn thành",
    "improve.images": "Ảnh cải thiện",
    "improve.save": "Lưu thay đổi",

    // ===== Specialized pages =====
    "trash.title": "Giám sát nhà rác",
    "smoking.title": "Lịch sử kiểm tra hút thuốc toilet",
    "break.title": "Giải lao & KV hút thuốc",

    // ===== Chatbot =====
    "chatbot.title": "Trợ lý ảo",
    "chatbot.welcome": "Xin chào! Tôi có thể giúp gì cho bạn?",
    "chatbot.error": "Rất tiếc, đã có lỗi xảy ra. Vui lòng thử lại.",
    "chatbot.placeholder": "Nhập câu hỏi...",

    // ===== MagicMenu =====
    "menu.gemba": "Gemba",
    "menu.tugemba": "Tự Gemba",
    "menu.walkietalkie": "Bộ đàm",
    "menu.shift": "Phân ca",
    "menu.smoking": "Hút thuốc",
    "menu.break": "Giải lao",
    "menu.trash": "Nhà rác",
    "menu.meal": "Báo cơm"
  },

  en: {
    // ===== Common =====
    "common.loading": "Loading...",
    "common.close": "Close",
    "common.send": "Send",
    "common.sending": "Sending...",
    "common.noImage": "No image",
    "common.attach": "Attachment",
    "common.error": "An error occurred",
    "common.success": "Success",
    "common.all": "All",

    // System
    "logout": "Logout",
    "language.vi": "Vietnamese",
    "language.en": "English",

    // ===== Login =====
    "login.title": "Login",
    "login.subtitle": "Welcome back!",
    "login.error.empty": "Please enter email and password.",
    "login.error.invalid": "Invalid email or password.",
    "login.error.generic": "An error occurred. Please try again.",
    "login.email": "Email",
    "login.password": "Password",
    "login.remember": "Remember me",
    "login.forgot": "Forgot password?",
    "login.forgot.dev": "Password recovery is under development.",
    "login.button": "Login",

    // ===== Bodam =====
    "bodam.title": "Walkie-talkie Management",
    "bodam.unavailable": "Unavailable",
    "bodam.inuse": "In use",
    "bodam.returned": "Returned",
    "bodam.reopen": "Reopen",
    "bodam.disable": "Disabled (Maintenance)",

    // ===== BaoCom =====
    "meal.header": "Meal order {date} – Dept: {dep}",
    "meal.loading": "Loading form...",
    "meal.worker": "Worker meal",
    "meal.supervisor": "Supervisor meal",
    "meal.overtime": "Overtime",
    "meal.saveShift": "Save shift {shift}",
    "meal.detail.title": "Meal details – {dep}",
    "meal.detail.counts": "Count per shift",
    "meal.detail.history": "Department history",
    "meal.detail.noHistory": "No history recorded for this department.",
    "meal.admin.summary": "Summary shift: {shift}",
    "meal.status.canteenConfirmed": "Canteen confirmed",
    "meal.status.sent": "Sent to Canteen",
    "meal.status.notSent": "Not sent",
    "meal.admin.resendWarning": "Updated after sending. Please check and resend.",
    "meal.table.type": "Meal type",
    "meal.table.total": "Total report",
    "meal.table.adjust": "Adjust",
    "meal.admin.resend": "Resend",

    // ===== Ca làm việc =====
    "tasks.smoking": "Smoking Monitor",
    "tasks.gembaOuter": "Outer Gemba",
    "tasks.trash": "Trash Area",
    "tasks.gembaDept": "Department Gemba",
    "shift.S1": "Shift 1",
    "shift.S2": "Shift 2",
    "shift.S3": "Shift 3",
    "shift.HC": "Office Shift",
    "shift.S8": "Shift 8",
    "shift.Off": "Off",
    "page.shifts.title": "Shift Planning & EHS Committee Tasks",
    "shifts.myWeek": "My shifts (Week {week})",
    "shifts.selectShift": "-- Select shift --",
    "shifts.availableStaff": "Shifts (Available staff)",
    "board.titleForDay": "Assignments for: {date}",
    "nav.prevWeek": "« Previous week",
    "nav.nextWeek": "Next week »",
    "nav.weekRange": "Week {week} ({from} - {to})",
    "nav.backToCurrentWeek": "Back to current week",
    "loading.shifts": "Loading shift data...",
    "errors.updateShift": "Unable to update your shift. Please check permissions.",

    // ===== Reports =====
    "report.export.cap": "Export CAP",
    "report.export.score": "Export SCORING TABLE",
    "report.export.range": "Select date range",
    "report.export.department": "Select department",
    "report.export": "Export report",

    // ===== Improvement =====
    "improve.responsible": "Responsible person",
    "improve.dueDate": "Planned due date",
    "improve.notes": "Progress notes",
    "improve.doneDate": "Completion date",
    "improve.images": "Improvement images",
    "improve.save": "Save changes",

    // ===== Specialized pages =====
    "trash.title": "Trash Monitoring",
    "smoking.title": "Smoking Toilet Inspections",
    "break.title": "Break & Smoking Area",

    // ===== Chatbot =====
    "chatbot.title": "Virtual Assistant",
    "chatbot.welcome": "Hello! How can I help you?",
    "chatbot.error": "Sorry, an error occurred. Please try again.",
    "chatbot.placeholder": "Enter your question...",

    // ===== MagicMenu =====
    "menu.gemba": "Gemba",
    "menu.tugemba": "Self Gemba",
    "menu.walkietalkie": "Walkie-talkie",
    "menu.shift": "Shifts",
    "menu.smoking": "Smoking",
    "menu.break": "Break",
    "menu.trash": "Trash",
    "menu.meal": "Meal Order"
  }
};
