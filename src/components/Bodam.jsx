import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

const boDams = [
  "Bộ đàm 1", "Bộ đàm 2", "Bộ đàm 3", "Bộ đàm 4",
  "Bộ đàm 5", "Bộ đàm 6", "Bộ đàm 7"
];

const orange = "#E88E2E";
const orangeLight = "#FFD8A8";
const dark = "#222";
const red = "#d9534f";

function BoDam({ user, isMobile }) {
  const [status, setStatus] = useState(() => boDams.map(() => ({ checked: false, name: "", unavailable: false })));
  const userRole = (user && user.role) ? user.role.toLowerCase() : '';

  useEffect(() => {
    const docRef = doc(db, "bodam", "status");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().status) {
        setStatus(docSnap.data().status);
      }
    });
    return unsub;
  }, []);

  async function handleCheck(idx) {
    if (status[idx]?.unavailable) return;

    let newStatus = [...status];
    const currentItem = newStatus[idx];

    newStatus[idx] = currentItem.checked
      ? { ...currentItem, checked: false, name: "" }
      : { ...currentItem, checked: true, name: user.name };
      
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  async function handleToggleUnavailable(idx) {
    let newStatus = [...status];
    const currentItem = newStatus[idx];
    const isNowUnavailable = !currentItem.unavailable;

    newStatus[idx] = { 
        ...currentItem, 
        unavailable: isNowUnavailable,
        checked: false,
        name: '' 
    };
    await setDoc(doc(db, "bodam", "status"), { status: newStatus });
  }

  return (
    <div>
      <h2 style={{ fontWeight: 700, marginBottom: 22, color: orange, letterSpacing: 0.5 }}>
        Quản lý bộ đàm
      </h2>
      
      {isMobile ? (
        // Giao diện Thẻ trên Mobile
        <div>
          {boDams.map((item, idx) => (
            <div key={idx} style={{
              background: idx % 2 ? "#fff6ea" : "#fff",
              opacity: status[idx]?.unavailable ? 0.5 : 1,
              padding: '15px',
              border: `1.2px solid ${orangeLight}`,
              borderRadius: 12,
              marginBottom: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <div style={{ fontWeight: 600, color: dark, fontSize: 18, marginBottom: 12 }}>{item}</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: status[idx]?.unavailable ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={status[idx]?.checked || false}
                    disabled={status[idx]?.unavailable}
                    style={{ width: 22, height: 22, accentColor: orange, marginRight: 14 }}
                    onChange={() => handleCheck(idx)}
                  />
                  <div>
                    {status[idx]?.unavailable ? (
                      <span style={{ color: red, fontWeight: 700 }}>Không khả dụng</span>
                    ) : status[idx]?.checked ? (
                      <span style={{ color: orange, fontWeight: 700 }}>
                        {status[idx].name} — Đang sử dụng
                      </span>
                    ) : (
                      <span style={{ color: "#b0b0b0", fontWeight: 600 }}>
                        Đã trả
                      </span>
                    )}
                  </div>
                </label>
              </div>
              {(userRole === 'admin' || userRole === 'ehs') && (
                <button 
                  onClick={() => handleToggleUnavailable(idx)}
                  style={{
                    background: status[idx]?.unavailable ? '#f0ad4e' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    marginTop: '8px'
                  }}
                >
                  {status[idx]?.unavailable ? 'Mở lại' : 'Tắt (Bảo trì)'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Giao diện Bảng trên PC
        <table style={{
          borderCollapse: "separate", borderSpacing: 0, width: "100%", background: "#fff",
          borderRadius: 14, overflow: "hidden", boxShadow: "0 1.5px 9px #E88E2E11", border: `1.2px solid ${orangeLight}`
        }}>
          <thead>
            <tr style={{ background: orangeLight }}>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>Bộ đàm</th>
              <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>Trạng thái sử dụng</th>
              {(userRole === 'admin' || userRole === 'ehs') && (
                <th style={{ padding: "12px 24px", fontSize: 17, color: dark, textAlign: "left" }}>Hành động</th>
              )}
            </tr>
          </thead>
          <tbody>
            {boDams.map((item, idx) => (
              <tr key={idx} style={{ background: idx % 2 ? "#fff6ea" : "#fff", opacity: status[idx]?.unavailable ? 0.5 : 1 }}>
                <td style={{ padding: "15px 22px", fontWeight: 600, color: dark }}>{item}</td>
                <td style={{ padding: "15px 22px" }}>
                  <input
                    type="checkbox"
                    checked={status[idx]?.checked || false}
                    disabled={status[idx]?.unavailable}
                    style={{
                      width: 22, height: 22, accentColor: orange, marginRight: 14,
                      cursor: status[idx]?.unavailable ? 'not-allowed' : 'pointer',
                      verticalAlign: 'middle'
                    }}
                    onChange={() => handleCheck(idx)}
                  />
                  {status[idx]?.unavailable ? (
                      <span style={{ color: red, fontWeight: 700 }}>Không khả dụng</span>
                  ) : status[idx]?.checked ? (
                    <span style={{ color: orange, fontWeight: 700 }}>
                      {status[idx].name} — Đang sử dụng
                    </span>
                  ) : (
                    <span style={{ color: "#b0b0b0", fontWeight: 600 }}>
                      Đã trả
                    </span>
                  )}
                </td>
                {(userRole === 'admin' || userRole === 'ehs') && (
                  <td style={{ padding: "15px 22px" }}>
                      <button 
                          onClick={() => handleToggleUnavailable(idx)}
                          style={{
                              background: status[idx]?.unavailable ? '#f0ad4e' : '#6c757d',
                              color: 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: 'pointer'
                          }}
                      >
                          {status[idx]?.unavailable ? 'Khả dụng' : 'Không khả dụng'}
                      </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 13, color: orange, marginTop: 15 }}>
        Tick để xác nhận ai đang nhận bộ đàm. Admin/EHS có thể đưa bộ đàm về trạng thái không khả dụng để sửa chữa.
      </div>
      <div style={{ fontSize: 14, color: red, marginTop: 10, fontWeight: 'bold' }}>
        Lưu ý: Trong trường hợp khẩn cấp phải chuyển bộ đàm về tần số 1.
      </div>
    </div>
  );
}

export default BoDam;