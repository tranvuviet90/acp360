import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  doc, onSnapshot, setDoc, updateDoc, getDoc,
  serverTimestamp, arrayUnion, writeBatch
} from 'firebase/firestore';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { colors } from '../theme';
import { useToast } from './LightboxSwipeOnly';

/* =========================
 * HẰNG SỐ & HỖ TRỢ CHUNG
 * ========================= */
const SHIFTS = ['S1', 'S2', 'S3', 'S8', 'HC'];
const SHIFT_NAMES = { S1: "Ca 1", S2: "Ca 2", S3: "Ca 3", S8: "Ca 8", HC: "Ca HC" };

const MEAL_TYPES = {
  congNhan: { congNhanMan: 'Cơm mặn (CN)', congNhanChay: 'Cơm chay (CN)' },
  giamSat:  { giamSatMan: 'Cơm mặn (GS)', giamSatChay: 'Cơm chay (GS)', giamSatSua: 'Sữa (cơm) (GS)' },
  tangCa:   { tangCaMi: 'Mì (TC)', tangCaSua: 'Sữa (TC)' }
};
const ALL_MEAL_KEYS = Object.values(MEAL_TYPES).flatMap(o => Object.keys(o));
const LABEL_BY_KEY = Object.fromEntries(Object.entries(MEAL_TYPES).flatMap(([_, g]) => Object.entries(g)));

const DEPARTMENTS = [
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

const dateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};
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
const NumberInput = React.memo(function NumberInput({ value, onChange, min = 0, style, placeholder = "Nhập" }) {
  const shown = (value === 0 || value === null || value === undefined) ? '' : value;
  const safeVal = Number(value || 0);

  const handleInputChange = (e) => {
    const v = e.target.value;
    if (v === '') return onChange(0);
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n >= min) onChange(n);
  };

  // Dùng useCallback để luôn lấy giá trị safeVal mới nhất khi gọi từ useLongPress
  const increment = useCallback(() => {
    onChange(safeVal + 1);
  }, [safeVal, onChange]);

  const decrement = useCallback(() => {
    const newVal = safeVal - 1;
    if (newVal >= min) {
      onChange(newVal);
    } else if (safeVal > min) {
      onChange(min);
    }
  }, [safeVal, onChange, min]);

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
        onTouchStart={(e) => { e.stopPropagation(); longPressDecrement.onTouchStart?.(e); }}
        onTouchEnd={(e)   => { e.stopPropagation(); longPressDecrement.onTouchEnd?.(e); }}
        onMouseDown={longPressDecrement.onMouseDown}
        onMouseUp={longPressDecrement.onMouseUp}
        onMouseLeave={longPressDecrement.onMouseLeave}
        onClick={longPressDecrement.onClick}
        disabled={safeVal <= min}
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
        onFocus={(e) => {
          // Giữ focus khi tap nhanh trên Android (sửa lỗi mất focus)
          setTimeout(() => {
            e.target.setSelectionRange?.(0, String(e.target.value || '').length);
          }, 0);
        }}
        style={{ width: 80, padding: 6, textAlign: 'center', borderRadius: 8, border: '1px solid #ddd', touchAction: 'manipulation', ...style }}
      />

      <button
        type="button"
        className="number-control-btn"
        style={{ ...btnStyle, color: '#5cb85c' }}
        onTouchStart={(e) => { e.stopPropagation(); longPressIncrement.onTouchStart?.(e); }}
        onTouchEnd={(e)   => { e.stopPropagation(); longPressIncrement.onTouchEnd?.(e); }}
        onMouseDown={longPressIncrement.onMouseDown}
        onMouseUp={longPressIncrement.onMouseUp}
        onMouseLeave={longPressIncrement.onMouseLeave}
        onClick={longPressIncrement.onClick}
      >
        +
      </button>
    </div>
  );
});

/* --- DepartmentView: Giao diện bộ phận --- */
function DepartmentView({ user, reportData, selectedDateKey }) {
  const { pushToast } = useToast();
  const userRole = user.role;
  const [formData, setFormData] = useState({});

  // NEW: khóa đồng bộ khi đang gõ + snapshot gần nhất để so sánh sâu
  const isEditingRef = useRef(false);
  const lastSnapshotRef = useRef(null);

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

  if (!formData[SHIFTS[0]]) {
    return <div>Đang tải form...</div>;
  }

  // Handler onChange ổn định
  const makeOnChange = useCallback((shift, key) => (n) => {
    if (Number.isNaN(n) || n < 0) return;
    setFormData(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: n } }));
  }, []);

  const saveShift = async (shift) => {
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
      // --- Trường hợp đã phát TC: gửi yêu cầu cập nhật lên Admin ---
      reportPayload.changePending = true;
      action = 'Bộ phận Y/C cập nhật Tăng Ca';
      details = `Yêu cầu đổi TC (đã phát): Mì [${prevTangCaMi} -> ${newTangCaMi}], Sữa [${prevTangCaSua} -> ${newTangCaSua}]`;

      const payload = {
        [shift]: { reports: { [userRole]: reportPayload } },
        history: arrayUnion({
          user: user.name, role: userRole, action, shift, details,
          timestampMs: Date.now()
        }),
        lastHistoryAt: serverTimestamp()
      };

      try {
        await setDoc(docRef, payload, { merge: true });
        pushToast(`Đã gửi YÊU CẦU cập nhật TC cho ${SHIFT_NAMES[shift]} đến Admin.`, 'info');
      } catch (e) {
        console.error(e);
        pushToast('Gửi yêu cầu thất bại.', 'error');
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
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange(shift, k)} />
                </div>
              ))}
            </div>
            <div>
              <h4>Cơm giám sát</h4>
              {Object.entries(MEAL_TYPES.giamSat).map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{label}: </label>
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange(shift, k)} />
                </div>
              ))}
            </div>
            <div>
              <h4>Tăng ca</h4>
              {Object.entries(MEAL_TYPES.tangCa).map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{label}: </label>
                  <NumberInput value={formData[shift][k]} onChange={makeOnChange(shift, k)} />
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => saveShift(shift)} style={{ marginTop: 10, background: colors.primary, color: '#fff', border: 0, padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
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
                return (
                  <tr key={shift}>
                    <td style={cellStyle}>{SHIFT_NAMES[shift]}</td>
                    <td style={cellStyle}>{rep.congNhanMan || 0}</td>
                    <td style={cellStyle}>{rep.congNhanChay || 0}</td>
                    <td style={cellStyle}>{rep.giamSatMan || 0}</td>
                    <td style={cellStyle}>{rep.giamSatChay || 0}</td>
                    <td style={cellStyle}>{rep.giamSatSua || 0}</td>
                    <td style={cellStyle}>{rep.tangCaMi || 0}</td>
                    <td style={cellStyle}>{rep.tangCaSua || 0}</td>
                    <td style={{ ...cellStyle, fontSize: 12 }}>{fmtTime(rep.lastUpdated) || '-'}</td>
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
function AdminView({ user, reportData, selectedDateKey, onDeptClick, onOpenExport }) {
  const { pushToast } = useToast();
  const [adjustedTotals, setAdjustedTotals] = useState({});

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
            recalls.push({ shift, dept, surplusMi, surplusSua, reqMi, reqSua });
          }
        }
      }
    });
    return recalls;
  }, [reportData]);

  const confirmRecall = async (recall) => {
    if (!window.confirm(`Xác nhận đã thu hồi ${recall.surplusMi} mì và ${recall.surplusSua} sữa từ bộ phận ${recall.dept} (${SHIFT_NAMES[recall.shift]})?`)) {
      return;
    }
    const docRef = doc(db, 'meal_reports', selectedDateKey);
    try {
      await updateDoc(docRef, {
        [`${recall.shift}.overtimeFulfilled.${recall.dept}.mi`]: recall.reqMi,
        [`${recall.shift}.overtimeFulfilled.${recall.dept}.sua`]: recall.reqSua,
        [`${recall.shift}.overtimeFulfilled.${recall.dept}.recallPending`]: false,
        history: arrayUnion({
          user: user.name,
          role: user.role,
          action: 'EHS/Admin xác nhận thu hồi tăng ca',
          shift: recall.shift,
          details: `${recall.dept}: Thu hồi ${recall.surplusMi} mì, ${recall.surplusSua} sữa.`,
          timestampMs: Date.now()
        }),
      });
      pushToast('Đã xác nhận thu hồi.', 'success');
    } catch (e) {
      console.error(e);
      pushToast('Xác nhận thu hồi thất bại.', 'error');
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
      init[shift] = reportData?.[shift]?.summary || summary[shift] || {};
    });
    setAdjustedTotals(init);
  }, [summary, reportData]);

  const onAdjust = (shift, key, val) => {
    // Cập nhật giá trị điều chỉnh khi Admin sửa ô input
    if (val === '') {
      setAdjustedTotals(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: 0 } }));
      return;
    }
    const v = parseInt(val, 10);
    if (!Number.isNaN(v) && v >= 0) {
      setAdjustedTotals(prev => ({ ...prev, [shift]: { ...prev[shift], [key]: v } }));
    }
  };

  const confirmShift = async (shift) => {
    if (!window.confirm(`Xác nhận & gửi ${SHIFT_NAMES[shift]} cho Nhà Ăn?`)) return;
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
            [`${shift}.overtimeFulfilled.${dept}.recallPending`]: true
          });
        }
      }
    }

    // Ghi lịch sử xác nhận gửi Nhà ăn
    batch.update(docRef, {
      history: arrayUnion({
        user: user.name,
        role: user.role,
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
                  <th style={{ padding: 8, border: '1px solid #fecaca' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {recallRequests.map(rec => (
                  <tr key={`${rec.shift}-${rec.dept}`}>
                    <td style={{ padding: 8, border: '1px solid #fecaca' }}>{rec.dept}</td>
                    <td style={{ padding: 8, border: '1px solid #fecaca' }}>{SHIFT_NAMES[rec.shift]}</td>
                    <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center', fontWeight: 'bold' }}>{rec.surplusMi}</td>
                    <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center', fontWeight: 'bold' }}>{rec.surplusSua}</td>
                    <td style={{ padding: 8, border: '1px solid #fecaca', textAlign: 'center' }}>
                      <button
                        onClick={() => confirmRecall(rec)}
                        style={{ background: '#dc2626', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
                      >
                        Xác nhận đã thu hồi
                      </button>
                    </td>
                  </tr>
                ))}
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

        const canConfirm = !statusAdmin || newAfterSend || isAdjusted(shift);

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

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                            <NumberInput value={adjustedTotals[shift]?.[k] ?? 0} onChange={(n) => onAdjust(shift, k, n)} />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

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
function CanteenView({ user, reportData, selectedDateKey }) {
  const { pushToast } = useToast();

  // Tên hiển thị của tài khoản Nhà ăn (ưu tiên tên đầy đủ nếu có)
  const canteenName = useMemo(() => user?.name || user?.displayName || 'Nhà Ăn', [user]);

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
          });
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
      };
    });
    return dataByShift;
  }, [reportData]);

  const confirmShift = async (shift, isReconfirm = false) => {
    const actionText = isReconfirm ? 'xác nhận thay đổi' : 'nhận số liệu';
    if (!window.confirm(`Xác nhận đã ${actionText} cho ${SHIFT_NAMES[shift]}?`)) return;
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
    if (!window.confirm(`Xác nhận ${actionText} ${miToFulfill} mì và ${suaToFulfill} sữa cho ${dept} (${SHIFT_NAMES[shift]})?`)) {
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
          recallPending: false
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

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                            {data.displaySummary?.[k] || 0}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

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
                                <span style={{ color: '#166534', fontWeight: 700, fontSize: 12 }}>Đã phát đủ</span>
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
  const fmtVNDate = (d) => {
    if (!(d instanceof Date)) d = new Date(d);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  // Ánh xạ key ca sang nhãn ca trong template Excel
  const SHIFT_LABEL_BY_KEY = { S1: "S1+S4", S2: "S2+S5", S3: "S3", S8: "S8", HC: "HC" };
  // Ánh xạ key dữ liệu sang vị trí cột (offset 0-based) trong file Excel
  const NEW_COL_OFFSETS = {
    cnMan: 0,  // Cơm mặn (CN)
    cnChay: 1, // Cơm chay (CN)
    gsMan: 2,  // Cơm mặn (GS)
    gsSua: 3,  // Sữa (cơm) (GS)
    gsChay: 4, // Cơm chay (GS)
    tcMi: 5,   // Mì (TC)
    tcSua: 6,  // Sữa (TC)
    user: 7    // Tên người báo
  };

  async function readDay(dayId) {
    const snap = await getDoc(doc(db, "meal_reports", dayId));
    if (!snap.exists()) {
      // Trả về đối tượng rỗng nếu không có báo cáo ngày này
      return { dayId, data: {}, ot: {} };
    }
    const d = snap.data();

    // Lấy tên người báo cáo tăng ca (nếu có) từ trường overtimeDept
    const ot = {};
    Object.entries(d.overtimeDept || {}).forEach(([dept, node]) => {
      if (node?.lastUpdatedBy) {
        ot[dept] = node.lastUpdatedBy;
      }
    });

    const pack = {};
    for (const shiftKey of ["HC", "S1", "S2", "S3", "S8"]) {
      const node = d[shiftKey] || {};
      let sum = node.summary; // Tổng số liệu Admin đã chốt cho ca này
      if (!sum) {
        // Nếu Admin chưa chốt (chưa gửi), tự tính tổng từ các báo cáo bộ phận
        sum = {
          congNhanMan: 0, congNhanChay: 0,
          giamSatMan: 0, giamSatSua: 0, giamSatChay: 0,
          tangCaMi: 0, tangCaSua: 0
        };
        const reps = node.reports || {};
        Object.values(reps).forEach(r => {
          sum.congNhanMan += +(r?.congNhanMan || 0);
          sum.congNhanChay += +(r?.congNhanChay || 0);
          sum.giamSatMan += +(r?.giamSatMan || 0);
          sum.giamSatSua += +(r?.giamSatSua || 0);
          sum.giamSatChay += +(r?.giamSatChay || 0);
          sum.tangCaMi += +(r?.tangCaMi || 0);
          sum.tangCaSua += +(r?.tangCaSua || 0);
        });
      }
      // pack[shiftKey] bao gồm tổng số liệu (totals) và chi tiết báo cáo từng bộ phận (reports)
      pack[shiftKey] = { totals: sum, reports: (node.reports || {}) };
    }
    return { dayId, data: pack, ot };
  }

  // Duyệt worksheet Excel để xây dựng mapping từ bộ phận + ca -> dòng (row) trong file
  function buildRowMap(ws) {
    const map = {};
    let curDept = null;
    for (let r = 1; r <= (ws.rowCount || ws.properties.maxRow || 200); r++) {
      const dep = ws.getCell(r, 1).value; // Cột A: tên bộ phận
      const sh = ws.getCell(r, 2).value;  // Cột B: ca làm
      if (dep) {
        curDept = dep.toString().trim();
        if (!map[curDept]) map[curDept] = {};
      }
      if (curDept && sh) {
        const lab = sh.toString().trim();
        if (["HC", "S1+S4", "S2+S5", "S3", "S8"].includes(lab)) {
          map[curDept][lab] = r;
        }
      }
    }
    return map;
  }

  // Điền dữ liệu cho một ngày (dayIndex: chỉ số ngày 0-based, 0 tương ứng ngày 1)
  function fillDay(ws, rowMap, dayIndex, payload) {
    const startCol = 3 + (dayIndex * 8); // cột bắt đầu cho ngày (C = 3)
    Object.entries(rowMap).forEach(([dept, shifts]) => {
      for (const [key, label] of Object.entries(SHIFT_LABEL_BY_KEY)) {
        const row = shifts[label];
        if (!row) continue;
        // Lấy báo cáo chi tiết của bộ phận ở ca `key` (HC/S1/S2/S3/S8)
        const report = payload.data?.[key]?.reports?.[dept] || {};
        const putNum = (off, val) => ws.getCell(row, startCol + off).value = Number(val || 0);
        const putStr = (off, val) => ws.getCell(row, startCol + off).value = val || '';
        // Điền số liệu vào các cột tương ứng
        putNum(NEW_COL_OFFSETS.cnMan,  report.congNhanMan);
        putNum(NEW_COL_OFFSETS.cnChay, report.congNhanChay);
        putNum(NEW_COL_OFFSETS.gsMan,  report.giamSatMan);
        putNum(NEW_COL_OFFSETS.gsSua,  report.giamSatSua);
        putNum(NEW_COL_OFFSETS.gsChay, report.giamSatChay);
        putNum(NEW_COL_OFFSETS.tcMi,   report.tangCaMi);
        putNum(NEW_COL_OFFSETS.tcSua,  report.tangCaSua);
        putStr(NEW_COL_OFFSETS.user,   report.user); // Tên người báo (nếu có)
      }
    });
    // Điền tiêu đề "Ngày dd/mm" trên cột đầu của khối ngày
    const dateLabel = payload.dayId.includes('T') ? payload.dayId.split('T')[0] : payload.dayId;
    ws.getCell(2, startCol).value = (`Ngày ${fmtVNDate(new Date(dateLabel))}`).toUpperCase();
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

      // Cập nhật tiêu đề chính (ô D1) theo tháng năm đã chọn
      const cellD1 = ws.getCell('D1');
      cellD1.value = `TỔNG HỢP SỐ LIỆU BÁO CƠM ${mm}/${yyyy}`;
      cellD1.font = { size: 48, bold: true };
      cellD1.alignment = { horizontal: 'center', vertical: 'middle' };

      // Xây dựng bản đồ hàng cho các bộ phận và ca
      const rowMap = buildRowMap(ws);

      // Lấy dữ liệu tất cả các ngày trong tháng song song
      const payloads = await Promise.all(dateKeys.map(dayKey => readDay(dayKey)));

      // Điền dữ liệu vào file cho từng ngày
      payloads.forEach((pl, index) => {
        fillDay(ws, rowMap, index, pl);
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
export default function BaoCom({ user }) {
  const { pushToast } = useToast();

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [openDept, setOpenDept] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const selectedDateKey = dateKey(selectedDate);
  const prevStatusRef = useRef({});

  const rawRole = user?.role || '';
  // Nếu user là "EHS Committee" có trường mealDept hợp lệ -> cho phép đại diện bộ phận
  const isProxy = rawRole.toLowerCase() === 'ehs committee' && user?.mealDept && DEPARTMENTS.includes(user.mealDept);
  const effectiveRole = isProxy ? user.mealDept : rawRole;
  const proxyUser = isProxy ? { ...user, role: user.mealDept } : user;

  // Lắng nghe dữ liệu báo cáo của ngày được chọn (real-time)
  useEffect(() => {
    setLoading(true);
    const ref = doc(db, 'meal_reports', selectedDateKey);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setReportData(data);
      setLoading(false);

      // Kiểm tra thay đổi trạng thái xác nhận để thông báo (toast) cho người dùng tương ứng
      const next = {};
      SHIFTS.forEach(s => {
        const node = data?.[s] || {};
        next[s] = {
          admin: !!node.confirmedByAdmin,
          canteen: !!node.confirmedByCanteen
        };
      });

      // Nếu người dùng là Admin/EHS: thông báo khi Nhà ăn xác nhận mới một ca
      if (rawRole === 'admin' || rawRole === 'ehs') {
        SHIFTS.forEach(s => {
          if ((prevStatusRef.current?.[s]?.canteen || false) === false && next[s]?.canteen === true) {
            pushToast(`🍽️ Nhà ăn đã xác nhận ${SHIFT_NAMES[s]}.`, 'success');
          }
        });
      }
      // Nếu người dùng là Nhà Ăn: thông báo khi Admin gửi số liệu mới
      if (rawRole === 'Nhà Ăn') {
        SHIFTS.forEach(s => {
          if ((prevStatusRef.current?.[s]?.admin || false) === false && next[s]?.admin === true) {
            pushToast(`📨 Đã nhận số liệu ${SHIFT_NAMES[s]} từ Aldila.`, 'info');
          }
        });
      }
      prevStatusRef.current = next;
    });
    return () => unsub();
  }, [selectedDateKey, rawRole, pushToast]);

  // Chọn nội dung giao diện hiển thị tùy theo vai trò người dùng
  let content;
  if (loading) {
    content = <div>Đang tải dữ liệu báo cơm...</div>;
  } else if (effectiveRole === 'admin' || effectiveRole === 'ehs') {
    content = <AdminView 
      user={user}
      reportData={reportData}
      selectedDateKey={selectedDateKey}
      onDeptClick={setOpenDept}
      onOpenExport={() => setShowExport(true)}
    />;
  } else if (effectiveRole === 'Nhà Ăn') {
    content = <CanteenView
      user={user}
      reportData={reportData}
      selectedDateKey={selectedDateKey}
    />;
  } else if (DEPARTMENTS.includes(effectiveRole)) {
    content = <DepartmentView
      user={proxyUser}
      reportData={reportData}
      selectedDateKey={selectedDateKey}
    />;
  } else {
    content = <div>Vai trò của bạn ({rawRole}) không có quyền truy cập chức năng báo cơm.</div>;
  }

  return (
    <div>
      <h2 style={{ fontWeight: 700, marginBottom: 8, color: colors.primary }}>Báo cơm ngày</h2>
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
