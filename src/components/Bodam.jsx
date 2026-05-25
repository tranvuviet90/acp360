import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, getDoc } from "firebase/firestore";
import { useI18n } from "../i18n/I18nProvider";
import { useConfirm } from "./LightboxSwipeOnly";

const DEFAULT_COUNT = 15;
const orange = "#466E73";
const orangeLight = "#A9D9D4";
const dark = "#222";
const red = "#d9534f";

function BoDam({ user, isMobile }) {
  const { t } = useI18n();
  const { askConfirm } = useConfirm();
  const [status, setStatus] = useState([]);
  const [bodamCount, setBodamCount] = useState(DEFAULT_COUNT);
  const userRole = (user && user.role) ? user.role.toLowerCase() : '';
  const isAdmin = userRole === "admin" || userRole === "ehs";

  // Lấy số lượng bộ đàm từ Firestore config
  useEffect(() => {
    const configRef = doc(db, "bodam", "config");
    const unsub = onSnapshot(configRef, (snap) => {
      if (snap.exists() && snap.data().count) {
        setBodamCount(snap.data().count);
      } else {
        setBodamCount(DEFAULT_COUNT);
      }
    });
    return unsub;
  }, []);

  // Lấy trạng thái bộ đàm từ Firestore
  useEffect(() => {
    const docRef = doc(db, "bodam", "status");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().status) {
        setStatus(docSnap.data().status);
      }
    });
    return unsub;
  }, []);

  const [committeeUsers, setCommitteeUsers] = useState([]);
  useEffect(() => {
    const fetchUsers = async () => {
      const q = query(collection(db, "users"), where("role", "==", "ehs committee"));
      const snap = await getDocs(q);
      const users = [];
      snap.forEach(d => users.push({ uid: d.id, ...d.data() }));
      setCommitteeUsers(users);
    };
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  // Lấy item cho index, nếu chưa có thì trả về default
  function getItem(idx) {
    return status[idx] || { checked: false, name: "", unavailable: false };
  }

  function getBodamName(idx) {
    return `Bộ đàm ${idx + 1}`;
  }

  // Thêm bộ đàm
  async function handleAddBodam() {
    const newCount = bodamCount + 1;
    await setDoc(doc(db, "bodam", "config"), { count: newCount });
  }

  // Bớt bộ đàm (chỉ xóa nếu bộ đàm cuối chưa được sử dụng)
  async function handleRemoveBodam() {
    if (bodamCount <= 1) return;
    const lastIdx = bodamCount - 1;
    const lastItem = getItem(lastIdx);
    if (lastItem.checked || lastItem.assignedTo) {
      await askConfirm(
        `Bộ đàm ${lastIdx + 1} đang được sử dụng hoặc đã chỉ định. Vui lòng thu hồi trước khi xóa.`,
        "Không thể xóa"
      );
      return;
    }
    if (!(await askConfirm(`Bạn có chắc muốn xóa Bộ đàm ${lastIdx + 1} không?`, "Xác nhận xóa bộ đàm"))) return;
    const newCount = bodamCount - 1;
    await setDoc(doc(db, "bodam", "config"), { count: newCount });
    // Dọn trạng thái nếu có
    const newStatus = [...status];
    if (newStatus.length > newCount) {
      newStatus.splice(newCount);
      await setDoc(doc(db, "bodam", "status"), { status: newStatus });
    }
  }

  async function handleAssign(idx, targetUserId, targetUserName) {
    const newStatus = [...status];
    while (newStatus.length <= idx) newStatus.push({ checked: false, name: "", unavailable: false });
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, assignedTo: { uid: targetUserId, name: targetUserName } };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
    try {
      await addDoc(collection(db, "notifications"), {
        type: "bodam_assign",
        message: `Bạn được chỉ định sử dụng ${getBodamName(idx)}. Hãy vào tab Bộ đàm để chấp nhận.`,
        targetUserId: targetUserId,
        createdBy: user.uid,
        readBy: [],
        relatedId: `bodam-${idx}-${targetUserId}`,
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error(e); }
  }

  async function handleCancelAssign(idx) {
    if (!(await askConfirm("Bạn có chắc muốn hủy chỉ định này không?", "Hủy chỉ định bộ đàm"))) return;
    const assignedUser = getItem(idx).assignedTo;
    const newStatus = [...status];
    while (newStatus.length <= idx) newStatus.push({ checked: false, name: "", unavailable: false });
    newStatus[idx] = { ...newStatus[idx], assignedTo: null };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
    if (assignedUser) {
      try {
        const q = query(collection(db, "notifications"), where("relatedId", "==", `bodam-${idx}-${assignedUser.uid}`));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (err) { console.error("Lỗi xóa thông báo chỉ định:", err); }
    }
  }

  async function handleAccept(idx) {
    const newStatus = [...status];
    while (newStatus.length <= idx) newStatus.push({ checked: false, name: "", unavailable: false });
    newStatus[idx] = { ...newStatus[idx], checked: true, name: user.name, assignedTo: null };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
    try {
      const q = query(collection(db, "notifications"), where("relatedId", "==", `bodam-${idx}-${user.uid}`));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) { console.error("Lỗi tự dọn dẹp thông báo:", err); }
  }

  async function handleCheck(idx) {
    const item = getItem(idx);
    if (item.unavailable) return;
    const newStatus = [...status];
    while (newStatus.length <= idx) newStatus.push({ checked: false, name: "", unavailable: false });
    const cur = newStatus[idx];
    newStatus[idx] = cur.checked ? { ...cur, checked: false, name: "" } : { ...cur, checked: true, name: user.name };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  async function handleToggleUnavailable(idx) {
    const newStatus = [...status];
    while (newStatus.length <= idx) newStatus.push({ checked: false, name: "", unavailable: false });
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, unavailable: !cur.unavailable, checked: false, name: '' };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  const indices = Array.from({ length: bodamCount }, (_, i) => i);

  return (
    <div>
      {/* Header với nút thêm/bớt cho Admin */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontWeight: 700, color: orange, letterSpacing: 0.5, margin: 0 }}>{t("bodam.title")}</h2>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>
              Tổng: <b style={{ color: orange }}>{bodamCount}</b> bộ đàm
            </span>
            <button
              onClick={handleAddBodam}
              title="Thêm bộ đàm"
              style={{ background: orange, color: 'white', border: 'none', borderRadius: 7, width: 34, height: 34, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
            >+</button>
            <button
              onClick={handleRemoveBodam}
              title="Bớt bộ đàm cuối"
              style={{ background: bodamCount <= 1 ? '#ccc' : red, color: 'white', border: 'none', borderRadius: 7, width: 34, height: 34, fontSize: 22, cursor: bodamCount <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
              disabled={bodamCount <= 1}
            >−</button>
          </div>
        )}
      </div>

      {isMobile ? (
        <div>
          {indices.map((idx) => {
            const item = getItem(idx);
            return (
              <div key={idx} style={{ background: idx % 2 ? "#F4FAF9" : "#fff", opacity: item.unavailable ? 0.5 : 1, padding: '15px', border: `1.2px solid ${orangeLight}`, borderRadius: 12, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontWeight: 600, color: dark, fontSize: 18, marginBottom: 12 }}>{getBodamName(idx)}</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: (item.unavailable || item.assignedTo) ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" checked={item.checked || false} disabled={item.unavailable || item.assignedTo} style={{ width: 22, height: 22, accentColor: orange, marginRight: 14 }} onChange={() => handleCheck(idx)} />
                    <div>
                      {item.unavailable ? (
                        <span style={{ color: red, fontWeight: 700 }}>{t("bodam.unavailable")}</span>
                      ) : item.assignedTo ? (
                        <span style={{ color: "#d9534f", fontWeight: 700 }}>Đã chỉ định cho {item.assignedTo.name} - Chờ xác nhận</span>
                      ) : item.checked ? (
                        <span style={{ color: orange, fontWeight: 700 }}>{item.name} — {t("bodam.inuse")}</span>
                      ) : (
                        <span style={{ color: "#b0b0b0", fontWeight: 600 }}>{t("bodam.returned")}</span>
                      )}
                    </div>
                  </label>
                </div>
                {isAdmin && (
                  <>
                    <button onClick={() => handleToggleUnavailable(idx)} style={{ background: item.unavailable ? '#f0ad4e' : '#6c757d', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>
                      {item.unavailable ? t("bodam.reopen") : t("bodam.disable")}
                    </button>
                    {!item.unavailable && !item.checked && !item.assignedTo && (
                      <select style={{ marginTop: 8, padding: 8, borderRadius: 6, width: '100%', border: `1px solid ${orangeLight}` }} onChange={(e) => {
                        if (e.target.value) {
                          const sel = committeeUsers.find(u => u.uid === e.target.value);
                          handleAssign(idx, sel.uid, sel.name);
                          e.target.value = "";
                        }
                      }}>
                        <option value="">Chỉ định người dùng...</option>
                        {committeeUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                      </select>
                    )}
                    {item.assignedTo && (
                      <button onClick={() => handleCancelAssign(idx)} style={{ background: '#d9534f', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>
                        Hủy chỉ định
                      </button>
                    )}
                  </>
                )}
                {item.assignedTo?.uid === user.uid && (
                  <button onClick={() => handleAccept(idx)} style={{ background: '#4caf50', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>Chấp nhận sử dụng</button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1.5px 9px #E88E2E11", border: `1.2px solid ${orangeLight}` }}>
          <thead>
            <tr style={{ background: orangeLight }}>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.name")}</th>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.status")}</th>
              {isAdmin && (
                <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.action")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {indices.map((idx) => {
              const item = getItem(idx);
              return (
                <tr key={idx} style={{ background: idx % 2 ? "#F4FAF9" : "#fff", opacity: item.unavailable ? 0.5 : 1 }}>
                  <td style={{ padding: "15px 22px", fontWeight: 600, color: dark }}>{getBodamName(idx)}</td>
                  <td style={{ padding: "15px 22px" }}>
                    <input type="checkbox" checked={item.checked || false} disabled={item.unavailable || item.assignedTo} style={{ width: 22, height: 22, accentColor: orange, marginRight: 14, cursor: (item.unavailable || item.assignedTo) ? 'not-allowed' : 'pointer', verticalAlign: 'middle' }} onChange={() => handleCheck(idx)} />
                    {item.unavailable ? (
                      <span style={{ color: red, fontWeight: 700 }}>{t("bodam.unavailable")}</span>
                    ) : item.assignedTo ? (
                      <>
                        <span style={{ color: "#d9534f", fontWeight: 700, marginRight: 10 }}>Đã chỉ định cho {item.assignedTo.name} - Chờ xác nhận</span>
                        {item.assignedTo.uid === user.uid && (
                          <button onClick={() => handleAccept(idx)} style={{ background: '#4caf50', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>Chấp nhận</button>
                        )}
                      </>
                    ) : item.checked ? (
                      <span style={{ color: orange, fontWeight: 700 }}>{item.name} — {t("bodam.inuse")}</span>
                    ) : (
                      <span style={{ color: "#b0b0b0", fontWeight: 600 }}>{t("bodam.returned")}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: "15px 22px" }}>
                      <button onClick={() => handleToggleUnavailable(idx)} style={{ background: item.unavailable ? '#f0ad4e' : '#6c757d', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
                        {item.unavailable ? t("bodam.reopen") : t("bodam.markUnavailable")}
                      </button>
                      {!item.unavailable && !item.checked && !item.assignedTo && (
                        <select style={{ padding: 6, borderRadius: 6, border: `1px solid ${orangeLight}` }} onChange={(e) => {
                          if (e.target.value) {
                            const sel = committeeUsers.find(u => u.uid === e.target.value);
                            handleAssign(idx, sel.uid, sel.name);
                            e.target.value = "";
                          }
                        }}>
                          <option value="">Chỉ định người dùng...</option>
                          {committeeUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                        </select>
                      )}
                      {item.assignedTo && (
                        <button onClick={() => handleCancelAssign(idx)} style={{ background: '#d9534f', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
                          Hủy chỉ định
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 13, color: orange, marginTop: 15 }}>{t("bodam.note")}</div>
      <div style={{ fontSize: 14, color: red, marginTop: 10, fontWeight: 'bold' }}>{t("bodam.emergency")}</div>
    </div>
  );
}

export default BoDam;