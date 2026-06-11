import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  doc, onSnapshot, setDoc, updateDoc, getDoc,
  serverTimestamp, arrayUnion, writeBatch,
  collection, addDoc
} from 'firebase/firestore';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { colors } from '../theme';
import { useToast, useConfirm } from './LightboxSwipeOnly';
import { useI18n } from '../i18n/I18nProvider';

// Tránh re-render vô tận trong React dependency arrays
const noopPushToast = () => {};

/* =========================
 * HẰNG SỐ & HỖ TRỢ CHUNG
 * ========================= */
import { 
  SHIFTS, 
  SHIFT_NAMES, 
  MEAL_TYPES, 
  ALL_MEAL_KEYS, 
  LABEL_BY_KEY, 
  DEPARTMENT_ROLES 
} from '../constants/roles';
import { formatDateToId } from '../utils/string';

const DEPARTMENTS = DEPARTMENT_ROLES;
const dateKey = formatDateToId;
const fmtVN = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
};
const tsSec = (ts) => (ts && typeof ts.seconds === 'number') ? ts.seconds : 0;
const fmtTime = (t) => {
  if (!t) return '';
  if (t.seconds) return new Date(t.seconds * 1000).toLocaleString('vi-VN');
  if (typeof t === 'number') return new Date(t).toLocaleString('vi-VN');
  return '';
};

/* --- Custom Hook: useLongPress (for mobile long-press) --- */
const useLongPress = (callback, onClick, ms = 80) => {
  const timeoutRef = useRef();
  const intervalRef = useRef();
  const longPressedRef = useRef(false);

  // Dùng ref để lưu callback, tránh lỗi "stale closure"
  const callbackRef = useRef(callback);
  const onClickRef = useRef(onClick);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const start = (e) => {
    // KHÔNG chặn sự kiện touch để tránh mất focus input trên Android
    const isTouch = e?.type?.startsWith?.('touch');
    if (!isTouch && e?.cancelable) e.preventDefault();

    longPressedRef.current = false; // reset trạng thái

    // Sau 400ms nhấn giữ, kích hoạt long press
    timeoutRef.current = setTimeout(() => {
      longPressedRef.current = true;
      callbackRef.current();        // chạy callback lần đầu
      intervalRef.current = setInterval(() => {
        callbackRef.current();      // tiếp tục gọi callback liên tục
      }, ms);
    }, 400);
  };

  const stop = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  // Xử lý sự kiện click release
  const clickHandler = (e) => {
    // Nếu đã xử lý như long press thì chặn click thường
    if (longPressedRef.current) {
      e.preventDefault();
      return;
    }
    // Nếu chỉ click bình thường (nhả trước 400ms) thì gọi onClick
    onClickRef.current();
  };

  useEffect(() => () => stop(), []); // cleanup khi component unmount

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
    onClick: clickHandler, // trả về cả handler onClick đã xử lý long press
  };
};

/* --- NumberInput: Ô nhập số với nút +/- cho mobile (memo để giảm re-render) --- */
const NumberInput = React.memo(function NumberInput({ value, onChange, itemShift, itemKey, min = 0, style, placeholder = "Nhập", disabled = false }) {
  const shown = (value === 0 || value === null || value === undefined) ? '' : value;
  const safeVal = Number(value || 0);

  const handleInputChange = (e) => {
    if (disabled) return;
    const v = e.target.value;
    if (v === '') return onChange(itemShift, itemKey, 0);
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n >= min) onChange(itemShift, itemKey, n);
  };

  // Dùng useCallback để luôn lấy giá trị safeVal mới nhất khi gọi từ useLongPress
  const increment = useCallback(() => {
    if (disabled) return;
    onChange(itemShift, itemKey, safeVal + 1);
  }, [safeVal, onChange, itemShift, itemKey, disabled]);

  const decrement = useCallback(() => {
    if (disabled) return;
    const newVal = safeVal - 1;
    if (newVal >= min) {
      onChange(itemShift, itemKey, newVal);
    } else if (safeVal > min) {
      onChange(itemShift, itemKey, min);
    }
  }, [safeVal, onChange, min, itemShift, itemKey, disabled]);

  // Truyền các handler cho hook long-press (giữ nút tăng/giảm để tự động nhấn)
  const longPressIncrement = useLongPress(increment, increment, 100);
  const longPressDecrement = useLongPress(decrement, decrement, 100);

  const btnStyle = {
    width: 38,
    height: 38,
    fontSize: 22,
    fontWeight: 'bold',
    border: '1px solid #ccc',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'none',
    userSelect: 'none',
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation', // tránh gesture làm mất focus trên Android
  };

  const wrapperStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  };

  return (
    <div className="number-input-wrapper" style={wrapperStyle}>
      <button
        type="button"
        className="number-control-btn"
        style={{ ...btnStyle, color: '#d9534f' }}
        // Chặn bubble sự kiện touch để không ảnh hưởng đến input
        onTouchStart={(e) => { e.stopPropagation(); !disabled && longPressDecrement.onTouchStart?.(e); }}
        onTouchEnd={(e)   => { e.stopPropagation(); !disabled && longPressDecrement.onTouchEnd?.(e); }}
        onMouseDown={!disabled ? longPressDecrement.onMouseDown : undefined}
        onMouseUp={!disabled ? longPressDecrement.onMouseUp : undefined}
        onMouseLeave={!disabled ? longPressDecrement.onMouseLeave : undefined}
        onClick={!disabled ? longPressDecrement.onClick : undefined}
        disabled={disabled || safeVal <= min}
      >
        -
      </button>

      <input
        type="text"
        inputMode="numeric"
        min={min}
        value={shown}
        placeholder={placeholder}
        onChange={handleInputChange}
        disabled={disabled}
        style={{ width: 80, padding: 6, textAlign: 'center', borderRadius: 8, border: '1px solid #ddd', touchAction: 'manipulation', backgroundColor: disabled ? '#f1f5f9' : '#fff', color: disabled ? '#64748b' : '#000', ...style }}
      />

      <button
        type="button"
        className="number-control-btn"
        style={{ ...btnStyle, color: '#5cb85c' }}
        onTouchStart={(e) => { e.stopPropagation(); !disabled && longPressIncrement.onTouchStart?.(e); }}
        onTouchEnd={(e)   => { e.stopPropagation(); !disabled && longPressIncrement.onTouchEnd?.(e); }}
        onMouseDown={!disabled ? longPressIncrement.onMouseDown : undefined}
        onMouseUp={!disabled ? longPressIncrement.onMouseUp : undefined}
        onMouseLeave={!disabled ? longPressIncrement.onMouseLeave : undefined}
        onClick={!disabled ? longPressIncrement.onClick : undefined}
        disabled={disabled}
      >
        +
      </button>
    </div>
  );
});

/* --- DepartmentView: Giao diện bộ phận --- */
function DepartmentView({ user, reportData, selectedDateKey, selectedDate }) {
  const { pushToast } = useToast();
  const { askConfirm } = useConfirm();
  const rolesList = user?.role ? (Array.isArray(user.role) ? user.role : [String(user.role)]).flatMap(r => String(r).split(',')).map(r => r.trim()).filter(Boolean) : [];
  const userRole = rolesList.find(r => DEPARTMENTS.includes(r)) || rolesList[0] || '';
  const [formData, setFormData] = useState({});

  // NEW: khóa đồng bộ khi đang gõ + snapshot gần nhất để so sánh sâu
  const isEditingRef = useRef(false);
  const lastSnapshotRef = useRef(null);

  // Kiểm tra trạng thái khóa chỉnh sửa số liệu sau 1 ngày (ngoại trừ admin/ehs)
  const isLocked = useMemo(() => {
    if (!selectedDate) return false;
    const userRoles = user?.role ? (Array.isArray(user?.role) ? user.role.map(r => String(r).toLowerCase()) : [String(user.role).toLowerCase()]) : [];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('ehs');
    if (isAdmin) return false;

    const todayMidnight = new Date();
    todayMidnight.setHours(0,0,0,0);
    const selectedMidnight = new Date(selectedDate);
    selectedMidnight.setHours(0,0,0,0);
    const diffTime = todayMidnight.getTime() - selectedMidnight.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays > 1;
  }, [selectedDate, user]);

  const buildFormFromReport = useCallback(() => {
    const init = {};
    SHIFTS.forEach(shift => {
      const rep = reportData?.[shift]?.reports?.[userRole] || {};
      init[shift] = {};
      ALL_MEAL_KEYS.forEach(k => {
        init[shift][k] = Number(rep[k] || 0);
      });
    });
    return init;
  }, [reportData, userRole]);

  const isSameForm = (a, b) => {
    if (!a || !b) return false;
    for (const shift of SHIFTS) {
      const aa = a[shift] || {};
      const bb = b[shift] || {};
      for (const k of ALL_MEAL_KEYS) {
        if (Number(aa[k] || 0) !== Number(bb[k] || 0)) return false;
      }
    }
    return true;
  };

  // Đồng bộ formData từ reportData: chỉ khi không đang gõ và thực sự khác
  useEffect(() => {
    if (!reportData) return;
    if (isEditingRef.current) return; // quan trọng: đừng reset mid-typing (Android sẽ tắt bàn phím)
    const next = buildFormFromReport();
    if (!lastSnapshotRef.current || !isSameForm(lastSnapshotRef.current, next)) {
      lastSnapshotRef.current = next;
      setFormData(next);
    }
  }, [reportData, buildFormFromReport]);

  // Khởi tạo lần đầu nếu trống
  useEffect(() => {
    if (!formData[SHIFTS[0]] && reportData) {
      const next = buildFormFromReport();
      lastSnapshotRef.current = next;
      setFormData(next);
    }
  }, [formData, reportData, buildFormFromReport]);

  // ==============================================================
  // SỬA LỖI REACT #310: Phải khai báo Hook TRƯỚC các lệnh return sớm
  // ==============================================================
  const makeOnChange = useCallback((shift, key, n) => {
    if (Number.isNaN(n) || n < 0) return;
    setFormData(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: n } }));
  }, []);

  const confirmDeptReceivedOvertime = async (shift, ful) => {
    if (!(await askConfirm(
      `Xác nhận bộ phận ${userRole} đã nhận đúng và đủ ${ful.mi} mì và ${ful.sua} sữa từ Nhà Ăn cho ${SHIFT_NAMES[shift]}?`,
      "Bộ phận xác nhận đã nhận"
    ))) return;

    const docRef = doc(db, 'meal_reports', selectedDateKey);
    try {
      await updateDoc(docRef, {
        [`${shift}.overtimeFulfilled.${userRole}.deptAck`]: user.name,
        [`${shift}.overtimeFulfilled.${userRole}.deptAckAt`]: serverTimestamp(),
        history: arrayUnion({
          user: user.name,
          role: userRole,
          action: 'Bộ phận xác nhận nhận Tăng Ca',
          shift,
          details: `Xác nhận đã nhận đúng & đủ từ Nhà Ăn: ${ful.mi} mì, ${ful.sua} sữa.`,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      });
      pushToast('Đã xác nhận nhận đủ số lượng mì/sữa.', 'success');
      
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `Bộ phận ${userRole} đã xác nhận nhận ĐỦ ${ful.mi} mì và ${ful.sua} sữa tăng ca cho ${SHIFT_NAMES[shift]}.`,
        targetRoles: ["admin", "ehs", "Nhà Ăn"],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  if (!formData[SHIFTS[0]]) {
    return <div>Đang tải form...</div>;
  }
  // ==============================================================

  const saveShift = async (shift) => {
    if (isLocked) {
      pushToast('Số liệu ngày này đã bị khóa sau 1 ngày. Chỉ Admin mới có quyền chỉnh sửa.', 'error');
      return;
    }
    const docRef = doc(db, 'meal_reports', selectedDateKey);

    const prev = reportData?.[shift]?.reports?.[userRole] || {};
    const fulfilled = reportData?.[shift]?.overtimeFulfilled?.[userRole];
    const isFulfilled = (fulfilled?.mi || 0) > 0 || (fulfilled?.sua || 0) > 0;

    // Tính chênh lệch so với lần gửi trước để ghi history
    const diffs = [];
    ALL_MEAL_KEYS.forEach(k => {
      const before = Number(prev[k] || 0);
      const after  = Number(formData[shift][k] || 0);
      const delta = after - before;
      if (delta !== 0) {
        const sign = delta > 0 ? `+${delta}` : `${delta}`;
        diffs.push(`${LABEL_BY_KEY[k]}: ${sign}`);
      }
    });

    const newTangCaMi = Number(formData[shift].tangCaMi || 0);
    const newTangCaSua = Number(formData[shift].tangCaSua || 0);
    const prevTangCaMi = Number(prev.tangCaMi || 0);
    const prevTangCaSua = Number(prev.tangCaSua || 0);
    const otChanged = newTangCaMi !== prevTangCaMi || newTangCaSua !== prevTangCaSua;

    let action = 'Bộ phận cập nhật báo cơm';
    let details = diffs.length ? diffs.join(', ') : 'Không thay đổi số lượng.';

    // Chuẩn bị payload báo cáo của bộ phận
    const reportPayload = {
      ...formData[shift],
      lastUpdated: serverTimestamp(),
      user: user.name
    };

    if (isFulfilled && otChanged) {
      const isDecreasing = newTangCaMi < prevTangCaMi || newTangCaSua < prevTangCaSua;
      const isIncreasing = newTangCaMi > prevTangCaMi || newTangCaSua > prevTangCaSua;

      if (isDecreasing) {
        // GIẢM sau khi đã phát -> Cập nhật trực tiếp số lượng và kích hoạt quy trình thu hồi (recallPending)
        // Không cần qua bước phê duyệt của EHS
        reportPayload.changePending = false;
        action = 'Bộ phận cập nhật GIẢM Tăng Ca (đã phát)';
        details = `Tự động giảm suất Tăng Ca: Mì [${prevTangCaMi} -> ${newTangCaMi}], Sữa [${prevTangCaSua} -> ${newTangCaSua}].`;

        const surplusMi = Math.max(0, fulfilled.mi - newTangCaMi);
        const surplusSua = Math.max(0, fulfilled.sua - newTangCaSua);

        try {
          await updateDoc(docRef, {
            [`${shift}.reports.${userRole}`]: reportPayload,
            [`${shift}.overtimeFulfilled.${userRole}.recallPending`]: true,
            [`${shift}.overtimeFulfilled.${userRole}.recallEhsAck`]: null,
            [`${shift}.overtimeFulfilled.${userRole}.recallReturnedToCanteen`]: null,
            [`${shift}.overtimeFulfilled.${userRole}.recallCanteenAck`]: null,
            history: arrayUnion({
              user: user.name, role: userRole, action, shift, 
              details: details + ` Yêu cầu thu hồi thừa: ${surplusMi} mì, ${surplusSua} sữa.`,
              timestampMs: Date.now()
            }),
            lastHistoryAt: serverTimestamp()
          });
          pushToast(`Đã giảm tăng ca thành công. Vui lòng bàn giao lại ${surplusMi} mì và ${surplusSua} sữa thừa cho EHS.`, 'success');
          await addDoc(collection(db, "notifications"), {
            type: "meal_registration",
            message: `Bộ phận ${userRole} đã báo GIẢM Tăng Ca ca ${SHIFT_NAMES[shift]}. Sẽ trả lại ${surplusMi} mì, ${surplusSua} sữa thừa cho EHS.`,
            targetRoles: ["admin", "ehs"],
            readBy: [],
            createdBy: user.uid || "",
            timestamp: serverTimestamp()
          });
        } catch (e) {
          console.error(e);
          pushToast('Cập nhật thất bại.', 'error');
        }
      } else if (isIncreasing) {
        // TĂNG sau khi đã phát -> Cập nhật trực tiếp số lượng báo tăng và gửi thẳng đến Nhà Ăn (bỏ phê duyệt EHS)
        reportPayload.changePending = false;
        action = 'Bộ phận tăng thêm Tăng Ca (đã phát)';
        details = `Tự động tăng suất Tăng Ca: Mì [${prevTangCaMi} -> ${newTangCaMi}], Sữa [${prevTangCaSua} -> ${newTangCaSua}].`;

        const diffMi = newTangCaMi - prevTangCaMi;
        const diffSua = newTangCaSua - prevTangCaSua;

        try {
          await updateDoc(docRef, {
            [`${shift}.reports.${userRole}`]: reportPayload,
            [`${shift}.overtimeFulfilled.${userRole}.recallPending`]: false,
            history: arrayUnion({
              user: user.name, role: userRole, action, shift, 
              details: details + ` Số lượng cần phát bù: ${diffMi > 0 ? `${diffMi} mì` : ''}${diffMi > 0 && diffSua > 0 ? ', ' : ''}${diffSua > 0 ? `${diffSua} sữa` : ''}.`,
              timestampMs: Date.now()
            }),
            lastHistoryAt: serverTimestamp()
          });
          pushToast(`Đã cập nhật tăng thêm thành công. Vui lòng liên hệ Nhà Ăn để nhận phát bù ${diffMi > 0 ? `${diffMi} mì` : ''}${diffMi > 0 && diffSua > 0 ? ' và ' : ''}${diffSua > 0 ? `${diffSua} sữa` : ''}.`, 'success');
          await addDoc(collection(db, "notifications"), {
            type: "meal_registration",
            message: `Bộ phận ${userRole} đã báo TĂNG Tăng Ca ca ${SHIFT_NAMES[shift]}. Số lượng cần phát bù: ${diffMi > 0 ? `${diffMi} mì` : ''}${diffMi > 0 && diffSua > 0 ? ', ' : ''}${diffSua > 0 ? `${diffSua} sữa` : ''}.`,
            targetRoles: ["admin", "ehs", "Nhà Ăn"],
            readBy: [],
            createdBy: user.uid || "",
            timestamp: serverTimestamp()
          });
        } catch (e) {
          console.error(e);
          pushToast('Cập nhật thất bại.', 'error');
        }
      }

    } else {
      // --- Trường hợp cập nhật bình thường (chưa phát hoặc không đổi TC) ---
      if (reportPayload.changePending) {
        reportPayload.changePending = false; // nếu trước đó có cờ pending thì bỏ
      }

      const payload = {
        [shift]: {
          reports: { [userRole]: reportPayload },
          lastReportAt: serverTimestamp()
        },
        history: arrayUnion({
          user: user.name, role: userRole, action, shift, details,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      };

      try {
        await setDoc(docRef, payload, { merge: true });
        pushToast(`Đã lưu báo cơm cho ${SHIFT_NAMES[shift]}.`, 'success');
        await addDoc(collection(db, "notifications"), {
          type: "meal_registration",
          message: `${user.name} đã báo cơm cho ${SHIFT_NAMES[shift]} thuộc bộ phận ${userRole}.`,
          targetRoles: ["admin", "ehs"],
          readBy: [],
          createdBy: user.uid || "",
          timestamp: serverTimestamp()
        });
      } catch (e) {
        console.error(e);
        pushToast('Lưu không thành công.', 'error');
      }
    }
  };

  return (
    // Capture focus/blur để xác định đang gõ -> khóa đồng bộ formData
    <div
      onFocusCapture={() => { isEditingRef.current = true; }}
      onBlurCapture={() => { setTimeout(() => { isEditingRef.current = false; }, 120); }}
    >
      {SHIFTS.map(shift => (
        <div key={shift} className="card" style={{ marginBottom: 16, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Ca: {SHIFT_NAMES[shift]}</h3>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div>
              <h4>Cơm công nhân</h4>
              {Object.entries(MEAL_TYPES.congNhan).map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{label}: </label>
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange} itemShift={shift} itemKey={k} disabled={isLocked} />
                </div>
              ))}
            </div>
            <div>
              <h4>Cơm giám sát</h4>
              {Object.entries(MEAL_TYPES.giamSat).map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{label}: </label>
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange} itemShift={shift} itemKey={k} disabled={isLocked} />
                </div>
              ))}
            </div>
            <div>
              <h4>Tăng ca</h4>
              {Object.entries(MEAL_TYPES.tangCa).map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{label}: </label>
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange} itemShift={shift} itemKey={k} disabled={isLocked} />
                </div>
              ))}
            </div>
          </div>

          {(() => {
            const fulfilled = reportData?.[shift]?.overtimeFulfilled?.[userRole];
            const isFulfilled = (fulfilled?.mi || 0) > 0 || (fulfilled?.sua || 0) > 0;
            if (!isFulfilled) return null;
            return (
              <div style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 8,
                border: '1px solid #ddd',
                backgroundColor: fulfilled.deptAck ? '#e6f4ea' : '#fffbeb',
                borderColor: fulfilled.deptAck ? '#34a853' : '#fbbc05',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                    🎁 Số lượng Nhà Ăn thực tế đã phát:
                    <span style={{ color: colors.primary, fontWeight: 700 }}>
                      {fulfilled.mi} Mì, {fulfilled.sua} Sữa
                    </span>
                  </strong>
                  {fulfilled.deptAck ? (
                    <div style={{ color: '#137333', fontSize: 12, marginTop: 4 }}>
                      ✅ Đã xác nhận nhận đủ bởi <strong>{fulfilled.deptAck}</strong> vào lúc {fmtTime(fulfilled.deptAckAt)}.
                    </div>
                  ) : (
                    <div style={{ color: '#b06000', fontSize: 12, marginTop: 4 }}>
                      ⏳ Bộ phận cần xác nhận sau khi đã nhận trực tiếp số lượng này từ Nhà Ăn.
                    </div>
                  )}
                </div>
                
                {!fulfilled.deptAck && (
                  <button
                    onClick={() => confirmDeptReceivedOvertime(shift, fulfilled)}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#fbbc05',
                      color: '#000',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 13,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    ✅ Xác nhận đã nhận đủ
                  </button>
                )}
              </div>
            );
          })()}

          {isLocked && (
            <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Số liệu ngày này đã bị khóa (chỉ Admin mới có quyền chỉnh sửa).
            </div>
          )}
          <button
            onClick={() => saveShift(shift)}
            disabled={isLocked}
            style={{
              marginTop: 10,
              background: isLocked ? '#cbd5e1' : colors.primary,
              color: '#fff',
              border: 0,
              padding: '10px 16px',
              borderRadius: 10,
              fontWeight: 700,
              cursor: isLocked ? 'not-allowed' : 'pointer'
            }}
          >
            Lưu ca {shift}
          </button>
        </div>
      ))}
    </div>
  );
}

/* --- DeptDetailModal: Modal chi tiết bộ phận --- */
function DeptDetailModal({ department, reportData, onClose }) {
  if (!department) return null;
  const history = (reportData?.history || []).filter(h => h?.role === department);
  const cellStyle = { padding: 8, border: '1px solid #eee', textAlign: 'center' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{ background: '#fff', maxWidth: 'min(980px, 95vw)', width: '95%', borderRadius: 12, padding: 12, boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
        <style>{`
          @media (max-width: 480px) {
            .rc-table th, .rc-table td { padding: 6px !important; font-size: 12px !important; }
            .rc-wrap { max-height: 50vh; }
          }
          .rc-wrap { overflow-x: auto; }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Chi tiết báo cơm – {department}</h3>
          <button onClick={onClose} style={{ border: 0, background: '#eee', padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}>Đóng</button>
        </div>

        <h4 style={{ margin: '6px 0' }}>Số lượng theo từng ca</h4>
        <div className="rc-wrap">
          <table className="rc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Ca</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Cơm mặn (CN)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Cơm chay (CN)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Cơm mặn (GS)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Cơm chay (GS)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Sữa (cơm) (GS)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Mì (TC)</th>
                <th style={{ ...cellStyle, whiteSpace: 'nowrap' }}>Sữa (TC)</th>
                <th style={cellStyle}>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map(shift => {
                const rep = reportData?.[shift]?.reports?.[department] || {};
                const fulfilled = reportData?.[shift]?.overtimeFulfilled?.[department] || {};
                const isFulfilled = (fulfilled.mi || 0) > 0 || (fulfilled.sua || 0) > 0;
                return (
                  <tr key={shift}>
                    <td style={cellStyle}>{SHIFT_NAMES[shift]}</td>
                    <td style={cellStyle}>{rep.congNhanMan || 0}</td>
                    <td style={cellStyle}>{rep.congNhanChay || 0}</td>
                    <td style={cellStyle}>{rep.giamSatMan || 0}</td>
                    <td style={cellStyle}>{rep.giamSatChay || 0}</td>
                    <td style={cellStyle}>{rep.giamSatSua || 0}</td>
                    <td style={cellStyle}>
                      {rep.tangCaMi || 0}
                      {isFulfilled && (
                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                          Thực phát: {fulfilled.mi}
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {rep.tangCaSua || 0}
                      {isFulfilled && (
                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                          Thực phát: {fulfilled.sua}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontSize: 12 }}>
                      {fmtTime(rep.lastUpdated) || '-'}
                      {isFulfilled && (
                        <div style={{ fontSize: 11, color: fulfilled.deptAck ? '#137333' : '#b06000', fontWeight: 'bold', marginTop: 2 }}>
                          {fulfilled.deptAck ? `✓ Đã nhận (${fulfilled.deptAck})` : '⏳ Chưa nhận'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h4 style={{ margin: '12px 0 6px' }}>Lịch sử thay đổi của bộ phận</h4>
        {history.length === 0 ? (
          <div style={{ padding: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            Chưa ghi nhận lịch sử cho bộ phận này.
          </div>
        ) : (
          <div className="rc-wrap" style={{ maxHeight: 280, border: '1px solid #eee', borderRadius: 8 }}>
            <table className="rc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Thời điểm</th>
                  <th style={cellStyle}>Ca</th>
                  <th style={cellStyle}>Hành động</th>
                  <th style={{ ...cellStyle, minWidth: 200 }}>Chi tiết</th>
                  <th style={cellStyle}>Người thực hiện</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .sort((a, b) => (b?.timestampMs || 0) - (a?.timestampMs || 0))
                  .map((h, idx) => (
                    <tr key={idx}>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{fmtTime(h.timestampMs)}</td>
                      <td style={cellStyle}>{SHIFT_NAMES[h.shift] || h.shift || '-'}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{h.action || '-'}</td>
                      <td style={{ ...cellStyle, textAlign: 'left' }}>{h.details || '-'}</td>
                      <td style={cellStyle}>{h.user || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- AdminView: Giao diện Admin --- */
function AdminView({ user, reportData, selectedDateKey, onDeptClick, onOpenExport, isMobile }) {
  const { pushToast } = useToast();
  const { askConfirm } = useConfirm();
  const [adjustedTotals, setAdjustedTotals] = useState({});

  // Danh sách các yêu cầu thay đổi tăng ca từ bộ phận (chờ EHS duyệt)
  const pendingChangeRequests = useMemo(() => {
    const list = [];
    if (!reportData) return list;
    SHIFTS.forEach(shift => {
      const reports = reportData[shift]?.reports || {};
      const fulfilled = reportData[shift]?.overtimeFulfilled || {};
      for (const dept in reports) {
        const rep = reports[dept];
        if (rep?.changePending) {
          const ful = fulfilled[dept] || {};
          // Kiểm tra xem là tăng hay giảm
          const newMi = Number(rep.tangCaMi || 0);
          const newSua = Number(rep.tangCaSua || 0);
          const fulMi = Number(ful.mi || 0);
          const fulSua = Number(ful.sua || 0);
          
          let type = 'increase';
          if (newMi < fulMi || newSua < fulSua) {
            type = 'decrease';
          }

          list.push({
            shift,
            dept,
            type,
            newMi,
            newSua,
            fulMi,
            fulSua,
            user: rep.user || 'Bộ phận',
          });
        }
      }
    });
    return list;
  }, [reportData]);

  // Phê duyệt yêu cầu thay đổi tăng ca từ bộ phận
  const approveChangeRequest = async (req) => {
    const actionText = req.type === 'decrease' ? 'duyệt giảm' : 'duyệt tăng';
    if (!(await askConfirm(
      `Xác nhận phê duyệt yêu cầu thay đổi số lượng tăng ca cho bộ phận ${req.dept} (${SHIFT_NAMES[req.shift]})?\n` +
      `Số lượng mới: Mì: ${req.newMi}, Sữa: ${req.newSua}.`,
      "Phê duyệt yêu cầu thay đổi"
    ))) return;

    const docRef = doc(db, 'meal_reports', selectedDateKey);
    const batch = writeBatch(db);

    // 1. Xóa cờ pending trên báo cáo bộ phận
    batch.update(docRef, {
      [`${req.shift}.reports.${req.dept}.changePending`]: false,
    });

    let details = `Duyệt thay đổi Tăng Ca: Mì [${req.fulMi} -> ${req.newMi}], Sữa [${req.fulSua} -> ${req.newSua}].`;

    if (req.type === 'decrease') {
      const surplusMi = Math.max(0, req.fulMi - req.newMi);
      const surplusSua = Math.max(0, req.fulSua - req.newSua);
      
      // 2. Nếu là giảm, bật cờ recallPending để EHS vào xác nhận thu hồi
      batch.update(docRef, {
        [`${req.shift}.overtimeFulfilled.${req.dept}.recallPending`]: true,
      });

      details += ` Đã kích hoạt yêu cầu thu hồi thừa: ${surplusMi} mì, ${surplusSua} sữa.`;
    }

    // 3. Ghi lịch sử hoạt động
    batch.update(docRef, {
      history: arrayUnion({
        user: user.name,
        role: Array.isArray(user.role) ? user.role.join(", ") : user.role,
        action: `EHS ${actionText} Tăng Ca`,
        shift: req.shift,
        details,
        timestampMs: Date.now()
      }),
      lastHistoryAt: serverTimestamp()
    });

    try {
      await batch.commit();
      pushToast('Đã phê duyệt yêu cầu thay đổi số lượng tăng ca.', 'success');
      
      // Gửi thông báo
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `EHS đã PHÊ DUYỆT yêu cầu thay đổi Tăng Ca ${SHIFT_NAMES[req.shift]} (${req.dept}): Mì [${req.fulMi}→${req.newMi}], Sữa [${req.fulSua}→${req.newSua}].`,
        targetRoles: ["admin", "ehs", "Nhà Ăn", req.dept],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Phê duyệt thất bại.', 'error');
    }
  };

  // Từ chối yêu cầu thay đổi tăng ca (giữ nguyên số đã phát trước đó)
  const rejectChangeRequest = async (req) => {
    if (!(await askConfirm(
      `Xác nhận từ chối yêu cầu thay đổi tăng ca cho bộ phận ${req.dept} (${SHIFT_NAMES[req.shift]})?\n` +
      `Số lượng sẽ quay về số đã phát trước đó (Mì: ${req.fulMi}, Sữa: ${req.fulSua}).`,
      "Từ chối yêu cầu thay đổi"
    ))) return;

    const docRef = doc(db, 'meal_reports', selectedDateKey);
    const batch = writeBatch(db);

    // Trả số lượng yêu cầu về bằng số thực phát và xóa cờ pending
    batch.update(docRef, {
      [`${req.shift}.reports.${req.dept}.tangCaMi`]: req.fulMi,
      [`${req.shift}.reports.${req.dept}.tangCaSua`]: req.fulSua,
      [`${req.shift}.reports.${req.dept}.changePending`]: false,
    });

    // Ghi lịch sử hoạt động
    batch.update(docRef, {
      history: arrayUnion({
        user: user.name,
        role: Array.isArray(user.role) ? user.role.join(", ") : user.role,
        action: 'EHS từ chối Y/C thay đổi Tăng Ca',
        shift: req.shift,
        details: `${req.dept}: Từ chối đổi số lượng. Giữ nguyên số đã phát: Mì [${req.fulMi}], Sữa [${req.fulSua}].`,
        timestampMs: Date.now()
      }),
      lastHistoryAt: serverTimestamp()
    });

    try {
      await batch.commit();
      pushToast('Đã từ chối yêu cầu thay đổi số lượng tăng ca.', 'info');

      // Gửi thông báo
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `EHS đã TỪ CHỐI yêu cầu thay đổi Tăng Ca ${SHIFT_NAMES[req.shift]} (${req.dept}). Giữ nguyên số đã phát: Mì [${req.fulMi}], Sữa [${req.fulSua}].`,
        targetRoles: ["admin", "ehs", req.dept],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Từ chối thất bại.', 'error');
    }
  };

  // Tính tổng hợp suất ăn từ dữ liệu các bộ phận (trừ phần tăng ca đang chờ duyệt)
  const summary = useMemo(() => {
    const totals = {};
    SHIFTS.forEach(shift => {
      totals[shift] = {};
      ALL_MEAL_KEYS.forEach(k => { totals[shift][k] = 0; });
      const reports = reportData?.[shift]?.reports || {};

      for (const deptKey in reports) {
        const rep = reports[deptKey];
        if (!rep.changePending) {
          ALL_MEAL_KEYS.forEach(k => {
            totals[shift][k] += Number(rep?.[k] || 0);
          });
        } else {
          // Nếu bộ phận đang chờ duyệt tăng ca, cộng các phần *không phải* Tăng ca
          ALL_MEAL_KEYS.forEach(k => {
            if (k !== 'tangCaMi' && k !== 'tangCaSua') {
              totals[shift][k] += Number(rep?.[k] || 0);
            }
          });
          // Phần Tăng ca đã phát thì cộng từ overtimeFulfilled (số thực phát)
          const fulfilled = reportData?.[shift]?.overtimeFulfilled?.[deptKey] || {};
          totals[shift].tangCaMi += Number(fulfilled.mi || 0);
          totals[shift].tangCaSua += Number(fulfilled.sua || 0);
        }
      }
    });
    return totals;
  }, [reportData]);

  // Tổng hợp các yêu cầu thu hồi tăng ca (nếu lượng phát > lượng yêu cầu)
  const recallRequests = useMemo(() => {
    const recalls = [];
    if (!reportData) return recalls;
    SHIFTS.forEach(shift => {
      const reports = reportData[shift]?.reports || {};
      const fulfilled = reportData[shift]?.overtimeFulfilled || {};
      for (const dept in fulfilled) {
        if (fulfilled[dept]?.recallPending) {
          const reqMi = Number(reports[dept]?.tangCaMi || 0);
          const reqSua = Number(reports[dept]?.tangCaSua || 0);
          const fulMi = Number(fulfilled[dept]?.mi || 0);
          const fulSua = Number(fulfilled[dept]?.sua || 0);
          const surplusMi = Math.max(0, fulMi - reqMi);
          const surplusSua = Math.max(0, fulSua - reqSua);
          if (surplusMi > 0 || surplusSua > 0) {
            recalls.push({
              shift, dept, surplusMi, surplusSua, reqMi, reqSua,
              recallEhsAck: fulfilled[dept]?.recallEhsAck || null,
              recallReturnedToCanteen: fulfilled[dept]?.recallReturnedToCanteen || null,
              recallCanteenAck: fulfilled[dept]?.recallCanteenAck || null,
            });
          }
        }
      }
    });
    return recalls;
  }, [reportData]);

  const confirmEhsReceivedRecall = async (recall) => {
    if (!(await askConfirm(
      `Xác nhận EHS đã nhận lại ${recall.surplusMi} mì và ${recall.surplusSua} sữa từ bộ phận ${recall.dept} (${SHIFT_NAMES[recall.shift]})?`,
      "EHS xác nhận nhận từ bộ phận"
    ))) return;
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    try {
      await updateDoc(docRef, {
        [`${recall.shift}.overtimeFulfilled.${recall.dept}.recallEhsAck`]: user.name,
        history: arrayUnion({
          user: user.name,
          role: Array.isArray(user.role) ? user.role.join(", ") : user.role,
          action: 'EHS nhận từ bộ phận',
          shift: recall.shift,
          details: `${recall.dept}: EHS đã nhận lại ${recall.surplusMi} mì, ${recall.surplusSua} sữa từ bộ phận.`,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      });
      pushToast('EHS đã xác nhận nhận lại từ bộ phận. Chờ trả Nhà Ăn.', 'success');
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  const confirmEhsReturnedToCanteen = async (recall) => {
    if (!(await askConfirm(
      `Xác nhận EHS đã trả lại ${recall.surplusMi} mì và ${recall.surplusSua} sữa cho Nhà Ăn (${SHIFT_NAMES[recall.shift]} - ${recall.dept})?`,
      "EHS xác nhận trả Nhà Ăn"
    ))) return;
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    try {
      await updateDoc(docRef, {
        [`${recall.shift}.overtimeFulfilled.${recall.dept}.recallReturnedToCanteen`]: user.name,
        history: arrayUnion({
          user: user.name,
          role: Array.isArray(user.role) ? user.role.join(", ") : user.role,
          action: 'EHS trả lại Nhà Ăn',
          shift: recall.shift,
          details: `${recall.dept}: EHS đã trả lại ${recall.surplusMi} mì, ${recall.surplusSua} sữa cho Nhà Ăn.`,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      });
      pushToast('Đã xác nhận trả Nhà Ăn. Chờ Nhà Ăn xác nhận nhận lại.', 'success');
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `EHS đã bàn giao trả lại ${recall.surplusMi} mì, ${recall.surplusSua} sữa (${recall.dept} - ${SHIFT_NAMES[recall.shift]}) cho Nhà Ăn. Vui lòng xác nhận.`,
        targetRoles: ["Nhà Ăn"],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  // Bản chụp nhanh số liệu đã gửi (summary) lần cuối cùng Admin gửi cho Nhà ăn
  const sentSnapshot = useMemo(() => {
    const map = {};
    SHIFTS.forEach(shift => {
      map[shift] = reportData?.[shift]?.summary || {};
    });
    return map;
  }, [reportData]);

  // Khi có dữ liệu hoặc tổng mới, reset adjustedTotals để Admin thấy số liệu mới nhất
  useEffect(() => {
    const init = {};
    SHIFTS.forEach(shift => {
      const adminSummary = reportData?.[shift]?.summary || {};
      const deptSummary = summary[shift] || {};
      init[shift] = {
        ...adminSummary,
        // Cố định mì và sữa theo tổng nhận được từ các bộ phận, EHS không tăng/giảm
        tangCaMi: Number(deptSummary.tangCaMi || 0),
        tangCaSua: Number(deptSummary.tangCaSua || 0)
      };
    });
    setAdjustedTotals(init);
  }, [summary, reportData]);

  const onAdjust = useCallback((shift, key, val) => {
    // Không cho phép điều chỉnh Tăng ca (Mì, Sữa)
    if (key === 'tangCaMi' || key === 'tangCaSua') return;
    
    // Cập nhật giá trị điều chỉnh khi Admin sửa ô input
    if (val === '') {
      setAdjustedTotals(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: 0 } }));
      return;
    }
    const v = parseInt(val, 10);
    if (!Number.isNaN(v) && v >= 0) {
      setAdjustedTotals(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: v } }));
    }
  }, []);

  const confirmShift = async (shift) => {
    if (!(await askConfirm(`Xác nhận & gửi ${SHIFT_NAMES[shift]} cho Nhà Ăn?`, "Xác nhận gửi số liệu"))) return;
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    const batch = writeBatch(db);

    // Chuẩn bị dữ liệu trước và sau khi điều chỉnh để ghi lịch sử thay đổi
    const before = summary[shift] || {};
    const after  = adjustedTotals[shift] || {};
    const changes = [];
    ALL_MEAL_KEYS.forEach(k => {
      if ((before[k] || 0) !== (after[k] || 0)) {
        const delta = (after[k] || 0) - (before[k] || 0);
        const sign = delta > 0 ? `+${delta}` : `${delta}`;
        changes.push(`${LABEL_BY_KEY[k]}: ${sign}`);
      }
    });

    // Cập nhật tổng hợp và ghi nhận người xác nhận (Admin)
    const payload = {
      summary: after,
      confirmedByAdmin: user.name,
      confirmedAtAdmin: serverTimestamp(),
      confirmedByCanteen: reportData?.[shift]?.confirmedByCanteen || null,
      confirmedAtCanteen: reportData?.[shift]?.confirmedAtCanteen || null,
    };
    batch.set(docRef, { [shift]: payload }, { merge: true });

    // Kiểm tra các bộ phận đã phát tăng ca vượt quá yêu cầu để đánh dấu chờ thu hồi
    const reports = reportData?.[shift]?.reports || {};
    const fulfilled = reportData?.[shift]?.overtimeFulfilled || {};
    for (const dept in fulfilled) {
      if (
        !fulfilled[dept].recallPending &&    // chưa chờ thu hồi
        !reports[dept]?.changePending        // bộ phận không có yêu cầu thay đổi
      ) {
        const reqMi = Number(reports[dept]?.tangCaMi || 0);
        const reqSua = Number(reports[dept]?.tangCaSua || 0);
        const fulMi = Number(fulfilled[dept]?.mi || 0);
        const fulSua = Number(fulfilled[dept]?.sua || 0);
        if (reqMi < fulMi || reqSua < fulSua) {
          // nếu số đã phát > số yêu cầu thì đánh dấu cần thu hồi
          batch.update(docRef, {
            [`${shift}.overtimeFulfilled.${dept}.recallPending`]: true,
            [`${shift}.overtimeFulfilled.${dept}.recallEhsAck`]: null,
            [`${shift}.overtimeFulfilled.${dept}.recallReturnedToCanteen`]: null,
            [`${shift}.overtimeFulfilled.${dept}.recallCanteenAck`]: null,
          });
        }
      }
    }

    // Ghi lịch sử xác nhận gửi Nhà ăn
    batch.update(docRef, {
      history: arrayUnion({
        user: user.name,
        role: Array.isArray(user.role) ? user.role.join(", ") : user.role,
        action: 'Xác nhận & gửi cho Nhà Ăn',
        shift,
        details: changes.length ? changes.join(', ') : 'Không điều chỉnh so với tổng.',
        timestampMs: Date.now()
      }),
      lastHistoryAt: serverTimestamp()
    });

    try {
      await batch.commit();
      const alreadySentBefore = !!reportData?.[shift]?.confirmedByAdmin;
      pushToast(`${alreadySentBefore ? 'Đã gửi lại' : 'Đã gửi'} ${SHIFT_NAMES[shift]} cho Nhà Ăn.`, 'success');
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `Aldila đã ${alreadySentBefore ? 'cập nhật và gửi lại' : 'gửi'} số liệu cơm ${SHIFT_NAMES[shift]} cho Nhà Ăn.`,
        targetRoles: ["Nhà Ăn"],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  // Các thành phần giao diện con trong AdminView
  const Chip = ({ dep, reported, isPending }) => (
    <button
      onClick={() => reported && onDeptClick(dep)}
      title={reported ? 'Nhấp để xem chi tiết' : 'Chưa báo'}
      style={{
        display: 'inline-block', marginRight: 6, marginBottom: 6, padding: '4px 8px',
        borderRadius: 999, fontSize: 12, border: '1px solid transparent',
        background: isPending ? '#fef9c3' : (reported ? '#e6f4ea' : '#ffe6e6'),
        color: isPending ? '#713f12' : (reported ? '#1e7e34' : '#b71c1c'),
        cursor: reported ? 'pointer' : 'not-allowed',
        borderStyle: isPending ? 'dashed' : 'solid',
        borderColor: isPending ? '#facc15' : 'transparent',
      }}
    >
      {dep}{isPending ? ' ⏳' : ''}
    </button>
  );

  const Delta = ({ diff }) => {
    if (!diff) return null;
    const up = diff > 0;
    const color = up ? '#16a34a' : '#dc2626';
    const arrow = up ? '▲' : '▼';
    return <span style={{ marginLeft: 6, color, fontWeight: 700 }}>{arrow} {Math.abs(diff)}</span>;
  };

  const isAdjusted = (shift) => {
    // Kiểm tra xem Admin đã điều chỉnh khác với tổng hợp ban đầu không
    const adj = adjustedTotals[shift] || {};
    const sum = summary[shift] || {};
    return ALL_MEAL_KEYS.some(k => (adj[k] ?? 0) !== (sum[k] ?? 0));
  };

  return (
    <div>
      {/* Nút xuất báo cáo Excel */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onOpenExport} style={{ background: '#1f80e0', color: '#fff', border: 0, padding: '8px 12px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          Xuất báo cáo (Excel)
        </button>
      </div>

      {/* Yêu cầu thay đổi tăng ca (Chờ EHS duyệt) */}
      {pendingChangeRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 12, border: '1px solid #fde68a', borderRadius: 12, background: '#fefce8' }}>
          <h3 style={{ marginTop: 0, color: '#a16207', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⏳ Yêu cầu thay đổi tăng ca (Chờ EHS duyệt)</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#fef9c3' }}>
                <tr>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Bộ phận</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Ca</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Loại yêu cầu</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Số lượng đã phát</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Yêu cầu mới</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Chênh lệch</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Người yêu cầu</th>
                  <th style={{ padding: 8, border: '1px solid #fef08a' }}>Thao tác EHS</th>
                </tr>
              </thead>
              <tbody>
                {pendingChangeRequests.map(req => {
                  const diffMi = req.newMi - req.fulMi;
                  const diffSua = req.newSua - req.fulSua;
                  const isDecrease = req.type === 'decrease';

                  return (
                    <tr key={`${req.shift}-${req.dept}`}>
                      <td style={{ padding: 8, border: '1px solid #fef08a', fontWeight: 'bold' }}>{req.dept}</td>
                      <td style={{ padding: 8, border: '1px solid #fef08a' }}>{SHIFT_NAMES[req.shift]}</td>
                      <td style={{ padding: 8, border: '1px solid #fef08a' }}>
                        {isDecrease ? (
                          <span style={{ color: '#b91c1c', fontWeight: 700 }}>⬇️ Yêu cầu GIẢM</span>
                        ) : (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>⬆️ Yêu cầu TĂNG</span>
                        )}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #fef08a', textAlign: 'center' }}>
                        {req.fulMi} Mì / {req.fulSua} Sữa
                      </td>
                      <td style={{ padding: 8, border: '1px solid #fef08a', textAlign: 'center', fontWeight: 'bold', color: '#1e3a8a' }}>
                        {req.newMi} Mì / {req.newSua} Sữa
                      </td>
                      <td style={{ padding: 8, border: '1px solid #fef08a', textAlign: 'center' }}>
                        {diffMi !== 0 && (
                          <span style={{ color: diffMi > 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold', marginRight: 8 }}>
                            Mì: {diffMi > 0 ? `+${diffMi}` : diffMi}
                          </span>
                        )}
                        {diffSua !== 0 && (
                          <span style={{ color: diffSua > 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                            Sữa: {diffSua > 0 ? `+${diffSua}` : diffSua}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #fef08a', fontSize: 12 }}>{req.user}</td>
                      <td style={{ padding: 8, border: '1px solid #fef08a', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => approveChangeRequest(req)}
                            style={{ background: '#16a34a', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                          >
                            ✅ Duyệt
                          </button>
                          <button
                            onClick={() => rejectChangeRequest(req)}
                            style={{ background: '#dc2626', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                          >
                            ❌ Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thông báo yêu cầu thu hồi tăng ca (nếu có) */}
      {recallRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 12, border: '1px solid #fecaca', borderRadius: 12, background: '#fff1f2' }}>
          <h3 style={{ marginTop: 0, color: '#b91c1c' }}>Yêu cầu thu hồi tăng ca</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#fee2e2' }}>
                <tr>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Bộ phận</th>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Ca</th>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Mì cần thu hồi</th>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Sữa cần thu hồi</th>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Trạng thái</th>
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Thao tác EHS</th>
                </tr>
              </thead>
              <tbody>
                {recallRequests.map(rec => {
                  const step = !rec.recallEhsAck ? 1 // Chờ EHS nhận từ bộ phận
                    : !rec.recallReturnedToCanteen ? 2 // EHS đã nhận, chờ EHS trả Nhà Ăn
                    : 3; // Chờ Nhà Ăn xác nhận

                  return (
                    <tr key={`${rec.shift}-${rec.dept}`}>
                      <td style={{ padding: 8, border: '1px solid #fecaca' }}>{rec.dept}</td>
                      <td style={{ padding: 8, border: '1px solid #fecaca' }}>{SHIFT_NAMES[rec.shift]}</td>
                      <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center', fontWeight: 'bold' }}>{rec.surplusMi}</td>
                      <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center', fontWeight: 'bold' }}>{rec.surplusSua}</td>
                      <td style={{ padding: 8, border: '1px solid #fecaca', fontSize: 12 }}>
                        {step === 1 && <span style={{ color: '#b45309' }}>⏳ Chờ EHS nhận từ bộ phận</span>}
                        {step === 2 && <span style={{ color: '#1d4ed8' }}>✅ EHS đã nhận – Chờ trả Nhà Ăn</span>}
                        {step === 3 && <span style={{ color: '#166534' }}>✅ EHS đã trả – Chờ Nhà Ăn xác nhận</span>}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center' }}>
                        {step === 1 && (
                          <button
                            onClick={() => confirmEhsReceivedRecall(rec)}
                            style={{ background: '#1d4ed8', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                          >
                            ✅ Xác nhận đã nhận từ bộ phận
                          </button>
                        )}
                        {step === 2 && (
                          <button
                            onClick={() => confirmEhsReturnedToCanteen(rec)}
                            style={{ background: '#7c3aed', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                          >
                            ↩️ Xác nhận đã trả Nhà Ăn
                          </button>
                        )}
                        {step === 3 && <span style={{ color: '#166534', fontSize: 12 }}>Đang chờ Nhà Ăn xác nhận</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tổng hợp theo ca và điều chỉnh (cho từng ca S1, S2, S3, S8, HC) */}
      {SHIFTS.map(shift => {
        const sd = reportData?.[shift] || {};
        const statusAdmin = !!sd.confirmedByAdmin;
        const statusCanteen = !!sd.confirmedByCanteen;
        const newAfterSend = tsSec(sd.lastReportAt) > tsSec(sd.confirmedAtAdmin);

        const hasData = ALL_MEAL_KEYS.some(k => Number(adjustedTotals[shift]?.[k] || 0) > 0);
        const canConfirm = hasData && (!statusAdmin || newAfterSend || isAdjusted(shift));

        const reports = sd.reports || {};
        // danh sách các bộ phận và trạng thái báo của từng bộ phận
        const depChips = DEPARTMENTS.map(dep => ({
          dep,
          reported: !!reports[dep],
          isPending: !!reports[dep]?.changePending
        }));

        return (
          <div key={shift} className="card" style={{ marginBottom: 16, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
            <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Tổng hợp ca: {SHIFT_NAMES[shift]}</span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: statusCanteen ? '#16a34a' : (statusAdmin ? (newAfterSend ? '#f59e0b' : '#f59e0b') : '#6b7280')
              }}>
                {statusCanteen
                  ? 'Nhà ăn đã xác nhận'
                  : (statusAdmin ? (newAfterSend ? 'Đã gửi (có thay đổi)' : 'Đã gửi cho Nhà Ăn') : 'Chưa gửi')}
              </span>
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '100%' : 400 }}>
              <thead style={{ background: colors.primaryLight || '#eef5ff' }}>
                <tr>
                  <th style={{ padding: 8, border: '1px solid #eee' }}>Loại cơm</th>
                  <th style={{ padding: 8, border: '1px solid #eee' }}>Tổng báo cáo</th>
                  <th style={{ padding: 8, border: '1px solid #eee' }}>Điều chỉnh</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MEAL_TYPES).map(([cat, types]) => (
                  <React.Fragment key={cat}>
                    {Object.entries(types).map(([k, label]) => {
                      const current = Number(summary[shift]?.[k] || 0);
                      const sent = Number(sentSnapshot[shift]?.[k] || 0);
                      const diff = (statusAdmin && newAfterSend) ? (current - sent) : 0;
                      return (
                        <tr key={k}>
                          <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{label}</td>
                          <td style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                            {current}
                            <Delta diff={diff} />
                          </td>
                          <td style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                            <NumberInput 
                              value={adjustedTotals[shift]?.[k] ?? 0} 
                              onChange={onAdjust} 
                              itemShift={shift} 
                              itemKey={k} 
                              disabled={k === 'tangCaMi' || k === 'tangCaSua'}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10 }}>
              <h4 style={{ margin: '8px 0' }}>Trạng thái bộ phận:</h4>
              <div>
                {depChips.map(({ dep, reported, isPending }) => (
                  <Chip key={dep} dep={dep} reported={reported} isPending={isPending} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={() => confirmShift(shift)}
                disabled={!canConfirm}
                style={{
                  background: canConfirm ? (colors.success || '#16a34a') : '#cbd5e1',
                  color: '#fff',
                  border: 0, padding: '10px 16px', borderRadius: 10, fontWeight: 700,
                  cursor: canConfirm ? 'pointer' : 'not-allowed'
                }}
              >
                {statusAdmin ? 'Gửi lại ' + SHIFT_NAMES[shift] : 'Xác nhận ' + SHIFT_NAMES[shift]}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --- CanteenView: Giao diện Nhà Ăn --- */
function CanteenView({ user, reportData, selectedDateKey, isMobile }) {
  const { pushToast } = useToast();
  const { askConfirm } = useConfirm();

  const Delta = ({ diff }) => {
    if (!diff) return null;
    const up = diff > 0;
    const color = up ? '#16a34a' : '#dc2626';
    const arrow = up ? '▲' : '▼';
    return <span style={{ marginLeft: 6, color, fontWeight: 700 }}>{arrow} {Math.abs(diff)}</span>;
  };

  // Tên hiển thị của tài khoản Nhà ăn (ưu tiên tên đầy đủ nếu có)
  const canteenName = useMemo(() => user?.name || user?.displayName || 'Nhà Ăn', [user]);

  // Bộ lọc lịch sử dành riêng cho Nhà Ăn (Không hiển thị thay đổi cơm thường của bộ phận, chỉ hiển thị EHS/Nhà ăn hoặc Mì/Sữa TC từ bộ phận)
  const filteredHistory = useMemo(() => {
    if (!reportData?.history) return [];
    return reportData.history
      .map(h => {
        const roleLower = String(h.role || "").toLowerCase();
        const actionLower = String(h.action || "").toLowerCase();
        
        // 1. Giữ nguyên nếu liên quan đến EHS, Admin hoặc Nhà Ăn
        const isEhsOrCanteen = 
          roleLower.includes("ehs") || 
          roleLower.includes("admin") || 
          roleLower.includes("nhà ăn") || 
          roleLower.includes("canteen") ||
          actionLower.includes("ehs") || 
          actionLower.includes("nhà ăn");

        if (isEhsOrCanteen) {
          return h;
        }

        // 2. Nếu từ Bộ Phận thường: chỉ lọc lấy thông tin Mì Tăng ca & Sữa Tăng ca
        const isDept = DEPARTMENTS.includes(h.role);
        if (isDept) {
          const detailsStr = h.details || "";
          const parts = detailsStr.split(",").map(p => p.trim());
          const filteredParts = parts.filter(p => {
            const pLower = p.toLowerCase();
            return pLower.includes("mì (tc)") || 
                   pLower.includes("sữa (tc)") || 
                   pLower.includes("mì") || 
                   pLower.includes("sữa") || 
                   pLower.includes("tăng ca");
          });

          const isOvertimeAction = 
            actionLower.includes("tăng ca") || 
            actionLower.includes("ack") ||
            actionLower.includes("nhận");

          if (filteredParts.length > 0 || isOvertimeAction) {
            return {
              ...h,
              details: filteredParts.length > 0 ? filteredParts.join(", ") : h.details
            };
          }
        }

        return null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [reportData?.history]);

  // Xử lý và nhóm dữ liệu cần thiết cho giao diện Nhà ăn
  const processedData = useMemo(() => {
    const dataByShift = {};
    if (!reportData) return {};
    SHIFTS.forEach(shift => {
      const shiftData = reportData[shift];
      if (!shiftData?.confirmedByAdmin) {
        // Nếu Admin chưa gửi số liệu cho ca này thì bỏ qua (Nhà ăn không thấy gì)
        return;
      }
      const summary = shiftData.summary || {};
      const confirmedSummary = shiftData.confirmedSummary || {};  // Số liệu Nhà ăn đã chốt trước đó
      const isConfirmed = !!shiftData.confirmedByCanteen;
      const needsReconfirmation = tsSec(shiftData.confirmedAtAdmin) > tsSec(shiftData.confirmedAtCanteen);

      // Số liệu hiển thị trên bảng chính:
      // - Nếu Nhà ăn đã từng xác nhận: dùng số đã chốt (confirmedSummary)
      // - Nếu chưa xác nhận lần nào: dùng số Admin gửi (summary)
      const displaySummary = isConfirmed ? confirmedSummary : summary;

      // Nếu Admin có cập nhật mới sau khi Nhà ăn đã xác nhận, tính danh sách chênh lệch
      const deltas = [];
      if (isConfirmed && needsReconfirmation) {
        ALL_MEAL_KEYS.forEach(k => {
          const oldVal = Number(confirmedSummary[k] || 0);
          const newVal = Number(summary[k] || 0);
          if (oldVal !== newVal) {
            deltas.push({ key: k, label: LABEL_BY_KEY[k], oldVal, newVal });
          }
        });
      }

      // Tổng hợp các yêu cầu lãnh suất ăn tăng ca của các bộ phận trong ca này
      const requests = [];
      const reports = shiftData.reports || {};
      const fulfilledMap = shiftData.overtimeFulfilled || {};
      for (const dept in reports) {
        const reqMi = Number(reports[dept]?.tangCaMi || 0);
        const reqSua = Number(reports[dept]?.tangCaSua || 0);
        // Chỉ thêm vào danh sách nếu bộ phận có yêu cầu tăng ca > 0
        if (reqMi > 0 || reqSua > 0) {
          const fulfilled = fulfilledMap[dept] || {};
          const fulMi = Number(fulfilled.mi || 0);
          const fulSua = Number(fulfilled.sua || 0);
          requests.push({
            dept,
            reqMi, reqSua,
            fulMi, fulSua,
            isRecallPending: !!fulfilled.recallPending,
            miToFulfill: Math.max(0, reqMi - fulMi),
            suaToFulfill: Math.max(0, reqSua - fulSua),
            deptAck: fulfilled.deptAck || null,
            deptAckAt: fulfilled.deptAckAt || null
          });
        }
      }

      // Tổng hợp các mục EHS đã trả lại chờ Nhà ăn xác nhận nhận lại
      const pendingCanteenRecallAck = [];
      for (const dept in fulfilledMap) {
        const f = fulfilledMap[dept];
        if (f?.recallReturnedToCanteen && !f?.recallCanteenAck) {
          const reports = shiftData.reports || {};
          const reqMi = Number(reports[dept]?.tangCaMi || 0);
          const reqSua = Number(reports[dept]?.tangCaSua || 0);
          const fulMi = Number(f.mi || 0);
          const fulSua = Number(f.sua || 0);
          const surplusMi = Math.max(0, fulMi - reqMi);
          const surplusSua = Math.max(0, fulSua - reqSua);
          if (surplusMi > 0 || surplusSua > 0) {
            pendingCanteenRecallAck.push({ dept, surplusMi, surplusSua });
          }
        }
      }

      dataByShift[shift] = {
        summary: summary,                   // Số liệu Admin gửi mới nhất
        confirmedSummary: confirmedSummary, // Số liệu Nhà ăn đã chốt (nếu có)
        displaySummary: displaySummary,     // Số liệu để render bảng chính
        confirmedByCanteen: shiftData.confirmedByCanteen,
        needsReconfirmation,
        deltas,                             // Danh sách chênh lệch (nếu có cập nhật mới)
        requests: requests.sort((a, b) => a.dept.localeCompare(b.dept)),
        pendingCanteenRecallAck,
      };
    });
    return dataByShift;
  }, [reportData]);

  // Nhà ăn xác nhận đã nhận lại mì/sữa từ EHS (bước cuối của quy trình thu hồi)
  const confirmCanteenRecallAck = async (shift, dept, surplusMi, surplusSua) => {
    if (!(await askConfirm(
      `Xác nhận Nhà Ăn đã nhận lại ${surplusMi > 0 ? `${surplusMi} mì` : ''}${surplusMi > 0 && surplusSua > 0 ? ' và ' : ''}${surplusSua > 0 ? `${surplusSua} sữa` : ''} từ EHS (${SHIFT_NAMES[shift]} - ${dept})?`,
      "Nhà Ăn xác nhận nhận lại từ EHS"
    ))) return;
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    const reports = reportData[shift]?.reports || {};
    const reqMi = Number(reports[dept]?.tangCaMi || 0);
    const reqSua = Number(reports[dept]?.tangCaSua || 0);
    try {
      await updateDoc(docRef, {
        [`${shift}.overtimeFulfilled.${dept}.recallCanteenAck`]: canteenName,
        [`${shift}.overtimeFulfilled.${dept}.recallCanteenAckAt`]: serverTimestamp(),
        [`${shift}.overtimeFulfilled.${dept}.mi`]: reqMi,
        [`${shift}.overtimeFulfilled.${dept}.sua`]: reqSua,
        [`${shift}.overtimeFulfilled.${dept}.recallPending`]: false,
        history: arrayUnion({
          user: canteenName,
          role: user?.role || 'Nhà Ăn',
          action: 'Nhà Ăn xác nhận nhận lại từ EHS',
          shift,
          details: `Đã nhận lại ${surplusMi} mì, ${surplusSua} sữa từ EHS (${dept}). Chốt suất phát thực tế: Mì [${reqMi}], Sữa [${reqSua}].`,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      });
      pushToast('Đã xác nhận nhận lại từ EHS.', 'success');
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `Nhà Ăn đã xác nhận nhận lại ${surplusMi} mì, ${surplusSua} sữa từ EHS (${dept} - ${SHIFT_NAMES[shift]}). Quy trình thu hồi hoàn tất.`,
        targetRoles: ["admin", "ehs"],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  const confirmShift = async (shift, isReconfirm = false) => {
    const actionText = isReconfirm ? 'xác nhận thay đổi' : 'nhận số liệu';
    if (!(await askConfirm(`Xác nhận đã ${actionText} cho ${SHIFT_NAMES[shift]}?`, "Xác nhận nhận số liệu"))) return;
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    // Lấy số liệu summary mới nhất mà Admin vừa gửi
    const currentSummary = reportData[shift]?.summary || {};
    try {
      await updateDoc(docRef, {
        [`${shift}.confirmedSummary`]: currentSummary, // Lưu snapshot số liệu tại thời điểm xác nhận
        [`${shift}.confirmedByCanteen`]: canteenName,
        [`${shift}.confirmedAtCanteen`]: serverTimestamp(),
        history: arrayUnion({
          user: canteenName,
          role: user?.role || 'Nhà Ăn',
          action: `Nhà Ăn ${actionText}`,
          shift,
          details: `Đã ${actionText} từ Aldila.`,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      });
      pushToast(`Đã xác nhận ${SHIFT_NAMES[shift]}.`, 'success');
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `Nhà Ăn đã ${actionText} suất ăn ca ${SHIFT_NAMES[shift]}.`,
        targetRoles: ["admin", "ehs"],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thất bại.', 'error');
    }
  };

  const fulfillOvertime = async (shift, req) => {
    const { dept, reqMi, reqSua, fulMi, fulSua, miToFulfill, suaToFulfill } = req;
    const actionText = (fulMi > 0 || fulSua > 0) ? 'phát bù' : 'phát';
    if (miToFulfill === 0 && suaToFulfill === 0) {
      pushToast('Không có gì để phát bù.', 'info');
      return;
    }
    if (!(await askConfirm(`Xác nhận ${actionText} ${miToFulfill} mì và ${suaToFulfill} sữa cho ${dept} (${SHIFT_NAMES[shift]})?`, "Xác nhận phát tăng ca"))) {
      return;
    }
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    try {
      await updateDoc(docRef, {
        [`${shift}.overtimeFulfilled.${dept}`]: {
          by: canteenName,
          at: serverTimestamp(),
          mi: reqMi,
          sua: reqSua,
          recallPending: false,
          deptAck: null,
          deptAckAt: null
        },
        history: arrayUnion({
          user: canteenName,
          role: user?.role || 'Nhà Ăn',
          action: `Nhà ăn ${actionText} tăng ca`,
          shift,
          details: `${dept} - Mì: +${miToFulfill}, Sữa: +${suaToFulfill} (Tổng phát: ${reqMi} Mì, ${reqSua} Sữa)`,
          timestampMs: Date.now()
        }),
      });
      pushToast(`Đã ${actionText} cho ${dept}.`, 'success');
      await addDoc(collection(db, "notifications"), {
        type: "meal_registration",
        message: `Nhà Ăn đã ${actionText} ${miToFulfill} mì và ${suaToFulfill} sữa tăng ca cho bộ phận ${dept} (${SHIFT_NAMES[shift]}).`,
        targetRoles: ["admin", "ehs", dept],
        readBy: [],
        createdBy: user.uid || "",
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      pushToast('Thao tác thất bại.', 'error');
    }
  };

  return (
    <div>
      {Object.keys(processedData).length === 0 && (
        <div className="card" style={{ padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
          <p>Chưa có ca nào được Aldila gửi.</p>
        </div>
      )}

      {SHIFTS.map(shift => {
        const data = processedData[shift];
        if (!data) return null;

        const isConfirmed = !!data.confirmedByCanteen;
        // Chỉ hiện bảng yêu cầu tăng ca sau khi Nhà ăn đã xác nhận và không có cập nhật mới
        const canShowRequests = isConfirmed && !data.needsReconfirmation;

        return (
          <React.Fragment key={shift}>
            {/* Banner EHS trả lại mì/sữa — Nhà Ăn cần xác nhận nhận lại */}
            {data.pendingCanteenRecallAck?.map(item => (
              <div key={`recall-canteen-${item.dept}`} style={{
                marginBottom: 12,
                padding: '14px 16px',
                background: '#f5f3ff',
                border: '2px solid #a78bfa',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div>
                  <span style={{ fontSize: 18, marginRight: 8 }}>↩️</span>
                  <strong>EHS trả lại ({item.dept} – {SHIFT_NAMES[shift]}):</strong>{' '}
                  {item.surplusMi > 0 ? `${item.surplusMi} mì` : ''}{item.surplusMi > 0 && item.surplusSua > 0 ? ' và ' : ''}{item.surplusSua > 0 ? `${item.surplusSua} sữa` : ''}
                  <span style={{ color: '#6d28d9', fontWeight: 600, marginLeft: 6 }}>Vui lòng xác nhận đã nhận lại!</span>
                </div>
                <button
                  onClick={() => confirmCanteenRecallAck(shift, item.dept, item.surplusMi, item.surplusSua)}
                  style={{
                    background: '#7c3aed',
                    color: '#fff',
                    border: 0,
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 14,
                    whiteSpace: 'nowrap'
                  }}
                >
                  ✅ Xác nhận đã nhận lại từ EHS
                </button>
              </div>
            ))}
            {/* Cảnh báo khi có số liệu mới cập nhật (cần xác nhận lại) */}
            {isConfirmed && data.needsReconfirmation && (
              <div style={{
                marginBottom: 12,
                padding: '12px 16px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 8,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10
              }}>
                <p style={{ margin: 0, color: '#b45309', fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>⚠️</span>
                  Aldila đã cập nhật số liệu cho ca này. Vui lòng xác nhận thay đổi để tiếp tục.
                </p>
                <button
                  onClick={() => confirmShift(shift, true)}
                  style={{
                    background: '#f9a825',
                    color: '#fff',
                    border: 0,
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 15
                  }}
                >
                  Xác nhận thay đổi
                </button>
              </div>
            )}

            <div className="card" style={{ marginBottom: 12, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
              <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between' }}>
                <span>Số lượng suất ăn – {SHIFT_NAMES[shift]}</span>
                {isConfirmed && (
                  <span style={{ fontSize: 12, color: '#1e5bb8', fontWeight: 700 }}>
                    Đã nhận bởi {data.confirmedByCanteen}
                  </span>
                )}
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '100%' : 400 }}>
                <thead style={{ background: colors.primaryLight || '#eef5ff' }}>
                  <tr>
                    <th style={{ padding: 8, border: '1px solid #eee' }}>Loại cơm/suất ăn</th>
                    <th style={{ padding: 8, border: '1px solid #eee' }}>Số lượng đã nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(MEAL_TYPES).map(([cat, types]) => (
                    <React.Fragment key={cat}>
                      {Object.entries(types).map(([k, label]) => (
                        <tr key={k}>
                          <td style={{ padding: 8, border: '1px solid #f0f0f0' }}>{label}</td>
                          <td style={{ padding: 8, border: '1px solid #f0f0f0', textAlign: 'center', fontWeight: 700 }}>
                            {data.summary?.[k] || 0}
                            <Delta diff={isConfirmed && data.needsReconfirmation ? (Number(data.summary?.[k] || 0) - Number(data.confirmedSummary?.[k] || 0)) : 0} />
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                </table>
              </div>

              {/* Nút xác nhận lần đầu (chỉ hiện nếu chưa xác nhận) */}
              {!isConfirmed && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button onClick={() => confirmShift(shift, false)} style={{ background: colors.primary, color: '#fff', border: 0, padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                    Xác nhận đã nhận
                  </button>
                </div>
              )}
            </div>

            {/* Bảng yêu cầu lãnh tăng ca (hiện sau khi đã xác nhận và không cần xác nhận lại) */}
            {canShowRequests && data.requests.length > 0 && (
              <div className="card" style={{ margin: '-5px 0 12px 0', padding: 12, border: '1px solid #eee', borderRadius: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <h4 style={{ marginTop: 0 }}>Yêu cầu lãnh tăng ca – {SHIFT_NAMES[shift]}</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f1f5f9' }}>
                      <tr>
                        <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>Bộ phận</th>
                        <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>Mì (yêu cầu)</th>
                        <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>Sữa (yêu cầu)</th>
                        <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>Đã phát (Mì/Sữa)</th>
                        <th style={{ padding: 8, border: '1px solid #e2e8f0' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.requests.map(req => {
                        const canFulfill = req.miToFulfill > 0 || req.suaToFulfill > 0;
                        const actionText = (req.fulMi > 0 || req.fulSua > 0) ? 'Phát bù' : 'Phát';
                        const isFulfilled = !canFulfill && (req.reqMi > 0 || req.reqSua > 0);

                        return (
                          <tr key={req.dept}>
                            <td style={{ padding: 8, border: '1px solid #f1f5f9' }}>{req.dept}</td>
                            <td style={{ padding: 8, border: '1px solid #f1f5f9', textAlign: 'center' }}>{req.reqMi}</td>
                            <td style={{ padding: 8, border: '1px solid #f1f5f9', textAlign: 'center' }}>{req.reqSua}</td>
                            <td style={{ padding: 8, border: '1px solid #f1f5f9', textAlign: 'center' }}>{req.fulMi} / {req.fulSua}</td>
                            <td style={{ padding: 8, border: '1px solid #f1f5f9', textAlign: 'center' }}>
                              {req.isRecallPending ? (
                                <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12 }}>Chờ EHS thu hồi</span>
                              ) : canFulfill ? (
                                <button
                                  onClick={() => fulfillOvertime(shift, req)}
                                  style={{ background: colors.success, color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
                                >
                                  {actionText} (+{req.miToFulfill} mì, +{req.suaToFulfill} sữa)
                                </button>
                              ) : isFulfilled ? (
                                req.deptAck ? (
                                  <span style={{ color: '#166534', fontWeight: 700, fontSize: 12 }} title={`Đã xác nhận lúc ${fmtTime(req.deptAckAt)}`}>
                                    ✅ Đã nhận đủ ({req.deptAck})
                                  </span>
                                ) : (
                                  <span style={{ color: '#d97706', fontWeight: 700, fontSize: 12 }}>
                                    Đã phát đủ (Chờ BP nhận)
                                  </span>
                                )
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Lịch sử hoạt động báo cơm của ngày */}
      <h3 style={{ marginTop: 28, marginBottom: 12, color: colors.primary, borderBottom: `2px solid ${colors.primaryLight || '#E88E2E'}`, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        📋 Lịch sử thay đổi & xác nhận trong ngày
      </h3>
      
      {(!filteredHistory || filteredHistory.length === 0) ? (
        <div style={{ padding: 16, background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 12, color: '#666', textAlign: 'center' }}>
          Chưa ghi nhận lịch sử hoạt động nào trong ngày.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 12, background: 'white', maxHeight: 350, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold' }}>Thời điểm</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold' }}>Ca</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold' }}>Hành động</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold' }}>Chi tiết thay đổi</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold' }}>Người thực hiện (Bộ phận)</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 12px', color: '#666', whiteSpace: 'nowrap' }}>{fmtTime(h.timestampMs)}</td>
                  <td style={{ padding: '10px 12px', color: '#333', fontWeight: 600 }}>{SHIFT_NAMES[h.shift] || h.shift || '-'}</td>
                  <td style={{ padding: '10px 12px', color: colors.primary, fontWeight: 600 }}>{h.action || '-'}</td>
                  <td style={{ padding: '10px 12px', color: '#444' }}>{h.details || '-'}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontWeight: 500 }}>
                    {h.user} <span style={{ color: '#888', fontSize: 11 }}>({h.role})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --- ExportBaoComModal: Modal xuất báo cáo --- */
function ExportBaoComModal({ onClose }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isGen, setIsGen] = useState(false);

  const toId = (d) => {
    if (!(d instanceof Date)) d = new Date(d);
    return dateKey(d);
  };

  async function readDay(dayId) {
    const snap = await getDoc(doc(db, "meal_reports", dayId));
    if (!snap.exists()) {
      return { dayId, data: {} };
    }
    const d = snap.data();
    const pack = {};
    for (const shiftKey of ["HC", "S1", "S2", "S3", "S8"]) {
      const node = d[shiftKey] || {};
      
      // Lấy số lượng cơ sở làm mốc (tính tổng chung cho các loại cơm thường)
      let baseSum = node.confirmedSummary || node.summary;
      if (!baseSum) {
        baseSum = {
          congNhanMan: 0, congNhanChay: 0,
          giamSatMan: 0, giamSatSua: 0, giamSatChay: 0,
          tangCaMi: 0, tangCaSua: 0
        };
        const reps = node.reports || {};
        Object.values(reps).forEach(r => {
          baseSum.congNhanMan += +(r?.congNhanMan || 0);
          baseSum.congNhanChay += +(r?.congNhanChay || 0);
          baseSum.giamSatMan += +(r?.giamSatMan || 0);
          baseSum.giamSatSua += +(r?.giamSatSua || 0);
          baseSum.giamSatChay += +(r?.giamSatChay || 0);
        });
      }

      // Tính riêng số lượng Mì và Sữa Tăng Ca thực nhận (chỉ tính của các bộ phận đã xác nhận)
      let confirmedOvertimeMi = 0;
      let confirmedOvertimeSua = 0;

      const reps = node.reports || {};
      const fulfilled = node.overtimeFulfilled || {};

      Object.entries(reps).forEach(([deptKey, r]) => {
        const ful = fulfilled[deptKey] || {};
        // Chỉ tính nếu bộ phận đã bấm xác nhận nhận đủ (deptAck có giá trị)
        if (ful.deptAck) {
          confirmedOvertimeMi += Number(ful.mi || 0);
          confirmedOvertimeSua += Number(ful.sua || 0);
        }
      });

      // Tạo đối tượng tổng hợp cuối cùng để điền vào Excel
      const finalTotals = {
        ...baseSum,
        tangCaMi: confirmedOvertimeMi,
        tangCaSua: confirmedOvertimeSua
      };

      pack[shiftKey] = {
        totals: finalTotals,
        overtimeFulfilled: fulfilled
      };
    }
    return { dayId, data: pack };
  }

  const SHIFT_COLUMNS = {
    S1: { cn: 2, vp: 3, mi: 4, sua: 5 },
    S2: { cn: 6, vp: 7, mi: 8, sua: 9 },
    S3: { cn: 10, vp: 11, mi: 12, sua: 13 },
    HC: { cn: 14, vp: 15, mi: 16, sua: 17 },
    S8: { cn: 18, vp: 19, mi: 20, sua: 21 }
  };

  function fillDay(ws, dayIndex, mm, yyyy, payload) {
    const dayNum = dayIndex + 1;
    const rowNum = dayNum + 5; // Ngày 1 là dòng 6, Ngày 31 là dòng 36
    
    // Ghi ngày vào cột A (dd/mm/yyyy)
    const dateStr = `${String(dayNum).padStart(2, '0')}/${mm}/${yyyy}`;
    ws.getCell(rowNum, 1).value = dateStr;
    
    // Ghi số liệu các ca
    for (const [shiftKey, cols] of Object.entries(SHIFT_COLUMNS)) {
      const shiftData = payload.data?.[shiftKey] || {};
      const sum = shiftData.totals || {
        congNhanMan: 0, congNhanChay: 0,
        giamSatMan: 0, giamSatChay: 0, giamSatSua: 0,
        tangCaMi: 0, tangCaSua: 0
      };
      
      const cn = Number(sum.congNhanMan || 0) + Number(sum.congNhanChay || 0);
      const vp = Number(sum.giamSatMan || 0) + Number(sum.giamSatChay || 0) + Number(sum.giamSatSua || 0);
      
      // Mì và sữa tăng ca lấy từ số lượng nhà ăn nhận được (totals.tangCaMi / totals.tangCaSua)
      const mi = Number(sum.tangCaMi || 0);
      const sua = Number(sum.tangCaSua || 0);
      
      ws.getCell(rowNum, cols.cn).value = cn;
      ws.getCell(rowNum, cols.vp).value = vp;
      ws.getCell(rowNum, cols.mi).value = mi;
      ws.getCell(rowNum, cols.sua).value = sua;
    }
  }

  async function onExport() {
    try {
      if (!selectedMonth) {
        return alert("Vui lòng chọn tháng.");
      }
      setIsGen(true);

      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const mm = String(month + 1).padStart(2, '0');
      const yyyy = String(year);

      // Tạo danh sách các ngày trong tháng (định dạng YYYY-MM-DD)
      const dateKeys = [];
      for (let i = 1; i <= daysInMonth; i++) {
        dateKeys.push(`${yyyy}-${mm}-${String(i).padStart(2, '0')}`);
      }

      // Chuẩn bị workbook từ file template Excel
      const [{ default: ExcelJS }, { saveAs }] = await Promise.all([ import("exceljs"), import("file-saver") ]);
      const resp = await fetch("/templates/Baocom.xlsx", { cache: "no-store" });
      if (!resp.ok) throw new Error("Không tìm thấy template Baocom.xlsx trong /templates");
      const buf = await resp.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet("BaoCom") || wb.worksheets[0];

      // Cập nhật tiêu đề chính (hàng 1 - ô A1) theo tháng năm đã chọn
      const cellA1 = ws.getCell('A1');
      cellA1.value = `SỐ LƯỢNG (XUẤT ĂN) THÁNG ${mm} NĂM ${yyyy}`;

      // Lấy dữ liệu tất cả các ngày trong tháng song song
      const payloads = await Promise.all(dateKeys.map(dayKey => readDay(dayKey)));

      // Điền dữ liệu vào file cho từng ngày
      payloads.forEach((pl, index) => {
        fillDay(ws, index, mm, yyyy, pl);
      });

      // Xuất file Excel sau khi điền xong
      const outFileName = `BaoCom_${mm}_${yyyy}.xlsx`;
      const out = await wb.xlsx.writeBuffer();
      saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheet.sheet" }), outFileName);

      alert("Xuất báo cáo thành công!");
      onClose();
    } catch (e) {
      console.error(e);
      alert("Xuất báo cáo thất bại: " + e.message);
    } finally {
      setIsGen(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: "min(420px, 95vw)" }}>
        <h3 style={{ marginTop: 0 }}>Xuất báo cáo Báo cơm</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Chọn tháng</label>
          <DatePicker
            selected={selectedMonth}
            onChange={setSelectedMonth}
            dateFormat="MM/yyyy"
            showMonthYearPicker
            className="date-picker-input"
            wrapperClassName="date-picker-wrapper"
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={isGen} style={{ padding: "8px 12px", borderRadius: 6, border: '1px solid #ccc', background: '#eee' }}>Hủy</button>
          <button onClick={onExport} disabled={isGen || !selectedMonth} style={{ padding: "8px 12px", background: "#1f80e0", color: "#fff", border: "none", borderRadius: 6, opacity: (isGen || !selectedMonth) ? 0.6 : 1 }}>
            {isGen ? "Đang tạo..." : "Xuất Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- BaoCom: Component chính --- */
export default function BaoCom({ user, isMobile }) {
  const { t } = useI18n();
  const { pushToast } = useToast();

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [openDept, setOpenDept] = useState(null);
  const [showExport, setShowExport] = useState(false);
  // Tab bộ phận hiện tại khi user có nhiều bộ phận hoặc là Admin/EHS xem tất cả các bộ phận
  const [activeDeptTab, setActiveDeptTab] = useState(0);
  const [adminTab, setAdminTab] = useState('summary'); // 'summary' (Tổng hợp & Gửi Nhà Ăn) hoặc 'depts' (Báo cơm từng Bộ phận dưới dạng mini tabs)

  const selectedDateKey = dateKey(selectedDate);
  const prevStatusRef = useRef({});

  const userRoles = user?.role ? (Array.isArray(user.role) ? user.role : [String(user.role)]).flatMap(r => String(r).split(',')).map(r => r.trim().toLowerCase()).filter(Boolean) : [];
  const rawRoles = user?.role ? (Array.isArray(user.role) ? user.role : [String(user.role)]).flatMap(r => String(r).split(',')).map(r => r.trim()).filter(Boolean) : [];

  // Role ưu tiên để xác định giao diện chính (admin/ehs/Nhà Ăn)
  const isAdmin = userRoles.includes('admin') || userRoles.includes('ehs');
  const isCanteen = rawRoles.includes('Nhà Ăn');
  const rawRole = rawRoles.join(', ');

  // Xác định tất cả các role bộ phận mà user có (có thể nhiều hơn 1)
  const deptRoles = rawRoles.filter(r => DEPARTMENTS.includes(r));

  // Nếu user là "EHS Committee" có trường mealDept hợp lệ -> cho phép đại diện bộ phận
  const isProxy = userRoles.includes('ehs committee') && user?.mealDept && DEPARTMENTS.includes(user.mealDept);

  // Nếu là proxy (ehs committee với mealDept), thêm mealDept vào danh sách bộ phận nếu chưa có
  // Với Admin/EHS, effectiveDeptRoles sẽ chứa tất cả các bộ phận để hiển thị dưới dạng tab nhỏ (trừ Nhà Ăn)
  const effectiveDeptRoles = useMemo(() => {
    if (isAdmin) {
      return DEPARTMENTS;
    }
    if (isProxy && !deptRoles.includes(user.mealDept)) {
      return [user.mealDept, ...deptRoles];
    }
    return deptRoles;
  }, [isAdmin, isProxy, deptRoles, user?.mealDept]);

  // Lắng nghe dữ liệu báo cáo của ngày được chọn (real-time)
  useEffect(() => {
    setLoading(true);
    const ref = doc(db, 'meal_reports', selectedDateKey);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setReportData(data);
      setLoading(false);
    },
    (error) => {
      // Firestore deny hoặc lỗi mạng → không để loading treo vĩnh viễn
      console.error("Lỗi onSnapshot meal_reports:", error.code, error.message);
      setReportData({});
      setLoading(false);
    });
    return () => unsub();
  }, [selectedDateKey]);

  // Chọn nội dung giao diện hiển thị tùy theo vai trò người dùng
  let content;
  if (loading) {
    content = <div>{t("loading.meals")}</div>;
  } else if (isAdmin) {
    content = (
      <div>
        {/* Admin/EHS Main Tab Switcher */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid #ddd', paddingBottom: 10 }}>
          <button
            onClick={() => setAdminTab('summary')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 20,
              background: adminTab === 'summary' ? colors.primary : '#f5f5f5',
              color: adminTab === 'summary' ? '#fff' : '#333',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📊 Tổng hợp & Gửi Nhà Ăn
          </button>
          <button
            onClick={() => setAdminTab('depts')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 20,
              background: adminTab === 'depts' ? colors.primary : '#f5f5f5',
              color: adminTab === 'depts' ? '#fff' : '#333',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🏢 Báo cơm từng Bộ phận
          </button>
        </div>

        {adminTab === 'summary' ? (
          <AdminView 
            user={user}
            reportData={reportData}
            selectedDateKey={selectedDateKey}
            onDeptClick={(dept) => {
              setOpenDept(dept);
            }}
            onOpenExport={() => setShowExport(true)}
            isMobile={isMobile}
          />
        ) : (
          <div>
            {/* Tab nhỏ chọn bộ phận */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {effectiveDeptRoles.map((dept, idx) => (
                <button
                  key={dept}
                  onClick={() => setActiveDeptTab(idx)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 16,
                    border: activeDeptTab === idx ? 'none' : '1px solid #ddd',
                    background: activeDeptTab === idx ? colors.primary : '#f5f5f5',
                    color: activeDeptTab === idx ? '#fff' : colors.textPrimary,
                    fontWeight: activeDeptTab === idx ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: 13,
                    transition: 'all 0.15s',
                  }}
                >
                  {dept}
                </button>
              ))}
            </div>
            {/* Render DepartmentView cho bộ phận đang chọn */}
            <DepartmentView
              key={effectiveDeptRoles[activeDeptTab] || effectiveDeptRoles[0]}
              user={{ ...user, role: effectiveDeptRoles[activeDeptTab] || effectiveDeptRoles[0] }}
              reportData={reportData}
              selectedDateKey={selectedDateKey}
              selectedDate={selectedDate}
            />
          </div>
        )}
      </div>
    );
  } else if (isCanteen) {
    content = <CanteenView
      user={user}
      reportData={reportData}
      selectedDateKey={selectedDateKey}
      isMobile={isMobile}
    />;
  } else if (effectiveDeptRoles.length > 0) {
    // User có 1 hoặc nhiều bộ phận
    if (effectiveDeptRoles.length === 1) {
      // Chỉ 1 bộ phận: hiển thị trực tiếp như cũ
      const deptUser = { ...user, role: effectiveDeptRoles[0] };
      content = <DepartmentView
        user={deptUser}
        reportData={reportData}
        selectedDateKey={selectedDateKey}
        selectedDate={selectedDate}
      />;
    } else {
      // Nhiều bộ phận: hiển thị tab nhỏ cho từng bộ phận
      const currentDept = effectiveDeptRoles[activeDeptTab] || effectiveDeptRoles[0];
      const deptUser = { ...user, role: currentDept };
      content = (
        <div>
          {/* Tab nhỏ chọn bộ phận */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {effectiveDeptRoles.map((dept, idx) => (
              <button
                key={dept}
                onClick={() => setActiveDeptTab(idx)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 20,
                  border: activeDeptTab === idx ? 'none' : '1px solid #ddd',
                  background: activeDeptTab === idx ? colors.primary : '#f5f5f5',
                  color: activeDeptTab === idx ? '#fff' : colors.textPrimary,
                  fontWeight: activeDeptTab === idx ? 700 : 400,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.15s',
                }}
              >
                {dept}
              </button>
            ))}
          </div>
          {/* Render DepartmentView cho bộ phận đang chọn */}
          <DepartmentView
            key={currentDept}
            user={deptUser}
            reportData={reportData}
            selectedDateKey={selectedDateKey}
            selectedDate={selectedDate}
          />
        </div>
      );
    }
  } else {
    content = <div>{t("baoCom.noAccess").replace("{role}", rawRole)}</div>;
  }

  return (
    <div style={{ width: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 8, color: colors.primary }}>{t("baoCom.title")}</h2>
      <div style={{ marginBottom: 16 }}>
        <DatePicker
          selected={selectedDate}
          onChange={setSelectedDate}
          dateFormat="dd/MM/yyyy"
          className="date-picker-input"
          wrapperClassName="date-picker-wrapper"
        />
        <style>{`
          .date-picker-input {
            padding: 8px;
            border-radius: 8px;
            border: 1px solid #ddd;
          }
          .date-picker-wrapper {
            width: 100%;
            max-width: 280px;
          }
          .date-picker-wrapper input {
            width: 100%;
            box-sizing: border-box;
          }

          /* Hiển thị nút +/- trên mobile */
          .number-control-btn {
            display: none;
          }
          @media (max-width: 768px) {
            .number-control-btn {
              display: inline-flex !important;
              vertical-align: middle;
            }
            .number-input-wrapper input[type="number"] {
              width: 50px !important;
              padding-left: 2px !important;
              padding-right: 2px !important;
            }
            .number-input-wrapper {
              max-width: 150px;
              justify-content: flex-end;
              margin-left: auto;
            }
          }
        `}</style>
      </div>

      {content}
      {openDept && (
        <DeptDetailModal
          department={openDept}
          reportData={reportData}
          onClose={() => setOpenDept(null)}
        />
      )}
      {showExport && <ExportBaoComModal onClose={() => setShowExport(false)} />}
    </div>
  );
}