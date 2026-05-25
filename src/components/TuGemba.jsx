// File: TuGemba.jsx (Phiên bản đồng bộ logic Gemba, lược bỏ tính điểm, dùng trực tiếp collection tu_gemba_logs để tránh lỗi 403)

import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../firebase";
import {
  doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp,
  query, where, getDocs, Timestamp, writeBatch, deleteDoc, getDoc,
  updateDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import imageCompression from "browser-image-compression";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { colors } from "../theme";
import { useI18n } from "../i18n/I18nProvider";
import LightboxSwipeOnly, { useConfirm } from "./LightboxSwipeOnly";
import { callAIService } from "../utils/aiAdapter";

/* ====================== BIỂU TƯỢNG (ICON) ====================== */
function ImprovementIcon({ color = 'currentColor', size = 18 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
  );
}

/* ====================== CẤU HÌNH ====================== */
const departments = [
  { name: "Cutting" }, { name: "Rolling" }, { name: "Finishing" }, { name: "Dipping" },
  { name: "Graphics" }, { name: "QC" }, { name: "Warehouse" }, { name: "Arrow" },
  { name: "MTN" }, { name: "ENG" },
];

const errorGroups = [
  { group: "Bảo hộ lao động (PPE)", items: [ { code: "1.1", desc: "Không sử dụng hoặc sử dụng không đúng loại BHLĐ" }, { code: "1.2", desc: "Sử dụng BHLĐ không đúng quy cách/ sai mục đích" }, { code: "1.3", desc: "Không bảo quản BHLĐ/ Để không đúng vị trí" }, { code: "1.4", desc: "BHLĐ không được vệ sinh định kỳ/ dơ bẩn" }, { code: "1.5", desc: "BHLĐ không được thay mới khi đến kỳ/ không có thời gian theo dõi" }, ] },
  { group: "5S", items: [ { code: "2.1", desc: "Không sàng lọc, loại bỏ các vật dụng không cần thiết" }, { code: "2.2", desc: "Không phân loại, sắp xếp, tổ chức các vật dụng, dụng cụ theo trật tự" }, { code: "2.3", desc: "Không layout các vị trí quy định như tủ điện, bình chữa cháy, khu vực để dụng cụ làm việc,…" }, { code: "2.4", desc: "Layout bị bong tróc" }, { code: "2.5", desc: "Không định kỳ vệ sinh khu vực làm việc/ không có lịch vệ sinh" }, { code: "2.6", desc: "Vệ Sinh" }, { code: "2.7", desc: "Không kiểm tra Checklist 5S" }, { code: "2.8", desc: "Dụng cụ vệ sinh để không đúng nơi quy định" }, { code: "2.9", desc: "Bộ phận phát sinh bụi bẩn, rác" }, ] },
  { group: "Hệ thống điện", items: [ { code: "3.1", desc: "Nguồn điện bị rò rỉ" }, { code: "3.2", desc: "Ổ cắm điện bị chảy nhựa" }, { code: "3.3", desc: "Tủ điện không được khóa" }, { code: "3.4", desc: "Để dụng cụ, hàng hóa che chắn tủ điện" }, { code: "3.5", desc: "Đèn báo nguồn của tủ điện không hoạt động" }, { code: "3.6", desc: "Máy móc, thiết bị điện không được nối đất" }, { code: "3.7", desc: "Dây nối đất không đúng quy cách" }, { code: "3.8", desc: "Không có nút che chắn các ổ cắm trống" }, { code: "3.9", desc: "Dây điện bị bong tróc" }, { code: "3.10", desc: "Dây điện không gọn gàng" }, { code: "3.11", desc: "Các vật liệu dễ cháy để gần tủ điện" }, { code: "3.12", desc: "Không tắt điện máy móc, thiết bị khi không sử dụng" }, { code: "3.13", desc: "Vị trí đấu nối dây không có ống bảo vệ" }, { code: "3.14", desc: "Để dụng cụ, vật dụng đè lên dây dẫn điện" }, { code: "3.15", desc: "Ổ cắm điện bị đóng bụi không được vệ sinh" }, { code: "3.16", desc: "Không tắt đèn khu vực làm việc khi giải lao" }, ] },
  { group: "Dụng cụ", items: [ { code: "4.1", desc: "Dụng cụ làm việc sử dụng không đúng mục đích" }, { code: "4.2", desc: "Dụng cụ làm việc để không đúng nơi quy định" }, { code: "4.3", desc: "Dụng cụ làm việc có nguy cơ gây mất an toàn" }, ] },
  { group: "Hóa chất", items: [ { code: "5.1", desc: "Hóa chất không có tem nhãn" }, { code: "5.2", desc: "Tem nhãn hóa chất phai mờ, không đọc được thông tin" }, { code: "5.3", desc: "Hóa chất không để trong khay chống tràn" }, { code: "5.4", desc: "Hóa chất sử dụng xong không đậy nắp" }, { code: "5.5", desc: "Hóa chất để chung với các vật liệu, thiết bị dễ cháy nổ" }, { code: "5.6", desc: "Hóa chất chất cao có nguy cơ ngã đổ" }, { code: "5.7", desc: "Hóa chất lưu trữ không đúng nơi quy định" }, { code: "5.8", desc: "Khi di chuyển hóa chất không sử dụng xe đẩy chống tràn" }, { code: "5.9", desc: "Tủ lưu trữ hóa chất rách, bong tróc, không có danh sách lưu trữ" }, { code: "5.10", desc: "Kệ/ phuy sang chiết hóa chất/ thùng khuấy sơn không có dây nối đất" }, { code: "5.11", desc: "Để rò rỉ hóa chất ra ngoài không vệ sinh, môi trường" }, { code: "5.12", desc: "Lưu trữ các thùng carton, vật liệu dễ cháy nổ trong kho hóa chất" }, { code: "5.13", desc: "Sử dụng hóa chất cấm khi chưa được EHS kiểm tra" }, { code: "5.14", desc: "Hóa chất không có MSDS" }, { code: "5.15", desc: "Để nhiễu, chảy tràn hóa chất ra sàn, môi trường" }, { code: "5.16", desc: "Hóa chất không được lưu trữ trong các dụng cụ chuyên dụng" }, ] },
  { group: "Biển cảnh báo", items: [ { code: "6.1", desc: "Khu vực nguy hiểm không có cảnh báo" }, { code: "6.2", desc: "Sử dụng không đúng cảnh báo" }, { code: "6.3", desc: "Bảng/băng/dây cảnh báo bị mờ, bong tróc" }, { code: "6.4", desc: "Cảnh báo dơ bẩn không được vệ sinh" }, { code: "6.5", desc: "Để đồ che chắn cảnh báo" }, { code: "6.6", desc: "Vị trí sửa chữa nguy hiểm không có cảnh báo" }, { code: "6.7", desc: "Không LOTO trước khi sửa chữa" }, { code: "6.8", desc: "Không thông báo làm việc tia lửa, trên cao…" }, { code: "6.9", desc: "Không treo cảnh báo khi sạc xe nâng" }, { code: "6.10", desc: "Nguồn điện cao không có cảnh báo" }, { code: "6.11", desc: "Không treo cảnh báo khi dùng thang/ sai thời gian" }, { code: "6.12", desc: "Không khóa cửa thang khi không dùng" }, { code: "6.13", desc: "Vị trí có hố sâu không có rào/cảnh báo" }, ] },
  { group: "Phân loại rác", items: [ { code: "7.1", desc: "Không tiến hành phân loại rác" }, { code: "7.2", desc: "Phân loại rác không đúng quy định" }, ] },
  { group: "Phòng cháy chữa cháy", items: [ { code: "8.1", desc: "Không trang bị bình chữa cháy" }, { code: "8.2", desc: "Che chắn lối thoát hiểm" }, { code: "8.3", desc: "Che chắn bình/tủ chữa cháy" }, { code: "8.4", desc: "Che chắn nút kéo chuông báo cháy" }, { code: "8.5", desc: "Dụng cụ chữa cháy dùng sai mục đích" }, { code: "8.6", desc: "Vật liệu dễ cháy gần nguồn nhiệt" }, { code: "8.7", desc: "Không kiểm tra PCCC định kỳ tháng" }, { code: "8.8", desc: "Tự ý di dời/để bình sai nơi quy định" }, ] },
  { group: "Máy móc", items: [ { code: "9.1", desc: "Máy không có SOP" }, { code: "9.2", desc: "SOP không cập nhật mới" }, { code: "9.3", desc: "Che chắn thông tin SOP" }, { code: "9.4", desc: "Tem nhãn hướng dẫn rách/bong" }, { code: "9.5", desc: "Nút điều khiển không có tiếng Việt" }, { code: "9.6", desc: "Thiết bị chuyển động không có hộp bảo vệ" }, { code: "9.7", desc: "Không tắt máy khi không sử dụng" }, { code: "9.9", desc: "Không tắt điện/nước khi không làm việc" }, { code: "9.10", desc: "Che chắn Sensor an toàn" }, { code: "9.11", desc: "Không có DS nhân viên vận hành lò" }, { code: "9.12", desc: "Thiết bị hư không báo sửa chữa" }, { code: "9.14", desc: "Không kiểm tra quạt" }, { code: "9.15", desc: "Không kiểm tra trước khi vận hành" }, { code: "9.16", desc: "Không có thẻ CNVH khi dùng vật sắc" }, { code: "9.17", desc: "Chưa đào tạo chứng nhận vận hành" }, ] },
  { group: "Nguyên vật liệu", items: [ { code: "10.1", desc: "Chất cao >1m5 không quấn PE" }, { code: "10.2", desc: "Nguyên liệu không để trên pallet" }, { code: "10.3", desc: "Khiêng vật liệu nặng 1 người" }, { code: "10.4", desc: "Thùng móp bể không thay/ chất lẫn kích thước" }, { code: "10.5", desc: "Không có dây đai chống ngã nguyên liệu" }, { code: "10.6", desc: "Chất hàng không đúng quy định/không gọn" }, { code: "10.7", desc: "Di chuyển VL không dùng dây đai cố định" }, { code: "10.8", desc: "Không cố định cuộn nguyên liệu" }, ] },
  { group: "Hành vi không an toàn", items: [ { code: "11.1", desc: "Cố ý làm hư máy móc thiết bị" }, { code: "11.2", desc: "Cố ý làm hư phương tiện PCCC" }, { code: "11.3", desc: "Leo cao không dùng dây đai" }, { code: "11.4", desc: "Dụng cụ tự chế nguy hiểm" }, { code: "11.5", desc: "Mang bật lửa/thuốc lá nơi dễ cháy" }, { code: "11.6", desc: "Hút thuốc khu vực cấm" }, { code: "11.7", desc: "Cố ý làm mất chức năng an toàn" }, { code: "11.8", desc: "Tự ý đổi thao tác/quy trình/kết cấu" }, { code: "11.9", desc: "Đưa tay vào thiết bị chuyển động" }, { code: "11.10", desc: "Dùng ĐT cá nhân/đeo tai phone khi làm" }, { code: "11.11", desc: "Không cuộn gọn tóc vào nón khi vận hành" }, { code: "11.12", desc: "Phát hiện hư không báo sửa" }, { code: "11.13", desc: "Tự ý tháo cover/che chắn sensor" }, { code: "11.14", desc: "Không hướng dẫn NV mới theo AT" }, { code: "11.15", desc: "Không hướng dẫn giám sát AT nhà thầu" }, { code: "11.16", desc: "Lưu trữ vật nguy hiểm ở tủ cá nhân" }, { code: "11.17", desc: "Vứt rác/khạc nhổ bừa bãi" }, ] },
  { group: "Thái độ hợp tác", items: [ { code: "12.1", desc: "Không hợp tác xử lý an toàn" }, { code: "12.2", desc: "Thái độ đe dọa" }, { code: "12.3", desc: "Đánh người" }, { code: "12.4", desc: "QL không xử lý vi phạm của nhân viên" }, ] },
  { group: "Lỗi Khác", items: [] },
];

/* =========================
   Hàm hỗ trợ ảnh và thời gian
   ========================= */
async function fetchAsDataURL(url) {
  try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
  } catch (e) {
      console.error("Error fetching data URL:", e);
      return null;
  }
}

async function makeThumbDataURL(url, maxW = 96, maxH = 96, quality = 0.55) {
  try {
    const dataUrl = await fetchAsDataURL(url);
    if (!dataUrl) return url;
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return url;
  }
}

const safeTsToDate = (ts) => {
    if (!ts) return null;
    if (ts instanceof Timestamp) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    if (typeof ts === 'string') {
        const parts = ts.match(/(\d+)/g);
        if (parts && parts.length === 6) {
            const [h, m, s, day, month, year] = parts.map(Number);
            return new Date(year, month - 1, day, h, m, s);
        }
    }
    const n = Number(ts);
    if (!Number.isNaN(n)) return new Date(n);
    return null;
};

const parseDateStr = (s) => {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
  const dateObj = new Date(s);
  return isNaN(dateObj.getTime()) ? null : dateObj;
};

const formatDateStr = (d) => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/* =========================
   ExportModal
   ========================= */
function ExportModal({ onClose, departments }) {
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDept, setSelectedDept] = useState("all");

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      if (!startDate || !endDate) {
          alert("Vui lòng chọn ngày bắt đầu và kết thúc.");
          setIsGenerating(false); return;
      }
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);

      let qy = query(
        collection(db, "tu_gemba_logs"),
        where("timestamp", ">=", Timestamp.fromDate(start)),
        where("timestamp", "<=", Timestamp.fromDate(end))
      );

      if (selectedDept !== 'all') {
        qy = query(qy, where("department", "==", selectedDept));
      }

      const eventsSnapshot = await getDocs(qy);
      if (eventsSnapshot.empty) {
        alert("Không có dữ liệu trong khoảng ngày / bộ phận đã chọn.");
        setIsGenerating(false); return;
      }
      
      const rows = [];
      eventsSnapshot.forEach((docSnap) => {
        const ev = docSnap.data();
        const ts = safeTsToDate(ev.timestamp);
        const dateISO = ts ? ts.toISOString().slice(0, 10) : "";

        rows.push({
          dateISO,
          department: ev.department || "",
          ...ev,
          beforeUrl: ev.imageUrl || "", 
          imageUrls: ev.imageUrls || [],
          afterUrl: ev.improvementImageUrl || "",
        });
      });

      // Sắp xếp các hạng mục từ trên xuống dưới theo bộ phận
      rows.sort((a, b) => {
        const deptA = (a.department || "").toLowerCase();
        const deptB = (b.department || "").toLowerCase();
        return deptA.localeCompare(deptB, 'vi');
      });

      const label = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`;
      await exportCAP(rows, label, selectedDept);

    } catch (err) {
      console.error("Có lỗi khi xuất báo cáo:", err);
      alert(`Xuất báo cáo thất bại: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportCAP = async (rows, label, department) => {
    const [{ default: ExcelJS }, { saveAs }] = await Promise.all([ import("exceljs"), import("file-saver") ]);
    const resp = await fetch("/templates/CAP.xlsx", { cache: "no-store" });
    if (!resp.ok) throw new Error("Không tìm thấy template CAP.xlsx");
    const buf = await resp.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Sheet1") || wb.worksheets[0];
    if (!ws) throw new Error("Template CAP.xlsx thiếu Sheet1.");
    
    // Explicitly enforce columns widths up to Column 20
    const baseWidths = [6, 30, 15, 18, 22, 20, 35, 15, 18, 20, 31.29, 31.29, 22, 20];
    for (let idx = 0; idx < 20; idx++) {
      ws.getColumn(idx + 1).width = idx < baseWidths.length ? baseWidths[idx] : 31.29;
    }

    let rowIndex = 7;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const findings = r.note ? `${r.desc}\n\nGhi chú: ${r.note}` : r.desc;
      
      const borderThin = {
        left: { style: 'thin', color: { auto: true } },
        right: { style: 'thin', color: { auto: true } },
        top: { style: 'thin', color: { auto: true } },
        bottom: { style: 'thin', color: { auto: true } }
      };

      for (let c = 1; c <= 20; c++) {
        const cell = ws.getCell(rowIndex, c);
        cell.border = borderThin;
        cell.font = { name: 'Times New Roman', size: 11 };
        if (c === 1 || c === 3 || c === 4 || c === 8 || c === 9 || c === 10) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      }

      // Calculate Progress Status and Comment dynamically
      let progressStatus = "Chưa thực hiện";
      let ehsComment = "";

      const hasImprovementInfo = r.responsiblePerson || r.dueDate || r.progressNotes || r.completionDate || r.afterUrl;

      if (r.completionDate) {
        progressStatus = "Đã hoàn thành";
        const compDate = parseDateStr(r.completionDate);
        const limitDate = r.dueDate ? parseDateStr(r.dueDate) : null;
        if (compDate && limitDate && compDate > limitDate) {
          ehsComment = `Hoàn thành trễ hạn (Hạn: ${r.dueDate.split('-').reverse().join('/')}, Hoàn thành: ${r.completionDate.split('-').reverse().join('/')})`;
        } else {
          ehsComment = "Hoàn thành đúng hạn";
        }
      } else if (hasImprovementInfo) {
        if (r.dueDate) {
          const limitDate = parseDateStr(r.dueDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (limitDate) {
            limitDate.setHours(0, 0, 0, 0);
            if (today > limitDate) {
              progressStatus = "Quá hạn";
              const diffTime = Math.abs(today - limitDate);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              ehsComment = `Quá hạn từ ngày ${r.dueDate.split('-').reverse().join('/')} (Quá hạn ${diffDays} ngày)`;
            } else {
              progressStatus = "Đang tiến hành";
            }
          } else {
            progressStatus = "Đang tiến hành";
          }
        } else {
          progressStatus = "Đang tiến hành";
        }
      }

      if (r.dueDateHistory && r.dueDateHistory.length > 0) {
        const historyText = r.dueDateHistory.join('\n');
        ehsComment = ehsComment ? `${ehsComment}\n${historyText}` : historyText;
      }

      ws.getCell(rowIndex, 1).value = i + 1; // No.
      ws.getCell(rowIndex, 2).value = findings; // Findings
      ws.getCell(rowIndex, 3).value = r.dateISO; // Audit date
      ws.getCell(rowIndex, 4).value = r.addedBy || ""; // Auditor
      ws.getCell(rowIndex, 5).value = r.department || ""; // Responsible Department
      ws.getCell(rowIndex, 6).value = r.responsiblePerson || ""; // Information Recipient
      ws.getCell(rowIndex, 7).value = r.progressNotes || ""; // Corrective Action
      ws.getCell(rowIndex, 8).value = r.responsiblePerson || ""; // PIC
      ws.getCell(rowIndex, 9).value = progressStatus; // Progress Status
      ws.getCell(rowIndex, 10).value = r.dueDate || ""; // Estimated Completion Date
      ws.getCell(rowIndex, 13).value = ""; // EHS Assessment (blank)
      ws.getCell(rowIndex, 14).value = ehsComment; // Comment

      let imageAdded = false;
      const processImage = async (url, col) => {
        if (!url) return;
        const b64 = await fetchAsDataURL(url);
        if (b64) {
          const imgId = wb.addImage({ base64: b64.split(',')[1], extension: "png" });
          const img = new Image();
          await new Promise(resolve => { 
            img.onload = resolve; 
            img.onerror = resolve; 
            img.src = b64; 
          });
          if (img.width && img.height) {
            const maxWidth = 224, maxHeight = 167;
            const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
            const newWidth = img.width * ratio, newHeight = img.height * ratio;
            const xOffset = (maxWidth - newWidth) / 2, yOffset = (maxHeight - newHeight) / 2;
            ws.addImage(imgId, { tl: { col: col - 1 + (xOffset / maxWidth), row: rowIndex - 1 + (yOffset / maxHeight) }, ext: { width: newWidth, height: newHeight } });
            imageAdded = true;
          }
        }
      };

      // Process "Before" pictures
      const beforeImages = r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls : (r.beforeUrl ? [r.beforeUrl] : []);
      for (let j = 0; j < beforeImages.length; j++) {
        const url = beforeImages[j];
        if (j === 0) {
          await processImage(url, 11); // Column 11 (K)
        } else {
          const col = 15 + (j - 1); // Column 15 (O), 16 (P)...
          await processImage(url, col);
        }
      }
      
      // Process "After" picture in Column 12 (L)
      if (r.afterUrl) {
        await processImage(r.afterUrl, 12);
      }

      if (imageAdded) ws.getRow(rowIndex).height = 125.25;
      rowIndex++;
    }
    const fileNameDept = department === 'all' ? 'ToanBo' : department;
    const out = await wb.xlsx.writeBuffer();
    saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `TuGemba_CAP_${fileNameDept}_${label}.xlsx`);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
      <div style={{ background: colors.surface, padding: 22, borderRadius: 12, width: 520, boxShadow: "0 4px 15px rgba(0,0,0,.2)" }}>
        <h3 style={{ marginTop: 0, color: colors.primary }}>Xuất báo cáo CAP (Tự Gemba)</h3>
        <div style={{ display: 'grid', gap: '15px' }}>
          <div>
            <label style={{ fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: 5 }}>Chọn khoảng ngày</label>
            <DatePicker
              selectsRange={true}
              startDate={startDate}
              endDate={endDate}
              onChange={(update) => setDateRange(update)}
              isClearable={true}
              dateFormat="dd/MM/yyyy"
              placeholderText="Bắt buộc"
              className="date-picker-input"
              wrapperClassName="date-picker-wrapper"
            />
          </div>
          <div>
            <label style={{ fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: 5 }}>Chọn bộ phận</label>
            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="date-picker-input">
              <option value="all">Tất cả bộ phận</option>
              {departments.map(dept => <option key={dept.name} value={dept.name}>{dept.name}</option>)}
            </select>
          </div>
        </div>
        <style>{`.date-picker-wrapper{width:100%}.date-picker-input{width:100%;padding:8px;border-radius:6px;border:1px solid ${colors.border};box-sizing:border-box}`}</style>
        <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button onClick={onClose} disabled={isGenerating} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, cursor: "pointer" }}>Hủy</button>
          <button onClick={handleExport} disabled={isGenerating || !startDate || !endDate} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#1f80e0", color: colors.white, fontWeight: 700, cursor: "pointer" }}>{isGenerating ? "Đang xử lý..." : "Xuất CAP"}</button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   CỬA SỔ (MODAL) CẢI THIỆN
   ========================= */
function ImprovementModal({ modalData, onClose, onSave }) {
  const [responsiblePerson, setResponsiblePerson] = useState(modalData.error?.responsiblePerson || "");
  const [dueDate, setDueDate] = useState(modalData.error?.dueDate || "");
  const [progressNotes, setProgressNotes] = useState(modalData.error?.progressNotes || "");
  const [completionDate, setCompletionDate] = useState(modalData.error?.completionDate || "");
  const [improvementImageFile, setImprovementImageFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const opt = { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true };
      try {
        const processed = file.size > opt.maxSizeMB * 1024 * 1024 ? await imageCompression(file, opt) : file;
        setImprovementImageFile(processed);
      } catch (err) {
        console.error("Lỗi nén ảnh cải thiện:", err);
        alert("Đã xảy ra lỗi xử lý ảnh.");
        setImprovementImageFile(null);
      }
    } else {
      setImprovementImageFile(null);
    }
  };
  const handleSave = async () => {
    setIsSaving(true);
    let imageUrl = modalData.error?.improvementImageUrl || null;
    if (improvementImageFile) {
      try {
        const imageRef = ref(storage, `tu_gemba_improvement_images/${Date.now()}_${improvementImageFile.name}`);
        await uploadBytes(imageRef, improvementImageFile);
        imageUrl = await getDownloadURL(imageRef);
      } catch (error) {
        console.error("Lỗi tải ảnh cải thiện: ", error);
        alert("Tải ảnh cải thiện thất bại!");
        setIsSaving(false);
        return;
      }
    }
    const improvementData = { responsiblePerson, dueDate, progressNotes, completionDate, improvementImageUrl: imageUrl };
    await onSave(modalData.logId, improvementData);
    setIsSaving(false);
    onClose();
  };
  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${colors.border}`, marginTop: 5, boxSizing: 'border-box' };
  const labelStyle = { fontWeight: 600, color: '#333' };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1001 }}>
      <div style={{ background: colors.surface, padding: 22, borderRadius: 12, width: '90%', maxWidth: 550, boxShadow: "0 4px 15px rgba(0,0,0,.2)" }}>
        <h3 style={{ marginTop: 0, color: colors.primary, borderBottom: `2px solid ${colors.primaryLight}`, paddingBottom: 10 }}>Cập nhật Cải thiện & Khắc phục</h3>
        <p><b>Lỗi:</b> {modalData.error.desc}</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <div> <label style={labelStyle}>Người phụ trách</label> <input type="text" value={responsiblePerson} onChange={e => setResponsiblePerson(e.target.value)} style={inputStyle} /> </div>
          <div>
            <label style={labelStyle}>Ngày dự kiến hoàn thành</label>
            <DatePicker
              selected={dueDate ? parseDateStr(dueDate) : null}
              onChange={(date) => setDueDate(formatDateStr(date))}
              dateFormat="dd/MM/yyyy"
              placeholderText="dd/mm/yyyy"
              className="date-picker-input"
              customInput={<input style={inputStyle} />}
            />
          </div>
          <div> <label style={labelStyle}>Ghi chú tiến độ</label> <textarea value={progressNotes} onChange={e => setProgressNotes(e.target.value)} style={{...inputStyle, minHeight: 70}} /> </div>
          <div>
            <label style={labelStyle}>Ngày hoàn thành</label>
            <DatePicker
              selected={completionDate ? parseDateStr(completionDate) : null}
              onChange={(date) => setCompletionDate(formatDateStr(date))}
              dateFormat="dd/MM/yyyy"
              placeholderText="dd/mm/yyyy"
              className="date-picker-input"
              customInput={<input style={inputStyle} />}
            />
          </div>
          <div>
            <label style={labelStyle}>Ảnh cải thiện</label>
            <input type="file" accept="image/*" onChange={handleImageChange} style={{...inputStyle, padding: 5}} />
            {modalData.error.improvementImageUrl && !improvementImageFile && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Ảnh cải thiện đã lưu:</span>
                <a href={modalData.error.improvementImageUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={modalData.error.improvementImageUrl}
                    alt="Ảnh cải thiện"
                    style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, border: `1px solid ${colors.border}`, display: 'block', objectFit: 'contain' }}
                  />
                </a>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={isSaving} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, cursor: "pointer" }}>Hủy</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: colors.primary, color: colors.white, fontWeight: 700, cursor: "pointer" }}> {isSaving ? "Đang lưu..." : "Lưu thay đổi"} </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Component chính TuGemba
   ========================= */
function TuGemba({ user, isMobile, newLogCounts, setTuGembaNotifCounts }) {
  const { t } = useI18n();
  const { askConfirm } = useConfirm();
  const [depIndex, setDepIndex] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedError, setSelectedError] = useState("");
  const [allScores, setAllScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const [imageFiles, setImageFiles] = useState([]);
  const [imageFileNames, setImageFileNames] = useState([]);

  const [isUploading, setIsUploading] = useState(false);
  const [viewer, setViewer] = useState({ open: false, list: [], index: 0 });
  const [note, setNote] = useState("");
  const fileRef = useRef();
  const [thumbMap, setThumbMap] = useState({});
  const [improvementModal, setImprovementModal] = useState({ isOpen: false, error: null, logId: "" });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const dep = departments[depIndex];
  const isCustomError = selectedGroup === "Lỗi Khác";
  const userRole = (user && user.role) ? user.role.toLowerCase() : "";

  // === Tự sửa chính tả ===
  const CLOUD_FUNCTION_URL = 'https://askai-zvblqnzylq-as.a.run.app';
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [correctedNote, setCorrectedNote] = useState("");

  const scoreList = allScores
    .filter(score => {
        const scoreDate = safeTsToDate(score.timestamp);
        if (!scoreDate) return false;
        return scoreDate.toISOString().slice(0, 7) === selectedMonth;
    })
    .sort((a, b) => {
        const dateA = safeTsToDate(a.timestamp);
        const dateB = safeTsToDate(b.timestamp);
        if (!dateA) return 1; if (!dateB) return -1;
        return dateB - dateA;
    });

  useEffect(() => {
    if (!dep) return;
    setLoading(true);
    const q = query(collection(db, "tu_gemba_logs"), where("department", "==", dep.name));
    const unsub = onSnapshot(q, (snap) => {
      const logs = [];
      snap.forEach(d => {
        logs.push({ id: d.id, ...d.data() });
      });
      setAllScores(logs);
      setLoading(false);
    }, (error) => {
      console.warn("Lỗi onSnapshot tu_gemba_logs:", error.code);
      setAllScores([]);
      setLoading(false);
    });
    return () => unsub();
  }, [dep]);

  useEffect(() => {
    runCleanup();
  }, []);

  useEffect(() => {
    const run = async () => {
      const urls = (allScores || []).flatMap(e => e.imageUrls || (e.imageUrl ? [e.imageUrl] : [])).filter(Boolean);
      const tasks = urls.filter(u => !thumbMap[u]).map(async (u) => {
        const t = await makeThumbDataURL(u, 96, 96, 0.55);
        return [u, t];
      });
      if (tasks.length) {
        const pairs = await Promise.all(tasks);
        const next = { ...thumbMap };
        pairs.forEach(([u, t]) => { next[u] = t; });
        setThumbMap(next);
      }
    };
    run();
  }, [allScores]);
  
  const handleSelectDepartment = (index) => {
    setDepIndex(index);
    const departmentName = departments[index].name;
    if (newLogCounts && newLogCounts[departmentName] > 0) {
      try {
        const now = new Date().toISOString();
        const storageKey = "tuGembaLastSeenTimestamps";
        const timestamps = JSON.parse(localStorage.getItem(storageKey) || "{}");
        timestamps[departmentName] = now;
        localStorage.setItem(storageKey, JSON.stringify(timestamps));
        if (user && user.uid) {
          const prefRef = doc(db, "user_prefs", user.uid);
          setDoc(prefRef, { [storageKey]: timestamps }, { merge: true }).catch(e => console.warn("Lưu prefs lỗi:", e));
        }
        const updatedCounts = { ...newLogCounts, [departmentName]: 0 };
        setTuGembaNotifCounts(updatedCounts);
      } catch (e) { console.error("Lỗi khi cập nhật localStorage:", e); }
    }
  };

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      if (files.length > 5) {
        alert("Bạn chỉ có thể chọn tối đa 5 ảnh.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const opt = { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true };
      try {
        const processedFiles = await Promise.all(files.map(file => 
          file.size > opt.maxSizeMB * 1024 * 1024 ? imageCompression(file, opt) : file
        ));
        setImageFiles(processedFiles);
        setImageFileNames(processedFiles.map(f => f.name));
      } catch (err) {
        console.error("Lỗi nén ảnh:", err);
        alert("Đã xảy ra lỗi xử lý ảnh.");
        setImageFiles([]);
        setImageFileNames([]);
        if (fileRef.current) fileRef.current.value = "";
      }
    } else { 
      setImageFiles([]); 
      setImageFileNames([]);
    }
  };

  async function handleAddError() {
    if (!selectedGroup) { alert(t("gemba.alert.selectGroup")); return; }
    if (!isCustomError && !selectedError) { alert(t("gemba.alert.selectError")); return; }
    if (!note.trim()) { alert(t("gemba.alert.requireNote")); return; }
    if (imageFiles.length === 0) { alert(t("gemba.alert.requirePhoto")); return; }

    if (autoCorrect && note.trim()) {
      setIsCorrecting(true);
      try {
        const data = await callAIService(
          `Sửa lỗi chính tả, câu cú và dấu câu cho đoạn văn tiếng Việt sau. Chỉ trả về đoạn văn đã sửa, không giải thích, không thêm nội dung nào khác:\n${note.trim()}`,
          [],
          CLOUD_FUNCTION_URL
        );
        const corrected = (data.response || "").trim();
        if (corrected) {
          setCorrectedNote(corrected);
          setShowCorrectModal(true);
          setIsCorrecting(false);
          return;
        }
      } catch (e) {
        console.error("Lỗi sửa chính tả:", e);
        alert("Không thể kết nối dịch vụ AI để tự động sửa chính tả. Hệ thống sẽ tiếp tục lưu với ghi chú gốc của bạn.");
      }
      setIsCorrecting(false);
    }

    await doSaveError(note);
  }

  async function doSaveError(noteToUse) {
    setIsUploading(true);
    let urls = [];
    try {
      urls = await Promise.all(
        imageFiles.map(async (file) => {
          const imageRef = ref(storage, `tu_gemba_images/${Date.now()}_${file.name}`);
          await uploadBytes(imageRef, file);
          return await getDownloadURL(imageRef);
        })
      );
    } catch (error) { 
      console.error("Lỗi tải ảnh: ", error); 
      alert("Tải ảnh thất bại!");
      setIsUploading(false); 
      return;
    }

    let logData;
    if (isCustomError) {
      logData = { 
        department: dep.name,
        group: selectedGroup, 
        code: `custom-${Date.now()}`, 
        desc: "Lỗi khác", 
        timestamp: serverTimestamp(), 
        imageUrls: urls, 
        note: noteToUse, 
        addedBy: user.name 
      };
    } else {
      const errors = (errorGroups.find((g) => g.group === selectedGroup) || { items: [] }).items;
      const err = errors.find((e) => e.code === selectedError);
      logData = { 
        department: dep.name,
        group: selectedGroup, 
        ...err, 
        timestamp: serverTimestamp(), 
        imageUrls: urls, 
        note: noteToUse, 
        addedBy: user.name 
      };
    }
    
    await addDoc(collection(db, "tu_gemba_logs"), logData);

    const errorTimeSec = Math.floor(Date.now() / 1000);
    const notificationRelatedId = `tugemba-${dep.name}-${logData.code || 'nocode'}-${errorTimeSec}`;
    try {
      await addDoc(collection(db, "notifications"), {
        type: "new_tu_gemba_error",
        message: `${user.name} đã thêm lỗi mới tại ${dep.name} (Tự Gemba): ${logData.desc}`,
        targetRoles: ["ehs", "admin", "ehs committee"],
        createdBy: user.uid,
        readBy: [],
        relatedId: notificationRelatedId,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Lỗi gửi thông báo:", e);
    }

    setSelectedError(""); 
    setImageFiles([]);
    setImageFileNames([]);
    if (fileRef.current) fileRef.current.value = "";
    setNote(""); 
    setIsUploading(false);
  }

  async function handleDelete(logId) {
    const errorToDelete = allScores.find(s => s.id === logId);
    if (!errorToDelete) return;
    if (await askConfirm(`Bạn có chắc muốn XÓA VĨNH VIỄN lỗi "${errorToDelete.desc}" không?`, "Xác nhận xóa lỗi")) {
        try {
          await deleteDoc(doc(db, "tu_gemba_logs", logId));
        } catch (err) {
          console.error("Lỗi khi xóa khỏi tu_gemba_logs:", err);
          alert("Xóa vi phạm thất bại!");
          return;
        }

        const images = errorToDelete.imageUrls || (errorToDelete.imageUrl ? [errorToDelete.imageUrl] : []);
        for (const url of images) {
          try { await deleteObject(ref(storage, url)); } catch (e) { console.error("Lỗi xóa ảnh gốc:", e); }
        }
        if (errorToDelete.improvementImageUrl) {
          try { await deleteObject(ref(storage, errorToDelete.improvementImageUrl)); } catch(e) { console.error("Lỗi xóa ảnh cải thiện:", e); }
        }

        let errorSec = 0;
        if (errorToDelete.timestamp) {
          if (typeof errorToDelete.timestamp.seconds === 'number') {
            errorSec = errorToDelete.timestamp.seconds;
          } else {
            const dt = safeTsToDate(errorToDelete.timestamp);
            if (dt) errorSec = Math.floor(dt.getTime() / 1000);
          }
        }
        const deleteRelatedId = `tugemba-${dep.name}-${errorToDelete.code || 'nocode'}-${errorSec}`;
        try {
          const qNotif = query(collection(db, "notifications"), where("relatedId", "==", deleteRelatedId));
          const snapNotif = await getDocs(qNotif);
          
          if (!snapNotif.empty) {
            const batchNotif = writeBatch(db);
            snapNotif.forEach(d => batchNotif.delete(d.ref));
            await batchNotif.commit();
          } else {
            const prefix = `tugemba-${dep.name}-${errorToDelete.code || 'nocode'}-`;
            const qPrefix = query(
              collection(db, "notifications"),
              where("relatedId", ">=", prefix),
              where("relatedId", "<", prefix + "\uf8ff")
            );
            const snapPrefix = await getDocs(qPrefix);
            if (!snapPrefix.empty) {
              const batchNotif = writeBatch(db);
              let deletedCount = 0;
              snapPrefix.forEach(d => {
                const data = d.data();
                const notifRelatedId = data.relatedId || "";
                const parts = notifRelatedId.split("-");
                const notifSec = Number(parts[parts.length - 1]);
                if (!isNaN(notifSec) && Math.abs(notifSec - errorSec) < 60) {
                  batchNotif.delete(d.ref);
                  deletedCount++;
                } else if (errorToDelete.code?.startsWith("custom-")) {
                  batchNotif.delete(d.ref);
                  deletedCount++;
                }
              });
              if (deletedCount > 0) {
                await batchNotif.commit();
              }
            }
          }
        } catch (err) {
          console.error("Lỗi khi xóa thông báo liên quan:", err);
        }
    }
  }
  
  const handleSaveImprovement = async (logId, improvementData) => {
    const errorToUpdate = allScores.find(s => s.id === logId);
    if (!errorToUpdate) return;

    const oldDueDate = errorToUpdate.dueDate || "";
    let newDueDateHistory = errorToUpdate.dueDateHistory || [];
    if (improvementData.dueDate && oldDueDate && improvementData.dueDate !== oldDueDate) {
      const todayStr = new Date().toLocaleDateString("vi-VN");
      const changeMsg = `Gia hạn lần ${newDueDateHistory.length + 1}: ${oldDueDate.split('-').reverse().join('/')} -> ${improvementData.dueDate.split('-').reverse().join('/')} vào ngày ${todayStr}`;
      newDueDateHistory.push(changeMsg);
    }

    const docRef = doc(db, "tu_gemba_logs", logId);
    await updateDoc(docRef, {
      ...improvementData,
      dueDateHistory: newDueDateHistory
    });
  };
  
  const ActionButton = ({ onClick, title, children, color = "#555", bg = "#f0f0f0" }) => (
    <button onClick={onClick} title={title} style={{ border: `1px solid ${color === colors.white ? 'transparent' : color}`, background: bg, color: color, borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 2px', lineHeight: 1, padding: 0 }}>
      {children}
    </button>
  );

  const openViewer = (list, index = 0) => setViewer({ open: true, list, index });
  const closeViewer = () => setViewer({ open: false, list: [], index: 0 });
  const goPrev = () => setViewer(v => ({ ...v, index: (v.index - 1 + v.list.length) % v.list.length }));
  const goNext = () => setViewer(v => ({ ...v, index: (v.index + 1) % v.list.length }));

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: isMobile ? '10px' : '30px' }}>
      <div style={{ width: '100%', maxWidth: '1600px' }}>
        {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} departments={departments} />}
        {improvementModal.isOpen && <ImprovementModal modalData={improvementModal} onClose={() => setImprovementModal({ isOpen: false, error: null, logId: "" })} onSave={handleSaveImprovement} />}

        {/* Popup xác nhận sửa chính tả */}
        {showCorrectModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1002 }}>
            <div style={{ background: '#fff', padding: 26, borderRadius: 16, width: '92%', maxWidth: 540, boxShadow: '0 6px 32px rgba(0,0,0,.25)' }}>
              <h3 style={{ marginTop: 0, color: colors.primary, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✍️ Đề xuất sửa ghi chú
              </h3>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, color: '#888', marginBottom: 6, fontSize: 13 }}>Bản gốc:</div>
                <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note}</div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontWeight: 600, color: '#2e7d32', marginBottom: 6, fontSize: 13 }}>✨ Đã sửa:</div>
                <div style={{ background: '#f1f8e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: '10px 14px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{correctedNote}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={async () => { setShowCorrectModal(false); await doSaveError(note); }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#f5f5f5', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                >
                  Dùng bản gốc
                </button>
                <button
                  onClick={async () => { setShowCorrectModal(false); await doSaveError(correctedNote); }}
                  style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                >
                  ✓ Dùng bản đã sửa
                </button>
              </div>
            </div>
          </div>
        )}
        
        <LightboxSwipeOnly
          open={viewer.open}
          list={viewer.list}
          index={viewer.index}
          onClose={closeViewer}
          onPrev={goPrev}
          onNext={goNext}
        />
 
        <div style={{ display: "flex", flexDirection: isMobile ? 'column' : 'row', alignItems: "flex-start", gap: 32, width: "100%" }}>
          <div style={{ flex: "1 1 auto", minWidth: 270, order: isMobile ? 2 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 18, color: colors.primary }}>
                Tự Gemba: {departments[depIndex].name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: 8, borderRadius: 6, border: `1px solid ${colors.border}` }} />
                  <button onClick={() => setShowExportModal(true)} style={{ background: "#1f80e0", color: colors.white, border: "none", padding: "8px 15px", borderRadius: 6, fontWeight: "bold", cursor: "pointer", marginTop: isMobile ? 10 : 0 }}>
                    {t("report.export.cap")}
                  </button>
              </div>
            </div>
            <div style={{ marginBottom: 15 }}>
                <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>{t("gemba.group.label")}</div>
                <select value={selectedGroup} onChange={(e) => { setSelectedGroup(e.target.value); setSelectedError(""); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15 }}>
                <option value="">{t("gemba.group.placeholder")}</option>
                {errorGroups.map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
                </select>
            </div>
            {!isCustomError && selectedGroup && (
              <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>{t("gemba.error.label")}</div>
                  <select value={selectedError} onChange={(e) => setSelectedError(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15 }}>
                  <option value="">{t("gemba.error.placeholder")}</option>
                  {(errorGroups.find(g => g.group === selectedGroup)?.items || []).map(e => <option key={e.code} value={e.code}>{e.code} - {e.desc}</option>)}
                  </select>
              </div>
            )}
            {isCustomError && (
                <div style={{ border: `1.5px solid ${colors.primaryLight}`, borderRadius: 8, padding: 15, marginBottom: 15 }}>
                     <div style={{ fontSize: 15, color: colors.textPrimary, fontWeight: 700, marginBottom: 10 }}>{t("gemba.custom.detail")}</div>
                    <div style={{ fontSize: 14, color: "#666" }}>
                      Vui lòng nhập chi tiết lỗi phát hiện ở phần ghi chú bên dưới và tải lên ảnh bằng chứng.
                    </div>
                </div>
            )}
            <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>{t("gemba.note.label")}</div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={isCustomError ? t("gemba.note.custom.placeholder") : t("gemba.note.placeholder")} style={{ width: "100%", minHeight: 60, boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15, fontFamily: "sans-serif" }} />
            </div>
            {/* Checkbox tự sửa chính tả */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={autoCorrect}
                  onChange={e => setAutoCorrect(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: colors.primary, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, color: colors.textPrimary, fontWeight: 500 }}>
                  {t("gemba.autoCorrect")}
                </span>
              </label>
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: "wrap" }}>
                <input id="imageUploadTuGemba" type="file" accept="image/*" onChange={handleImageChange} ref={fileRef} style={{ display: 'none' }} multiple />
                <label htmlFor="imageUploadTuGemba" style={{background: 'white', color: colors.primary, border: `1.2px solid ${colors.primaryLight}`, borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 600}}>
                    {t("gemba.attach", { count: imageFiles.length }).replace("{count}", imageFiles.length)}
                </label>
                <span style={{fontStyle: 'italic', fontSize: 14, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {imageFileNames.length > 0 ? imageFileNames.join(', ') : t("common.noImage")}
                </span>
                <button onClick={handleAddError} disabled={isUploading || isCorrecting} style={{ marginLeft: 'auto', height: 38, background: isCorrecting ? '#888' : colors.primary, color: colors.white, borderRadius: 9, border: "none", padding: "0 26px", fontWeight: 700, fontSize: 16, cursor: "pointer", opacity: (isUploading || isCorrecting) ? 0.7 : 1 }}>
                    {isCorrecting ? t("gemba.correcting") : isUploading ? t("gemba.uploading") : t("gemba.add")}
                </button>
            </div>
            
            {loading ? <div>{t("gemba.loading")}</div> : (
              isMobile ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {scoreList.length > 0 ? scoreList.map((e) => {
                    const images = e.imageUrls || (e.imageUrl ? [e.imageUrl] : []);
                    const isImproved = e.completionDate && e.improvementImageUrl;
                    return (
                      <div key={e.id} style={{ border: '1.2px solid ' + colors.primaryLight, borderRadius: 12, padding: 12, background: colors.surface, boxShadow: `0 1.5px 10px ${colors.primary}11` }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary }}>{safeTsToDate(e.timestamp)?.toLocaleString('vi-VN')}</div>
                          <div style={{ fontWeight: 700, color: colors.primary }}>{e.group}</div>
                        </div>
                        <div style={{ marginTop: 6, overflowWrap:'anywhere' }}>
                          {e.group === 'Lỗi Khác' ? 'Lỗi khác' : e.desc}
                          {e.addedBy && <div style={{fontSize: 11, color: colors.textSecondary, fontStyle:'italic'}}>{t("gemba.by")} {e.addedBy}</div>}
                        </div>
                        {images.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ position:'relative', display:'inline-block', cursor:'pointer' }} onClick={() => openViewer(images, 0)}>
                              <img src={thumbMap[images[0]] || images[0]} alt="ảnh lỗi" style={{ width: 56, height: 56, borderRadius: 6, objectFit:'cover' }}/>
                              {images.length > 1 && (
                                <span style={{ position:'absolute', top:-6, right:-6, background:'rgba(0,0,0,0.7)', color:'#fff', borderRadius:'50%', width:20, height:20, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>+{images.length-1}</span>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 8, display:'flex', justifyContent:'flex-end', gap:6, alignItems:'center' }}>
                          <ActionButton onClick={() => setImprovementModal({ isOpen: true, error: e, logId: e.id })} title={t("gemba.improve.action")} color={colors.white} bg={isImproved ? '#4caf50' : '#f44336'}><ImprovementIcon /></ActionButton>
                          {(userRole === 'admin' || userRole === 'ehs') && (
                            <ActionButton onClick={() => handleDelete(e.id)} title={t("gemba.delete.action")} color="#d32f2f" bg="transparent">x</ActionButton>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{textAlign:'center', padding:20}}>{t("gemba.empty")}</div>
                  )}
                </div>
              ) : (
    <table style={{ marginTop: 10, width: "100%", borderCollapse: "separate", borderSpacing: 0, boxShadow: `0 1.5px 10px ${colors.primary}11`, border: `1.2px solid ${colors.primaryLight}`, background: colors.surface, borderRadius: 12, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: colors.primaryLight }}>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary }}>{t("gemba.table.time")}</th>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary }}>{t("gemba.table.group")}</th>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary, width: "50%" }}>{t("gemba.table.desc")}</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary }}>{t("gemba.table.photo")}</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary }}>{t("gemba.table.note")}</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary, minWidth: 120 }}>{t("gemba.table.action")}</th>
                    </tr>
                  </thead>
                  <tbody key={dep.name}>
                  {scoreList.length > 0 ? scoreList.map((e) => {
                     const isImproved = e.completionDate && e.improvementImageUrl;
                     const images = e.imageUrls || (e.imageUrl ? [e.imageUrl] : []);
                     return (
                      <tr key={e.id}>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>{safeTsToDate(e.timestamp)?.toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "10px 14px" }}>{e.group}</td>
                      <td style={{ padding: "10px 14px" }}>{e.group === 'Lỗi Khác' ? 'Lỗi khác' : e.desc} {e.addedBy && <div style={{fontSize: '11px', color: colors.textSecondary, fontStyle: 'italic'}}>{t("gemba.by")} {e.addedBy}</div>}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        {images.length > 0 && (
                          <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }} onClick={() => openViewer(images, 0)}>
                            <img src={thumbMap[images[0]] || images[0]} alt="ảnh lỗi" style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover" }}/>
                            {images.length > 1 && (
                              <span style={{ position: 'absolute', top: -5, right: -5, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                +{images.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>{(e.note || (e.group === 'Lỗi Khác' && e.desc !== 'Lỗi khác' ? e.desc : null)) && <button onClick={() => alert(`Ghi chú:\n\n${e.note || e.desc}`)} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer" }} title="Xem ghi chú">🗒️</button>}</td>
                      <td style={{ textAlign: "center" }}>
                          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <ActionButton onClick={() => setImprovementModal({ isOpen: true, error: e, logId: e.id })} title="Cải thiện/Khắc phục" color={colors.white} bg={isImproved ? "#4caf50" : "#f44336"}> <ImprovementIcon /> </ActionButton>
                            {(userRole === "admin" || userRole === "ehs") && ( <ActionButton onClick={() => handleDelete(e.id)} title="Xóa lỗi" color="#d32f2f" bg="transparent">x</ActionButton> )}
                          </div>
                      </td>
                      </tr>
                  )}) : ( <tr><td colSpan="6" style={{textAlign: 'center', padding: '20px'}}>{t("gemba.empty")}</td></tr> )}
                  </tbody>
              </table>
              ))}
          </div>
          <div style={{ width: '100%', order: isMobile ? 1 : 2, flexShrink: 0, [isMobile ? 'width' : 'maxWidth']: isMobile ? '100%' : 220 }}>
              {isMobile ? (
              <div style={{ marginBottom: 20 }}>
                  <label htmlFor="dept-select" style={{ fontWeight: 700, color: colors.primary, display: 'block', marginBottom: 8 }}>Chọn bộ phận:</label>
                  <select id="dept-select" value={depIndex} onChange={(e) => handleSelectDepartment(parseInt(e.target.value, 10))} style={{ width: "100%", padding: "12px 15px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 16, background: colors.surface, fontWeight: 'bold', color: colors.textPrimary }}>
                  {departments.map((d, i) => (<option key={d.name} value={i}>{d.name}</option>))}
                  </select>
              </div>
              ) : (
              <div style={{ padding: 18, background: colors.primaryLight, borderRadius: 14, boxShadow: `0 1.5px 10px ${colors.primary}11` }}>
                  <div style={{ fontWeight: 700, color: colors.primary, marginBottom: 14, fontSize: 17 }}>Bộ phận</div>
                  <div>
                  {departments.map((d, i) => (
                      <button key={d.name} style={{ display: "block", width: "100%", marginBottom: 10, padding: "10px 15px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 15, background: depIndex === i ? colors.primary : colors.backgroundLight, color: depIndex === i ? colors.white : colors.primary, boxShadow: depIndex === i ? `0 1.5px 7px ${colors.primary}33` : "none", cursor: "pointer", transition: "all .13s", position: 'relative' }} onClick={() => handleSelectDepartment(i)}>
                      {d.name}
                      {newLogCounts && newLogCounts[d.name] > 0 && (
                        <span style={{ position: 'absolute', top: 5, right: 8, background: 'red', color: 'white', borderRadius: '50%', width: 20, height: 20, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {newLogCounts[d.name]}
                        </span>
                      )}
                      </button>
                  ))}
                  </div>
              </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================== CLEANUP FUNCTION ======================
async function runCleanup() {
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const sevenMonthsAgoTimestamp = Timestamp.fromDate(sevenMonthsAgo);
    try {
        const oldLogsQuery = query(collection(db, "tu_gemba_logs"), where("timestamp", "<=", sevenMonthsAgoTimestamp));
        const oldLogsSnap = await getDocs(oldLogsQuery);
        if (oldLogsSnap.empty) return;
        let batch = writeBatch(db); let count = 0;
        const imagesToDelete = [];
        for (const document of oldLogsSnap.docs) {
            const logData = document.data();
            const allImages = [...(logData.imageUrls || []), ...(logData.imageUrl ? [logData.imageUrl] : []), ...(logData.improvementImageUrl ? [logData.improvementImageUrl] : [])];
            imagesToDelete.push(...allImages);
            batch.delete(document.ref);
            count++;
            if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        if (count > 0) await batch.commit();
        for (const url of imagesToDelete) {
            try {
                const imageRef = ref(storage, url);
                await deleteObject(imageRef);
            } catch (error) {
                if (error.code !== 'storage/not-found') { console.error("Lỗi xóa ảnh cũ từ Storage:", error); }
            }
        }
    } catch (error) { console.error("Lỗi trong quá trình cleanup Tự Gemba:", error); }
}

export default TuGemba;