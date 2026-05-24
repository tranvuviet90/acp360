import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { useI18n } from "../i18n/I18nProvider";
import { useConfirm } from "./LightboxSwipeOnly";

const boDams = [
  "Bộ đàm 1", "Bộ đàm 2", "Bộ đàm 3", "Bộ đàm 4", "Bộ đàm 5",
  "Bộ đàm 6", "Bộ đàm 7", "Bộ đàm 8", "Bộ đàm 9", "Bộ đàm 10",
  "Bộ đàm 11", "Bộ đàm 12", "Bộ đàm 13", "Bộ đàm 14", "Bộ đàm 15"
];

const orange = "#466E73";
const orangeLight = "#A9D9D4";
const dark = "#222";
const red = "#d9534f";

function BoDam({ user, isMobile }) {
  const { t } = useI18n();
  const { askConfirm } = useConfirm();
  const [status, setStatus] = useState(() => boDams.map(() => ({ checked: false, name: "", unavailable: false })));
  const userRole = (user && user.role) ? user.role.toLowerCase() : '';

  useEffect(() => {
    const docRef = doc(db, "bodam", "status");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().status) setStatus(docSnap.data().status);
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
    if (userRole === "admin" || userRole === "ehs") {
      fetchUsers();
    }
  }, [userRole]);

  async function handleAssign(idx, targetUserId, targetUserName) {
    let newStatus = [...status];
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, assignedTo: { uid: targetUserId, name: targetUserName } };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
    
    try {
      await addDoc(collection(db, "notifications"), {
        type: "bodam_assign",
        message: `Bạn được chỉ định sử dụng ${boDams[idx]}. Hãy vào tab Bộ đàm để chấp nhận.`,
        targetUserId: targetUserId,
        readBy: [],
        relatedId: `bodam-${idx}-${targetUserId}`,
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error(e); }
  }

  async function handleCancelAssign(idx) {
    if (!(await askConfirm("Bạn có chắc muốn hủy chỉ định này không?", "Hủy chỉ định bộ đàm"))) return;
    const assignedUser = status[idx]?.assignedTo;
    let newStatus = [...status];
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, assignedTo: null };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });

    if (assignedUser) {
      try {
        const q = query(collection(db, "notifications"), where("relatedId", "==", `bodam-${idx}-${assignedUser.uid}`));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (err) {
        console.error("Lỗi xóa thông báo chỉ định:", err);
      }
    }
  }

  async function handleAccept(idx) {
    let newStatus = [...status];
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, checked: true, name: user.name, assignedTo: null };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });

    try {
      const q = query(collection(db, "notifications"), where("relatedId", "==", `bodam-${idx}-${user.uid}`));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.error("Lỗi tự dọn dẹp thông báo:", err);
    }
  }

  async function handleCheck(idx) {
    if (status[idx]?.unavailable) return;
    let newStatus = [...status];
    const cur = newStatus[idx];
    newStatus[idx] = cur.checked ? { ...cur, checked: false, name: "" } : { ...cur, checked: true, name: user.name };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  async function handleToggleUnavailable(idx) {
    let newStatus = [...status];
    const cur = newStatus[idx];
    newStatus[idx] = { ...cur, unavailable: !cur.unavailable, checked: false, name: '' };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  return (
    <div>
      <h2 style={{ fontWeight: 700, marginBottom: 22, color: orange, letterSpacing: 0.5 }}>{t("bodam.title")}</h2>

      {isMobile ? (
        <div>
          {boDams.map((item, idx) => (
            <div key={idx} style={{ background: idx % 2 ? "#F4FAF9" : "#fff", opacity: status[idx]?.unavailable ? 0.5 : 1, padding: '15px', border: `1.2px solid ${orangeLight}`, borderRadius: 12, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontWeight: 600, color: dark, fontSize: 18, marginBottom: 12 }}>{item}</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: (status[idx]?.unavailable || status[idx]?.assignedTo) ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={status[idx]?.checked || false} disabled={status[idx]?.unavailable || status[idx]?.assignedTo} style={{ width: 22, height: 22, accentColor: orange, marginRight: 14 }} onChange={() => handleCheck(idx)} />
                  <div>
                    {status[idx]?.unavailable ? (
                      <span style={{ color: red, fontWeight: 700 }}>{t("bodam.unavailable")}</span>
                    ) : status[idx]?.assignedTo ? (
                      <span style={{ color: "#d9534f", fontWeight: 700 }}>Đã chỉ định cho {status[idx].assignedTo.name} - Chờ xác nhận</span>
                    ) : status[idx]?.checked ? (
                      <span style={{ color: orange, fontWeight: 700 }}>{status[idx].name} — {t("bodam.inuse")}</span>
                    ) : (
                      <span style={{ color: "#b0b0b0", fontWeight: 600 }}>{t("bodam.returned")}</span>
                    )}
                  </div>
                </label>
              </div>
              {(userRole === 'admin' || userRole === 'ehs') && (
                <>
                  <button onClick={() => handleToggleUnavailable(idx)} style={{ background: status[idx]?.unavailable ? '#f0ad4e' : '#6c757d', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>
                    {status[idx]?.unavailable ? t("bodam.reopen") : t("bodam.disable")}
                  </button>
                  {!status[idx]?.unavailable && !status[idx]?.checked && !status[idx]?.assignedTo && (
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
                  {status[idx]?.assignedTo && (
                    <button onClick={() => handleCancelAssign(idx)} style={{ background: '#d9534f', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>
                      Hủy chỉ định
                    </button>
                  )}
                </>
              )}
              {status[idx]?.assignedTo?.uid === user.uid && (
                <button onClick={() => handleAccept(idx)} style={{ background: '#4caf50', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: '8px' }}>Chấp nhận sử dụng</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1.5px 9px #E88E2E11", border: `1.2px solid ${orangeLight}` }}>
          <thead>
            <tr style={{ background: orangeLight }}>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.name")}</th>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.status")}</th>
              {(userRole === 'admin' || userRole === 'ehs') && (
                <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>{t("bodam.col.action")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {boDams.map((item, idx) => (
              <tr key={idx} style={{ background: idx % 2 ? "#F4FAF9" : "#fff", opacity: status[idx]?.unavailable ? 0.5 : 1 }}>
                <td style={{ padding: "15px 22px", fontWeight: 600, color: dark }}>{item}</td>
                <td style={{ padding: "15px 22px" }}>
                  <input type="checkbox" checked={status[idx]?.checked || false} disabled={status[idx]?.unavailable || status[idx]?.assignedTo} style={{ width: 22, height: 22, accentColor: orange, marginRight: 14, cursor: (status[idx]?.unavailable || status[idx]?.assignedTo) ? 'not-allowed' : 'pointer', verticalAlign: 'middle' }} onChange={() => handleCheck(idx)} />
                  {status[idx]?.unavailable ? (
                    <span style={{ color: red, fontWeight: 700 }}>{t("bodam.unavailable")}</span>
                  ) : status[idx]?.assignedTo ? (
                    <>
                      <span style={{ color: "#d9534f", fontWeight: 700, marginRight: 10 }}>Đã chỉ định cho {status[idx].assignedTo.name} - Chờ xác nhận</span>
                      {status[idx].assignedTo.uid === user.uid && (
                        <button onClick={() => handleAccept(idx)} style={{ background: '#4caf50', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>Chấp nhận</button>
                      )}
                    </>
                  ) : status[idx]?.checked ? (
                    <span style={{ color: orange, fontWeight: 700 }}>{status[idx].name} — {t("bodam.inuse")}</span>
                  ) : (
                    <span style={{ color: "#b0b0b0", fontWeight: 600 }}>{t("bodam.returned")}</span>
                  )}
                </td>
                {(userRole === 'admin' || userRole === 'ehs') && (
                  <td style={{ padding: "15px 22px" }}>
                    <button onClick={() => handleToggleUnavailable(idx)} style={{ background: status[idx]?.unavailable ? '#f0ad4e' : '#6c757d', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
                      {status[idx]?.unavailable ? t("bodam.reopen") : t("bodam.markUnavailable")}
                    </button>
                    {!status[idx]?.unavailable && !status[idx]?.checked && !status[idx]?.assignedTo && (
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
                    {status[idx]?.assignedTo && (
                      <button onClick={() => handleCancelAssign(idx)} style={{ background: '#d9534f', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
                        Hủy chỉ định
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 13, color: orange, marginTop: 15 }}>{t("bodam.note")}</div>
      <div style={{ fontSize: 14, color: red, marginTop: 10, fontWeight: 'bold' }}>{t("bodam.emergency")}</div>
    </div>
  );
}

export default BoDam;