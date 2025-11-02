// File: gembachecklist.jsx (Phiên bản đã sửa lỗi hoàn chỉnh)
// Đã có key={dep.name} và các sửa lỗi khác.

import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../firebase";
import {
  doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp,
  query, where, getDocs, Timestamp, writeBatch, deleteDoc, getDoc,
  updateDoc, arrayUnion
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import imageCompression from "browser-image-compression";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { colors } from "../theme";

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
  { name: "Cutting", defaultPeople: 15 }, { name: "Rolling", defaultPeople: 55 },
  { name: "Finishing", defaultPeople: 22 }, { name: "Dipping", defaultPeople: 68 },
  { name: "Graphics", defaultPeople: 12 }, { name: "QC", defaultPeople: 34 },
  { name: "Warehouse", defaultPeople: 72 }, { name: "Arrow", defaultPeople: 17 },
  { name: "MTN", defaultPeople: 95 }, { name: "ENG", defaultPeople: 110 },
];

function calcHeSo(people) {
  if (people < 20) return 5; if (people <= 50) return 4;
  if (people <= 70) return 3; if (people <= 100) return 2;
  return 1;
}

const errorGroups = [
  { group: "Bảo hộ lao động (PPE)", items: [ { code: "1.1", desc: "Không sử dụng hoặc sử dụng không đúng loại BHLĐ", point: 4 }, { code: "1.2", desc: "Sử dụng BHLĐ không đúng quy cách/ sai mục đích", point: 4 }, { code: "1.3", desc: "Không bảo quản BHLĐ/ Để không đúng vị trí", point: 2 }, { code: "1.4", desc: "BHLĐ không được vệ sinh định kỳ/ dơ bẩn", point: 2 }, { code: "1.5", desc: "BHLĐ không được thay mới khi đến kỳ/ không có thời gian theo dõi", point: 4 }, ] },
  { group: "5S", items: [ { code: "2.1", desc: "Không sàng lọc, loại bỏ các vật dụng không cần thiết", point: 2 }, { code: "2.2", desc: "Không phân loại, sắp xếp, tổ chức các vật dụng, dụng cụ theo trật tự", point: 4 }, { code: "2.3", desc: "Không layout các vị trí quy định như tủ điện, bình chữa cháy, khu vực để dụng cụ làm việc,…", point: 2 }, { code: "2.4", desc: "Layout bị bong tróc", point: 2 }, { code: "2.5", desc: "Không định kỳ vệ sinh khu vực làm việc/ không có lịch vệ sinh", point: 4 }, { code: "2.6", desc: "Vệ Sinh", point: 2 }, { code: "2.7", desc: "Không kiểm tra Checklist 5S", point: 2 }, { code: "2.8", desc: "Dụng cụ vệ sinh để không đúng nơi quy định", point: 2 }, { code: "2.9", desc: "Bộ phận phát sinh bụi bẩn, rác", point: 2 }, ] },
  { group: "Hệ thống điện", items: [ { code: "3.1", desc: "Nguồn điện bị rò rỉ", point: 6 }, { code: "3.2", desc: "Ổ cắm điện bị chảy nhựa", point: 6 }, { code: "3.3", desc: "Tủ điện không được khóa", point: 4 }, { code: "3.4", desc: "Để dụng cụ, hàng hóa che chắn tủ điện", point: 4 }, { code: "3.5", desc: "Đèn báo nguồn của tủ điện không hoạt động", point: 2 }, { code: "3.6", desc: "Máy móc, thiết bị điện không được nối đất", point: 4 }, { code: "3.7", desc: "Dây nối đất không đúng quy cách", point: 2 }, { code: "3.8", desc: "Không có nút che chắn các ổ cắm trống", point: 2 }, { code: "3.9", desc: "Dây điện bị bong tróc", point: 6 }, { code: "3.10", desc: "Dây điện không gọn gàng", point: 4 }, { code: "3.11", desc: "Các vật liệu dễ cháy để gần tủ điện", point: 4 }, { code: "3.12", desc: "Không tắt điện máy móc, thiết bị khi không sử dụng", point: 2 }, { code: "3.13", desc: "Vị trí đấu nối dây không có ống bảo vệ", point: 4 }, { code: "3.14", desc: "Để dụng cụ, vật dụng đè lên dây dẫn điện", point: 4 }, { code: "3.15", desc: "Ổ cắm điện bị đóng bụi không được vệ sinh", point: 4 }, { code: "3.16", desc: "Không tắt đèn khu vực làm việc khi giải lao", point: 4 }, ] },
  { group: "Dụng cụ", items: [ { code: "4.1", desc: "Dụng cụ làm việc sử dụng không đúng mục đích", point: 4 }, { code: "4.2", desc: "Dụng cụ làm việc để không đúng nơi quy định", point: 4 }, { code: "4.3", desc: "Dụng cụ làm việc có nguy cơ gây mất an toàn", point: 4 }, ] },
  { group: "Hóa chất", items: [ { code: "5.1", desc: "Hóa chất không có tem nhãn", point: 4 }, { code: "5.2", desc: "Tem nhãn hóa chất phai mờ, không đọc được thông tin", point: 4 }, { code: "5.3", desc: "Hóa chất không để trong khay chống tràn", point: 4 }, { code: "5.4", desc: "Hóa chất sử dụng xong không đậy nắp", point: 4 }, { code: "5.5", desc: "Hóa chất để chung với các vật liệu, thiết bị dễ cháy nổ", point: 6 }, { code: "5.6", desc: "Hóa chất chất cao có nguy cơ ngã đổ", point: 4 }, { code: "5.7", desc: "Hóa chất lưu trữ không đúng nơi quy định", point: 4 }, { code: "5.8", desc: "Khi di chuyển hóa chất không sử dụng xe đẩy chống tràn", point: 4 }, { code: "5.9", desc: "Tủ lưu trữ hóa chất rách, bong tróc, không có danh sách lưu trữ", point: 2 }, { code: "5.10", desc: "Kệ/ phuy sang chiết hóa chất/ thùng khuấy sơn không có dây nối đất", point: 4 }, { code: "5.11", desc: "Để rò rỉ hóa chất ra ngoài không vệ sinh, môi trường", point: 4 }, { code: "5.12", desc: "Lưu trữ các thùng carton, vật liệu dễ cháy nổ trong kho hóa chất", point: 4 }, { code: "5.13", desc: "Sử dụng hóa chất cấm khi chưa được EHS kiểm tra", point: 4 }, { code: "5.14", desc: "Hóa chất không có MSDS", point: 6 }, { code: "5.15", desc: "Để nhiễu, chảy tràn hóa chất ra sàn, môi trường", point: 4 }, { code: "5.16", desc: "Hóa chất không được lưu trữ trong các dụng cụ chuyên dụng", point: 4 }, ] },
  { group: "Biển cảnh báo", items: [ { code: "6.1", desc: "Khu vực nguy hiểm không có cảnh báo", point: 4 }, { code: "6.2", desc: "Sử dụng không đúng cảnh báo", point: 2 }, { code: "6.3", desc: "Bảng/băng/dây cảnh báo bị mờ, bong tróc", point: 2 }, { code: "6.4", desc: "Cảnh báo dơ bẩn không được vệ sinh", point: 4 }, { code: "6.5", desc: "Để đồ che chắn cảnh báo", point: 4 }, { code: "6.6", desc: "Vị trí sửa chữa nguy hiểm không có cảnh báo", point: 6 }, { code: "6.7", desc: "Không LOTO trước khi sửa chữa", point: 4 }, { code: "6.8", desc: "Không thông báo làm việc tia lửa, trên cao…", point: 6 }, { code: "6.9", desc: "Không treo cảnh báo khi sạc xe nâng", point: 4 }, { code: "6.10", desc: "Nguồn điện cao không có cảnh báo", point: 4 }, { code: "6.11", desc: "Không treo cảnh báo khi dùng thang/ sai thời gian", point: 4 }, { code: "6.12", desc: "Không khóa cửa thang khi không dùng", point: 4 }, { code: "6.13", desc: "Vị trí có hố sâu không có rào/cảnh báo", point: 4 }, ] },
  { group: "Phân loại rác", items: [ { code: "7.1", desc: "Không tiến hành phân loại rác", point: 6 }, { code: "7.2", desc: "Phân loại rác không đúng quy định", point: 4 }, ] },
  { group: "Phòng cháy chữa cháy", items: [ { code: "8.1", desc: "Không trang bị bình chữa cháy", point: 6 }, { code: "8.2", desc: "Che chắn lối thoát hiểm", point: 6 }, { code: "8.3", desc: "Che chắn bình/tủ chữa cháy", point: 6 }, { code: "8.4", desc: "Che chắn nút kéo chuông báo cháy", point: 4 }, { code: "8.5", desc: "Dụng cụ chữa cháy dùng sai mục đích", point: 4 }, { code: "8.6", desc: "Vật liệu dễ cháy gần nguồn nhiệt", point: 4 }, { code: "8.7", desc: "Không kiểm tra PCCC định kỳ tháng", point: 4 }, { code: "8.8", desc: "Tự ý di dời/để bình sai nơi quy định", point: 4 }, ] },
  { group: "Máy móc", items: [ { code: "9.1", desc: "Máy không có SOP", point: 6 }, { code: "9.2", desc: "SOP không cập nhật mới", point: 4 }, { code: "9.3", desc: "Che chắn thông tin SOP", point: 4 }, { code: "9.4", desc: "Tem nhãn hướng dẫn rách/bong", point: 4 }, { code: "9.5", desc: "Nút điều khiển không có tiếng Việt", point: 4 }, { code: "9.6", desc: "Thiết bị chuyển động không có hộp bảo vệ", point: 6 }, { code: "9.7", desc: "Không tắt máy khi không sử dụng", point: 4 }, { code: "9.9", desc: "Không tắt điện/nước khi không làm việc", point: 4 }, { code: "9.10", desc: "Che chắn Sensor an toàn", point: 6 }, { code: "9.11", desc: "Không có DS nhân viên vận hành lò", point: 4 }, { code: "9.12", desc: "Thiết bị hư không báo sửa chữa", point: 4 }, { code: "9.14", desc: "Không kiểm tra quạt", point: 2 }, { code: "9.15", desc: "Không kiểm tra trước khi vận hành", point: 4 }, { code: "9.16", desc: "Không có thẻ CNVH khi dùng vật sắc", point: 4 }, { code: "9.17", desc: "Chưa đào tạo chứng nhận vận hành", point: 6 }, ] },
  { group: "Nguyên vật liệu", items: [ { code: "10.1", desc: "Chất cao >1m5 không quấn PE", point: 4 }, { code: "10.2", desc: "Nguyên liệu không để trên pallet", point: 2 }, { code: "10.3", desc: "Khiêng vật liệu nặng 1 người", point: 4 }, { code: "10.4", desc: "Thùng móp bể không thay/ chất lẫn kích thước", point: 4 }, { code: "10.5", desc: "Không có dây đai chống ngã nguyên liệu", point: 4 }, { code: "10.6", desc: "Chất hàng không đúng quy định/không gọn", point: 2 }, { code: "10.7", desc: "Di chuyển VL không dùng dây đai cố định", point: 4 }, { code: "10.8", desc: "Không cố định cuộn nguyên liệu", point: 4 }, ] },
  { group: "Hành vi không an toàn", items: [ { code: "11.1", desc: "Cố ý làm hư máy móc thiết bị", point: 6 }, { code: "11.2", desc: "Cố ý làm hư phương tiện PCCC", point: 6 }, { code: "11.3", desc: "Leo cao không dùng dây đai", point: 6 }, { code: "11.4", desc: "Dụng cụ tự chế nguy hiểm", point: 4 }, { code: "11.5", desc: "Mang bật lửa/thuốc lá nơi dễ cháy", point: 6 }, { code: "11.6", desc: "Hút thuốc khu vực cấm", point: 6 }, { code: "11.7", desc: "Cố ý làm mất chức năng an toàn", point: 6 }, { code: "11.8", desc: "Tự ý đổi thao tác/quy trình/kết cấu", point: 6 }, { code: "11.9", desc: "Đưa tay vào thiết bị chuyển động", point: 6 }, { code: "11.10", desc: "Dùng ĐT cá nhân/đeo tai phone khi làm", point: 4 }, { code: "11.11", desc: "Không cuộn gọn tóc vào nón khi vận hành", point: 4 }, { code: "11.12", desc: "Phát hiện hư không báo sửa", point: 4 }, { code: "11.13", desc: "Tự ý tháo cover/che chắn sensor", point: 6 }, { code: "11.14", desc: "Không hướng dẫn NV mới theo AT", point: 6 }, { code: "11.15", desc: "Không hướng dẫn giám sát AT nhà thầu", point: 6 }, { code: "11.16", desc: "Lưu trữ vật nguy hiểm ở tủ cá nhân", point: 6 }, { code: "11.17", desc: "Vứt rác/khạc nhổ bừa bãi", point: 4 }, ] },
  { group: "Thái độ hợp tác", items: [ { code: "12.1", desc: "Không hợp tác xử lý an toàn", point: 6 }, { code: "12.2", desc: "Thái độ đe dọa", point: 6 }, { code: "12.3", desc: "Đánh người", point: 6 }, { code: "12.4", desc: "QL không xử lý vi phạm của nhân viên", point: 6 }, ] },
  { group: "Khác", items: [ { code: "13.1", desc: "Không có DS NV khu vực nghiêm ngặt", point: 4 }, { code: "13.2", desc: "Không tuân thủ các quy định an toàn", point: 6 }, { code: "13.3", desc: "Đồng phục không đúng quy định", point: 4 }, { code: "13.4", desc: "Thức ăn/ nước uống ở khu vực làm việc", point: 2 }, { code: "13.5", desc: "Tai nạn lao động", point: 40 }, ] },
  { group: "Lỗi Khác", items: []},
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

/* =========================
   ExportModal
   ========================= */
function ExportModal({ onClose, departments }) {
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDept, setSelectedDept] = useState("all");

  const getDateRange = () => {
    if (!startDate || !endDate) throw new Error("Vui lòng chọn ngày bắt đầu và kết thúc.");
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const label = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`;
    return { start, end, label };
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
    
    const imageColumns = [9, 11, 12, 13, 14]; 
    imageColumns.forEach(col => ws.getColumn(col).width = 31.29);
    ws.getColumn(10).width = 31.29;

    let rowIndex = 7;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const findings = r.note ? `${r.desc}\n\nGhi chú: ${r.note}` : r.desc;
      ws.getCell(rowIndex, 1).value = i + 1;
      ws.getCell(rowIndex, 2).value = findings;
      ws.getCell(rowIndex, 3).value = r.department;
      ws.getCell(rowIndex, 4).value = r.dateISO;
      ws.getCell(rowIndex, 5).value = r.addedBy || "";
      ws.getCell(rowIndex, 6).value = r.responsiblePerson || "";
      ws.getCell(rowIndex, 7).value = r.completionDate || "";
      ws.getCell(rowIndex, 8).value = r.progressNotes || "";
      ws.getCell(rowIndex, 2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      
      let imageAdded = false;
      const processImage = async (url, col) => {
        if (!url) return;
        const b64 = await fetchAsDataURL(url);
        if (b64) {
          const imgId = wb.addImage({ base64: b64.split(',')[1], extension: "png" });
          const img = new Image();
          await new Promise(resolve => { img.onload = resolve; img.src = b64; });
          const maxWidth = 224, maxHeight = 167;
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
          const newWidth = img.width * ratio, newHeight = img.height * ratio;
          const xOffset = (maxWidth - newWidth) / 2, yOffset = (maxHeight - newHeight) / 2;
          ws.addImage(imgId, { tl: { col: col - 1 + (xOffset / maxWidth), row: rowIndex - 1 + (yOffset / maxHeight) }, ext: { width: newWidth, height: newHeight } });
          imageAdded = true;
        }
      };

      const imagesToProcess = r.imageUrls || (r.beforeUrl ? [r.beforeUrl] : []);
      for(let j = 0; j < imagesToProcess.length && j < imageColumns.length; j++) {
        await processImage(imagesToProcess[j], imageColumns[j]);
      }
      
      if (r.afterUrl) await processImage(r.afterUrl, 10);

      if (imageAdded) ws.getRow(rowIndex).height = 125.25;
      rowIndex++;
    }
    const fileNameDept = department === 'all' ? 'ToanBo' : department;
    const out = await wb.xlsx.writeBuffer();
    saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `CAP_${fileNameDept}_${label}.xlsx`);
  };
  
  const exportBangChamDiem = async (rows, label, allDeptData) => {
    const [{ default: ExcelJS }, { saveAs }] = await Promise.all([ import("exceljs"), import("file-saver"), ]);
    const resp = await fetch("/templates/BangChamDiem.xlsx", { cache: "no-store" });
    if (!resp.ok) throw new Error("Không tìm thấy template BangChamDiem.xlsx");
    const buf = await resp.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const errorRowMap = {};
    let currentRow = 5;
    errorGroups.forEach(group => { group.items.forEach(item => { if (item.code !== 'custom' && currentRow <= 39) errorRowMap[item.code] = currentRow++; }); });
    const byDeptWithErrors = new Map();
    rows.forEach(r => { if (!byDeptWithErrors.has(r.department)) byDeptWithErrors.set(r.department, []); byDeptWithErrors.get(r.department).push(r); });
    for (const dept of departments) {
      const depName = dept.name;
      const ws = wb.getWorksheet(depName);
      if (!ws) continue;
      const currentDeptData = allDeptData.get(depName);
      const peopleCount = currentDeptData?.people !== undefined ? currentDeptData.people : dept.defaultPeople;
      const heSo = calcHeSo(peopleCount);
      ws.getCell('C3').value = depName;
      ws.getCell('E3').value = peopleCount;
      ws.getCell('G3').value = heSo;
      const deptRows = byDeptWithErrors.get(depName);
      if (deptRows && deptRows.length > 0) {
        const errorsByCode = new Map();
        deptRows.forEach(r => {
          if (!r.code || r.code.startsWith('custom')) return;
          if (!errorsByCode.has(r.code)) errorsByCode.set(r.code, { count: 0, desc: r.desc, basePoint: r.basePoint, adjusted: r.adjusted, notes: [], });
          const errorData = errorsByCode.get(r.code);
          errorData.count += 1;
          if (r.note) errorData.notes.push(r.note);
        });
        errorsByCode.forEach((data, code) => {
          const rowIndex = errorRowMap[code];
          if (rowIndex) {
            ws.getCell(`C${rowIndex}`).value = data.count;
            ws.getCell(`D${rowIndex}`).value = data.desc;
            ws.getCell(`E${rowIndex}`).value = data.basePoint;
            ws.getCell(`F${rowIndex}`).value = data.adjusted;
            ws.getCell(`G${rowIndex}`).value = { formula: `C${rowIndex}*F${rowIndex}` };
            ws.getCell(`H${rowIndex}`).value = data.notes.join('\n');
            ws.getCell(`H${rowIndex}`).alignment = { wrapText: true, vertical: 'top' };
          }
        });
        ws.getCell('G40').value = { formula: 'SUM(G5:G39)' };
        ws.getCell('G41').value = { formula: '100-G40' }; 
      } else {
        ws.getCell('G40').value = 0;
        ws.getCell('G41').value = { formula: '100-G40' };
      }
    }
    const out = await wb.xlsx.writeBuffer();
    saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `BangChamDiem_${label}.xlsx`);
  };

  const handleExport = async (mode) => {
    setIsGenerating(true);
    try {
      const { start, end, label } = getDateRange();
      let qy = query(
        collection(db, "gemba_events"),
        where("timestamp", ">=", Timestamp.fromDate(start)),
        where("timestamp", "<=", Timestamp.fromDate(end))
      );
      
      if (mode === 'cap' && selectedDept !== 'all') {
        qy = query(qy, where("department", "==", selectedDept));
      }

      const eventsSnapshot = await getDocs(qy);
      if (eventsSnapshot.empty) {
        alert(`Không có dữ liệu trong khoảng thời gian / bộ phận đã chọn.`);
        setIsGenerating(false); return;
      }
      const rows = [];
      eventsSnapshot.forEach((docSnap) => {
        const ev = docSnap.data();
        const ts = safeTsToDate(ev.timestamp);
        const dateISO = ts ? ts.toISOString().slice(0, 10) : "";
        rows.push({
          dateISO, department: ev.department || "", ...ev.error,
          basePoint: Number.isFinite(ev.error?.point) ? ev.error.point : 0,
          heSo: ev.heSo, adjusted: Number(((ev.error.point + ev.heSo) / 2).toFixed(2)),
          addedBy: ev.addedBy || "", 
          beforeUrl: ev.error.imageUrl || "", 
          imageUrls: ev.error.imageUrls || [],
          afterUrl: ev.error.improvementImageUrl || "",
        });
      });

      if (mode === "cap") {
        await exportCAP(rows, label, selectedDept);
      } else {
        const gembaScoresCollectionRef = collection(db, "gemba_scores");
        const scoresSnapshot = await getDocs(gembaScoresCollectionRef);
        const allDeptData = new Map();
        scoresSnapshot.forEach(doc => { allDeptData.set(doc.id, doc.data()); });
        const activeRows = rows.filter(row => {
            const deptData = allDeptData.get(row.department);
            if (!deptData || !deptData.scores) return true;
            return deptData.scores.some(score => {
                const scoreTs = safeTsToDate(score.timestamp)?.getTime();
                const rowTs = safeTsToDate(row.timestamp)?.getTime();
                return scoreTs === rowTs;
            });
        });
        await exportBangChamDiem(activeRows, label, allDeptData);
      }
    } catch (err) {
      console.error("Có lỗi khi xuất báo cáo:", err);
      alert(`Xuất báo cáo thất bại: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
      <div style={{ background: colors.surface, padding: 22, borderRadius: 12, width: 520, boxShadow: "0 4px 15px rgba(0,0,0,.2)" }}>
        <h3 style={{ marginTop: 0, color: colors.primary }}>Xuất báo cáo</h3>
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
            <label style={{ fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: 5 }}>Chọn bộ phận (chỉ cho CAP)</label>
            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="date-picker-input">
              <option value="all">Tất cả bộ phận</option>
              {departments.map(dept => <option key={dept.name} value={dept.name}>{dept.name}</option>)}
            </select>
          </div>
        </div>
        <style>{`.date-picker-wrapper{width:100%}.date-picker-input{width:100%;padding:8px;border-radius:6px;border:1px solid ${colors.border};box-sizing:border-box}`}</style>
        <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button onClick={onClose} disabled={isGenerating} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, cursor: "pointer" }}>Hủy</button>
          <button onClick={() => handleExport("bang")} disabled={isGenerating || !startDate || !endDate} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: colors.success, color: colors.white, fontWeight: 700, cursor: "pointer" }}>{isGenerating ? "Đang xử lý..." : "Xuất BẢNG CHẤM ĐIỂM"}</button>
          <button onClick={() => handleExport("cap")} disabled={isGenerating || !startDate || !endDate} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#1f80e0", color: colors.white, fontWeight: 700, cursor: "pointer" }}>{isGenerating ? "Đang xử lý..." : "Xuất CAP"}</button>
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
      const opt = { maxSizeMB: 3, maxWidthOrHeight: 1920, useWebWorker: true };
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
        const imageRef = ref(storage, `gemba_improvement_images/${Date.now()}_${improvementImageFile.name}`);
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
    await onSave(modalData.index, improvementData);
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
          <div> <label style={labelStyle}>Ngày dự kiến hoàn thành</label> <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /> </div>
          <div> <label style={labelStyle}>Ghi chú tiến độ</label> <textarea value={progressNotes} onChange={e => setProgressNotes(e.target.value)} style={{...inputStyle, minHeight: 70}} /> </div>
          <div> <label style={labelStyle}>Ngày hoàn thành</label> <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} style={inputStyle} /> </div>
          <div>
            <label style={labelStyle}>Ảnh cải thiện</label>
            <input type="file" accept="image/*" onChange={handleImageChange} style={{...inputStyle, padding: 5}} />
            {modalData.error.improvementImageUrl && !improvementImageFile && <a href={modalData.error.improvementImageUrl} target="_blank" rel="noopener noreferrer" style={{fontSize: 12}}>Xem ảnh đã tải lên</a>}
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
   Component chính GembaCheckList
   ========================= */
function GembaCheckList({ user, isMobile, newErrorCounts, setGembaNotifCounts }) {
  const [depIndex, setDepIndex] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedError, setSelectedError] = useState("");
  const [allScores, setAllScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [peopleCount, setPeopleCount] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const [imageFiles, setImageFiles] = useState([]);
  const [imageFileNames, setImageFileNames] = useState([]);

  const [isUploading, setIsUploading] = useState(false);
  const [viewer, setViewer] = useState({ open: false, list: [], index: 0 });
  const [otherErrorSeverity, setOtherErrorSeverity] = useState("Nhẹ");
  const [note, setNote] = useState("");
  const fileRef = useRef();
  const [thumbMap, setThumbMap] = useState({});
  const [improvementModal, setImprovementModal] = useState({ isOpen: false, error: null, index: -1 });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const dep = departments[depIndex];
  const heSo = calcHeSo(peopleCount);
  const isCustomError = selectedGroup === "Lỗi Khác";
  const userRole = (user && user.role) ? user.role.toLowerCase() : "";

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

  const sum = scoreList.reduce((total, error) => total + (error.point + heSo) / 2, 0);
  const remainingScore = 100 - sum;

  useEffect(() => {
    if (!dep) return;
    setLoading(true);
    const docRef = doc(db, "gemba_scores", dep.name);
    const unsub = onSnapshot(docRef, (snap) => {
      const defaultPeople = dep.defaultPeople || 0;
      if (snap.exists()) {
        const data = snap.data();
        setAllScores(data.scores || []);
        setPeopleCount(data.people !== undefined ? data.people : defaultPeople);
      } else {
        setAllScores([]); setPeopleCount(defaultPeople);
      }
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
    if (newErrorCounts && newErrorCounts[departmentName] > 0) {
      try {
        const timestamps = JSON.parse(localStorage.getItem("gembaLastSeenTimestamps") || "{}");
        timestamps[departmentName] = new Date().toISOString();
        localStorage.setItem("gembaLastSeenTimestamps", JSON.stringify(timestamps));
        const updatedCounts = { ...newErrorCounts, [departmentName]: 0 };
        setGembaNotifCounts(updatedCounts);
      } catch (e) { console.error("Lỗi khi cập nhật localStorage:", e); }
    }
  };

  async function handleSavePeople() {
    const docRef = doc(db, "gemba_scores", dep.name);
    try { await setDoc(docRef, { people: peopleCount }, { merge: true });
    } catch (error) { console.error("Lỗi cập nhật số người: ", error); alert("Có lỗi xảy ra khi cập nhật."); }
  }

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      if (files.length > 5) {
        alert("Bạn chỉ có thể chọn tối đa 5 ảnh.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const opt = { maxSizeMB: 3, maxWidthOrHeight: 1920, useWebWorker: true };
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
    if (!selectedGroup) { alert("Vui lòng chọn nhóm lỗi."); return; }
    if (!isCustomError && !selectedError) { alert("Vui lòng chọn lỗi cụ thể."); return; }
    if (isCustomError && !note.trim()) { alert("Vui lòng nhập mô tả chi tiết cho lỗi tại ô Ghi chú."); return; }
    if (imageFiles.length === 0) { alert("Vui lòng tải lên ít nhất 1 ảnh bằng chứng."); return; }
    
    setIsUploading(true);
    let urls = [];
    try {
      urls = await Promise.all(
        imageFiles.map(async (file) => {
          const imageRef = ref(storage, `gemba_images/${Date.now()}_${file.name}`);
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

    let newErrorObject;
    if (isCustomError) {
      const points = { Nhẹ: 2, Nặng: 4, "Nghiêm trọng": 6 };
      newErrorObject = { group: selectedGroup, code: `custom-${Date.now()}`, desc: note, point: points[otherErrorSeverity], timestamp: Timestamp.now(), imageUrls: urls, note: note, addedBy: user.name };
    } else {
      const errors = (errorGroups.find((g) => g.group === selectedGroup) || { items: [] }).items;
      const err = errors.find((e) => e.code === selectedError);
      newErrorObject = { group: selectedGroup, ...err, timestamp: Timestamp.now(), imageUrls: urls, note: note, addedBy: user.name };
    }
    const docRef = doc(db, "gemba_scores", dep.name);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) { await updateDoc(docRef, { scores: arrayUnion(newErrorObject) });
    } else { await setDoc(docRef, { scores: [newErrorObject], people: peopleCount }); }
    const eventData = { department: dep.name, error: { ...newErrorObject, timestamp: new Date().toLocaleString("vi-VN") }, peopleCount: peopleCount, heSo: heSo, addedBy: user.name, timestamp: serverTimestamp() };
    await addDoc(collection(db, "gemba_events"), eventData);

    setSelectedError(""); 
    setImageFiles([]);
    setImageFileNames([]);
    if (fileRef.current) fileRef.current.value = "";
    setOtherErrorSeverity("Nhẹ"); setNote(""); setIsUploading(false);
  }

  async function handleDelete(idx) {
    const errorToDelete = scoreList[idx];
    if (window.confirm(`Bạn có chắc muốn XÓA VĨNH VIỄN lỗi "${errorToDelete.desc}" không?`)) {
        const newAllScores = allScores.filter(score => score.timestamp !== errorToDelete.timestamp);
        const docRef = doc(db, "gemba_scores", dep.name);
        await setDoc(docRef, { scores: newAllScores }, { merge: true });
    }
  }
  
  const handleSaveImprovement = async (indexInFilteredList, improvementData) => {
    const errorToUpdate = scoreList[indexInFilteredList];
    const originalIndex = allScores.findIndex(s => s.timestamp === errorToUpdate.timestamp);
    if (originalIndex === -1) return;
    const newAllScores = [...allScores];
    newAllScores[originalIndex] = { ...allScores[originalIndex], ...improvementData };
    const docRef = doc(db, "gemba_scores", dep.name);
    await setDoc(docRef, { scores: newAllScores }, { merge: true });
  };
  
  const numberInputStyle = { width: 60, fontSize: 16, padding: "2px 5px", border: `1px solid ${colors.primaryLight}`, borderRadius: 4, MozAppearance: "textfield" };
  const numberInputWebkitStyle = `input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }`;
  const ActionButton = ({ onClick, title, children, color = "#555", bg = "#f0f0f0" }) => (
    <button onClick={onClick} title={title} style={{ border: `1px solid ${color === colors.white ? 'transparent' : color}`, background: bg, color: color, borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 2px', lineHeight: 1, padding: 0 }}>
      {children}
    </button>
  );

  const openViewer = (list, index = 0) => setViewer({ open: true, list, index });
  const closeViewer = () => setViewer({ open: false, list: [], index: 0 });

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: isMobile ? '10px' : '30px' }}>
      <div style={{ width: '100%', maxWidth: '1600px' }}>
        {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} departments={departments} />}
        {improvementModal.isOpen && <ImprovementModal modalData={improvementModal} onClose={() => setImprovementModal({ isOpen: false, error: null, index: -1 })} onSave={handleSaveImprovement} />}
        
        {viewer.open && (
          <div onClick={closeViewer} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000 }}>
            <img 
              src={viewer.list[viewer.index]} 
              alt={`Xem ảnh ${viewer.index + 1}`} 
              style={{ maxHeight: "90vh", maxWidth: "90vw", borderRadius: 8 }}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: isMobile ? 'column' : 'row', alignItems: "flex-start", gap: 32, width: "100%" }}>
          <style>{numberInputWebkitStyle}</style>
          <div style={{ flex: "1 1 auto", minWidth: 270, order: isMobile ? 2 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 18, color: colors.primary, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>Bộ phận: {departments[depIndex].name} |</span>
                <span>Số người:</span>
                {(userRole === "admin" || userRole === "ehs") ? (<input type="number" value={peopleCount} onChange={(e) => setPeopleCount(parseInt(e.target.value, 10) || 0)} onBlur={handleSavePeople} style={numberInputStyle} />) : ( <span>{peopleCount}</span> )}
                <span>| Hệ số: {heSo}</span>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: 8, borderRadius: 6, border: `1px solid ${colors.border}` }} />
                  <button onClick={() => setShowExportModal(true)} style={{ background: colors.success, color: colors.white, border: "none", padding: "8px 15px", borderRadius: 6, fontWeight: "bold", cursor: "pointer", marginTop: isMobile ? 10 : 0 }}>
                     Xuất báo cáo
                  </button>
              </div>
            </div>
            <div style={{ marginBottom: 15 }}>
                <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>Chọn nhóm lỗi:</div>
                <select value={selectedGroup} onChange={(e) => { setSelectedGroup(e.target.value); setSelectedError(""); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15 }}>
                <option value="">-- Chọn nhóm lỗi --</option>
                {errorGroups.map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
                </select>
            </div>
            {!isCustomError && selectedGroup && (
              <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>Chọn lỗi:</div>
                  <select value={selectedError} onChange={(e) => setSelectedError(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15 }}>
                  <option value="">-- Chọn lỗi --</option>
                  {(errorGroups.find(g => g.group === selectedGroup)?.items || []).map(e => <option key={e.code} value={e.code}>{e.code} - {e.desc} ({e.point}đ)</option>)}
                  </select>
              </div>
            )}
            {isCustomError && (
                <div style={{ border: `1.5px solid ${colors.primaryLight}`, borderRadius: 8, padding: 15, marginBottom: 15 }}>
                    <div style={{ fontSize: 15, color: colors.textPrimary, fontWeight: 700, marginBottom: 10 }}>Chi tiết lỗi khác:</div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>Mức độ nghiêm trọng:</div>
                        <div style={{ display: "flex", gap: 15, flexWrap: "wrap" }}>
                        {["Nhẹ", "Nặng", "Nghiêm trọng"].map(level => ( <label key={level}> <input type="radio" name="severity" value={level} checked={otherErrorSeverity === level} onChange={(e) => setOtherErrorSeverity(e.target.value)} style={{ marginRight: 4, accentColor: colors.primary }} /> {level} ({level === "Nhẹ" ? 2 : level === "Nặng" ? 4 : 6}đ) </label> ))}
                        </div>
                    </div>
                </div>
            )}
            <div style={{ marginBottom: 15 }}>
                <div style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 5 }}>Ghi chú (giải thích lỗi):</div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={isCustomError ? "Nhập mô tả chi tiết cho lỗi..." : "Thêm giải thích chi tiết nếu cần..."} style={{ width: "100%", minHeight: 60, boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${colors.primaryLight}`, fontSize: 15, fontFamily: "sans-serif" }} />
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: "wrap" }}>
                <input id="imageUploadGemba" type="file" accept="image/*" onChange={handleImageChange} ref={fileRef} style={{ display: 'none' }} multiple />
                <label htmlFor="imageUploadGemba" style={{background: 'white', color: colors.primary, border: `1.2px solid ${colors.primaryLight}`, borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 600}}>
                    Ảnh đính kèm ({imageFiles.length}/5)
                </label>
                <span style={{fontStyle: 'italic', fontSize: 14, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {imageFileNames.length > 0 ? imageFileNames.join(', ') : "Chưa có ảnh"}
                </span>
                <button onClick={handleAddError} disabled={isUploading} style={{ marginLeft: 'auto', height: 38, background: colors.primary, color: colors.white, borderRadius: 9, border: "none", padding: "0 26px", fontWeight: 700, fontSize: 16, cursor: "pointer", opacity: isUploading ? 0.6 : 1 }}>
                    {isUploading ? "Đang tải..." : "Thêm"}
                </button>
            </div>
            
            {loading ? <div>Đang tải dữ liệu...</div> : (
              isMobile ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {scoreList.length > 0 ? scoreList.map((e, i) => {
                    const images = e.imageUrls || (e.imageUrl ? [e.imageUrl] : []);
                    const isImproved = e.completionDate && e.improvementImageUrl;
                    const dateForkey = safeTsToDate(e.timestamp);
                    return (
                      <div key={`${e.code}-${dateForkey ? dateForkey.getTime() : i}`} style={{ border: '1.2px solid ' + colors.primaryLight, borderRadius: 12, padding: 12, background: colors.surface, boxShadow: '0 1.5px 10px #E88E2E11' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary }}>{safeTsToDate(e.timestamp)?.toLocaleString('vi-VN')}</div>
                          <div style={{ fontWeight: 700, color: colors.primary }}>{e.group}</div>
                        </div>
                        <div style={{ marginTop: 6, overflowWrap:'anywhere' }}>
                          {e.desc}
                          {e.addedBy && <div style={{fontSize: 11, color: colors.textSecondary, fontStyle:'italic'}}>Bởi: {e.addedBy}</div>}
                        </div>
                        {images.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ position:'relative', display:'inline-block', cursor:'pointer' }} onClick={() => openViewer(images)}>
                              <img src={thumbMap[images[0]] || images[0]} alt="ảnh lỗi" style={{ width: 56, height: 56, borderRadius: 6, objectFit:'cover' }}/>
                              {images.length > 1 && (
                                <span style={{ position:'absolute', top:-6, right:-6, background:'rgba(0,0,0,0.7)', color:'#fff', borderRadius:'50%', width:20, height:20, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>+{images.length-1}</span>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 10, fontWeight: 700, color: colors.primary }}>Điểm trừ: {((e.point + heSo) / 2).toFixed(2)}</div>
                        <div style={{ marginTop: 8, display:'flex', justifyContent:'flex-end', gap:6, alignItems:'center' }}>
                          <ActionButton onClick={() => setImprovementModal({ isOpen: true, error: e, index: i })} title="Cải thiện/Khắc phục" color={colors.white} bg={isImproved ? '#4caf50' : '#f44336'}><ImprovementIcon /></ActionButton>
                          {(userRole === 'admin' || userRole === 'ehs') && (
                            <ActionButton onClick={() => handleDelete(i)} title="Xóa lỗi" color="#d32f2f" bg="transparent">x</ActionButton>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{textAlign:'center', padding:20}}>Không có lỗi nào trong tháng này.</div>
                  )}
                </div>
              ) : (
    <table style={{ marginTop: 10, width: "100%", borderCollapse: "separate", borderSpacing: 0, boxShadow: "0 1.5px 10px #E88E2E11", border: `1.2px solid ${colors.primaryLight}`, background: colors.surface, borderRadius: 12, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: colors.primaryLight }}>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary }}>Thời gian</th>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary }}>Nhóm lỗi</th>
                        <th style={{ padding: "10px 14px", color: colors.textPrimary, width: "40%" }}>Mô tả</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary }}>Ảnh</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary }}>Ghi chú</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary }}>Điểm trừ</th>
                        <th style={{ padding: "10px 8px", color: colors.textPrimary, minWidth: 120 }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody key={dep.name}>
                  {scoreList.length > 0 ? scoreList.map((e, i) => {
                     const isImproved = e.completionDate && e.improvementImageUrl;
                     const images = e.imageUrls || (e.imageUrl ? [e.imageUrl] : []);
                     const dateForkey = safeTsToDate(e.timestamp);
                     return (
                      <tr key={`${e.code}-${dateForkey ? dateForkey.getTime() : i}`}>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>{safeTsToDate(e.timestamp)?.toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "10px 14px" }}>{e.group}</td>
                      <td style={{ padding: "10px 14px" }}>{e.desc} {e.addedBy && <div style={{fontSize: '11px', color: colors.textSecondary, fontStyle: 'italic'}}>Bởi: {e.addedBy}</div>}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        {images.length > 0 && (
                          <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }} onClick={() => openViewer(images)}>
                            <img src={thumbMap[images[0]] || images[0]} alt="ảnh lỗi" style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover" }}/>
                            {images.length > 1 && (
                              <span style={{ position: 'absolute', top: -5, right: -5, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                +{images.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>{e.note && <button onClick={() => alert(`Ghi chú:\n\n${e.note}`)} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer" }} title="Xem ghi chú">🗒️</button>}</td>
                      <td style={{ padding: "10px 8px", fontWeight: 700, color: colors.primary, textAlign: "center" }}>{((e.point + heSo) / 2).toFixed(2)}</td>
                      <td style={{ textAlign: "center" }}>
                          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <ActionButton onClick={() => setImprovementModal({ isOpen: true, error: e, index: i })} title="Cải thiện/Khắc phục" color={colors.white} bg={isImproved ? "#4caf50" : "#f44336"}> <ImprovementIcon /> </ActionButton>
                            {(userRole === "admin" || userRole === "ehs") && ( <ActionButton onClick={() => handleDelete(i)} title="Xóa lỗi" color="#d32f2f" bg="transparent">x</ActionButton> )}
                          </div>
                      </td>
                      </tr>
                  )}) : ( <tr><td colSpan="7" style={{textAlign: 'center', padding: '20px'}}>Không có lỗi nào trong tháng này.</td></tr> )}
                  </tbody>
              </table>
              ))}
            <div style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 22, marginTop: 28, background: remainingScore < 80 ? "#ffe3e3" : "#e3fff1", borderRadius: 10, padding: "14px 18px", boxShadow: "0 1.5px 7px #00000011", width: "fit-content" }}>
              Số điểm còn lại (Tháng {selectedMonth.slice(5,7)}): <span style={{ color: remainingScore < 80 ? colors.error : colors.success }}>{remainingScore.toFixed(2)}</span>
            </div>
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
              <div style={{ padding: 18, background: colors.primaryLight, borderRadius: 14, boxShadow: "0 1.5px 10px #e88e2e11" }}>
                  <div style={{ fontWeight: 700, color: colors.primary, marginBottom: 14, fontSize: 17 }}>Bộ phận</div>
                  <div>
                  {departments.map((d, i) => (
                      <button key={d.name} style={{ display: "block", width: "100%", marginBottom: 10, padding: "10px 15px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 15, background: depIndex === i ? colors.primary : "#fff3e0", color: depIndex === i ? colors.white : colors.primary, boxShadow: depIndex === i ? "0 1.5px 7px #e88e2e33" : "none", cursor: "pointer", transition: "all .13s", position: 'relative' }} onClick={() => handleSelectDepartment(i)}>
                      {d.name}
                      {newErrorCounts && newErrorCounts[d.name] > 0 && (
                        <span style={{ position: 'absolute', top: 5, right: 8, background: 'red', color: 'white', borderRadius: '50%', width: 20, height: 20, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {newErrorCounts[d.name]}
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
        const oldEventsQuery = query(collection(db, "gemba_events"), where("timestamp", "<=", sevenMonthsAgoTimestamp));
        const oldEventsSnap = await getDocs(oldEventsQuery);
        let batch = writeBatch(db); let count = 0;
        for (const doc of oldEventsSnap.docs) {
            batch.delete(doc.ref); count++;
            if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        if (count > 0) await batch.commit();
        for (const dept of departments) {
            const docRef = doc(db, "gemba_scores", dept.name);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data(); const scores = data.scores || [];
                const imagesToDelete = [];
                const recentScores = scores.filter(score => {
                    const scoreDate = safeTsToDate(score.timestamp);
                    if (scoreDate && scoreDate < sevenMonthsAgo) {
                        const allImages = [...(score.imageUrls || []), ...(score.imageUrl ? [score.imageUrl] : []), ...(score.improvementImageUrl ? [score.improvementImageUrl] : [])];
                        imagesToDelete.push(...allImages);
                        return false;
                    }
                    return true;
                });
                if (recentScores.length < scores.length) {
                    await setDoc(docRef, { scores: recentScores }, { merge: true });
                    for (const url of imagesToDelete) {
                        try {
                            const imageRef = ref(storage, url);
                            await deleteObject(imageRef);
                        } catch (error) {
                            if (error.code !== 'storage/not-found') { console.error("Lỗi xóa ảnh cũ từ Storage:", error); }
                        }
                    }
                }
            }
        }
    } catch (error) { console.error("Lỗi trong quá trình cleanup Gemba:", error); }
}

export default GembaCheckList;