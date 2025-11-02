import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, storage } from "../firebase";
import {
  collection, query, where, getDocs, onSnapshot, orderBy,
  addDoc, serverTimestamp, doc, deleteDoc, updateDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import imageCompression from 'browser-image-compression';
import { colors } from "../theme";
import LightboxSwipeOnly from "./LightboxSwipeOnly";

const orange = colors.primary;
const orangeLight = colors.primaryLight;
const dark = colors.textPrimary;

// ====================== CÁC BIỂU TƯỢNG MỚI ======================
function RedXIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="#F02828" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}
function CheckIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
function UndoIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 13v-2a4 4 0 0 0-4-4H8L12 3" />
        <path d="M3 13v2a4 4 0 0 0 4 4h9" />
        <path d="m5 11 4 4-4 4" />
    </svg>
  );
}
// ===============================================================

function HutThuocToilet({ user }) {
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [history, setHistory] = useState([]);
  const [viewer, setViewer] = useState({ open:false, list:[], index:0 });
  const [visiblePosts, setVisiblePosts] = useState(2);

  const fileRef = useRef();
  const [committeeUsers, setCommitteeUsers] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const userRole = user?.role?.toLowerCase() || '';

  useEffect(() => {
    const fetchCommitteeUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "ehs committee"));
        const querySnapshot = await getDocs(q);
        const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const uniqueUsers = usersData.filter((u, idx, self) => idx === self.findIndex((x) => x.name === u.name));
        setCommitteeUsers(uniqueUsers);
      } catch (error) { console.error("Lỗi khi lấy danh sách EHS Committee:", error); }
    };
    fetchCommitteeUsers();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "hutthuoc_history"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (querySnapshot) => {
      const logsData = querySnapshot.docs.map(docu => ({
        id: docu.id,
        ...docu.data(),
        time: docu.data().createdAt?.toDate().toLocaleString("vi-VN") || ""
      }));
      setHistory(logsData);
    });
    return unsub;
  }, []);
  
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  function handleSelectUser(name) {
    setSelected(arr => arr.includes(name) ? arr.filter(n => n !== name) : [...arr, name]);
  }

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const compressionOptions = { maxSizeMB: 3, maxWidthOrHeight: 1920, useWebWorker: true };
      try {
        const processedFiles = await Promise.all(selectedFiles.map(file => {
          if (file.size > compressionOptions.maxSizeMB * 1024 * 1024) return imageCompression(file, compressionOptions);
          return file;
        }));
        setFiles(processedFiles);
        setFileNames(processedFiles.map(f => f.name));
      } catch (error) {
        console.error("Lỗi khi nén ảnh:", error);
        alert("Đã xảy ra lỗi trong quá trình xử lý ảnh.");
        setFiles([]); setFileNames([]); if(fileRef.current) fileRef.current.value = "";
      }
    } else { setFiles([]); setFileNames([]); }
  };

  async function handleSave() {
    if (selected.length === 0) { alert("Vui lòng chọn người đi kiểm tra."); return; }
    let uploadedUrls = [];
    if (files.length > 0) {
      try {
        const uploadPromises = files.map(file => {
          const filename = Date.now() + "_" + file.name;
          const storageRef = ref(storage, "hutthuoc_images/" + filename);
          return uploadBytes(storageRef, file).then(() => getDownloadURL(storageRef));
        });
        uploadedUrls = await Promise.all(uploadPromises);
      } catch (error) { console.error("Lỗi tải ảnh:", error); alert("Tải ảnh thất bại!"); return; }
    }
    const newEntry = {
      users: selected,
      note,
      images: uploadedUrls,
      by: user.name,
      userId: user.uid,
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, "hutthuoc_history"), newEntry);
    setSelected([]); setNote(''); setFiles([]); setFileNames([]); if (fileRef.current) fileRef.current.value = "";
  }

  // Soft/Permanent delete (giữ nguyên)
  const handleSoftDelete = async (entryId) => {
    if (window.confirm("Bạn có muốn yêu cầu xóa mục này không? EHS/Admin sẽ xem xét.")) {
      const docRef = doc(db, "hutthuoc_history", entryId);
      await updateDoc(docRef, { pendingDeletion: true });
    }
  };
  const handleCancelDelete = async (entryId) => {
    const docRef = doc(db, "hutthuoc_history", entryId);
    await updateDoc(docRef, { pendingDeletion: false });
  };
  const handlePermanentDelete = async (entryToDelete) => {
    if (!window.confirm("Bạn có chắc muốn XÓA VĨNH VIỄN mục lịch sử này không?")) return;
    try {
      if (entryToDelete.images?.length) {
        for (const url of entryToDelete.images) {
          try {
            await deleteObject(ref(storage, url));
          } catch (error) {
            if (error.code !== 'storage/object-not-found') console.error("Lỗi xóa ảnh:", error);
          }
        }
      }
      await deleteDoc(doc(db, "hutthuoc_history", entryToDelete.id));
    } catch (error) { console.error("Lỗi khi xóa vĩnh viễn:", error); alert("Xóa thất bại."); }
  };

  const filteredHistory = useMemo(() => {
    if (userRole === 'admin' || userRole === 'ehs') return history;
    return history.filter(item => !item.pendingDeletion);
  }, [history, userRole]);

  const clippedHistory = filteredHistory.slice(0, visiblePosts);
  const hasMore = visiblePosts < filteredHistory.length;

  const openViewer = (list, index=0)=> setViewer({ open:true, list, index });
  const closeViewer = ()=> setViewer({ open:false, list:[], index:0 });
  const goPrev = ()=> setViewer(v => ({ ...v, index:(v.index-1+v.list.length)%v.list.length }));
  const goNext = ()=> setViewer(v => ({ ...v, index:(v.index+1)%v.list.length }));

  const selectedNames = selected.join(", ") || "Chọn người đi cùng";

  return (
    <div>
      <h2 style={{ fontWeight: 700, marginBottom: 22, color: orange }}>Lịch sử kiểm tra hút thuốc toilet</h2>
      <div>
        <div ref={dropdownRef} style={{ position: 'relative', minWidth: 220, marginBottom: 15 }}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: '100%', background: '#fff', padding: "7px 12px", borderRadius: 8,
              border: `1.2px solid ${orangeLight}`, textAlign: 'left', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 15, boxSizing: 'border-box'
            }}
          >
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selected.length ? dark : '#888' }}>
              {selectedNames}
            </span>
            <span>▼</span>
          </button>
          {isDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
              border: `1.2px solid ${orangeLight}`, borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200,
              overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {committeeUsers.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(u.name)}
                    onChange={() => handleSelectUser(u.name)}
                    style={{ marginRight: 10, width: 16, height: 16, accentColor: orange }}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 15, color: dark, marginBottom: 4 }}>Ghi chú:</div>
        <div style={{ display: 'flex', gap: 10, alignItems: "center", flexWrap: 'wrap' }}>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Thêm ghi chú nếu cần..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.2px solid ${orangeLight}`, color: dark, background: "#fff", minWidth: 200 }}
          />
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <input type="file" accept="image/jpeg, image/png, image/jpg" ref={fileRef} id="imageUploadHutThuoc" multiple onChange={handleImageChange} style={{ display: 'none' }} />
            <label htmlFor="imageUploadHutThuoc" style={{ background: 'white', color: orange, border: `1.2px solid ${orangeLight}`, borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>Ảnh đính kèm</label>
            <span style={{fontStyle: 'italic', fontSize: 14, color: '#555'}}>
              {fileNames.length ? `${fileNames.length} ảnh` : "Chưa có ảnh"}
            </span>
          </div>
          <button onClick={handleSave} style={{ background: orange, color: "#fff", border: "none", padding: "10px 22px", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", marginLeft: 'auto' }}>
            Lưu
          </button>
        </div>
      </div>

      <div style={{ fontWeight: 700, color: orange, marginBottom: 8, marginTop: 25 }}>Lịch sử kiểm tra:</div>
      
      {clippedHistory.map((l) => {
        const canInitiateDelete = userRole === 'admin' || userRole === 'ehs' || user.uid === l.userId;
        return (
          <div key={l.id} className="card" style={{ marginBottom: 8, padding: 10, border: `1px solid ${l.pendingDeletion ? '#f00' : orangeLight}`, borderRadius: 10, background: l.pendingDeletion ? '#fff0f0' : "#fff6ea", opacity: l.pendingDeletion && userRole !== 'admin' && userRole !== 'ehs' ? 0.5 : 1 }}>
            <div className="row between" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div className="bold">{l.by} — {l.time} {l.pendingDeletion && <span style={{color: 'red', fontWeight:'bold'}}>(Chờ xóa)</span>}</div>
              <div>
                {l.pendingDeletion && (userRole === 'admin' || userRole === 'ehs') ? (
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button title="Xác nhận xóa" onClick={() => handlePermanentDelete(l)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}><CheckIcon/></button>
                    <button title="Hủy yêu cầu xóa" onClick={() => handleCancelDelete(l.id)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}><UndoIcon/></button>
                  </div>
                ) : canInitiateDelete && !l.pendingDeletion ? (
                  <button title="Yêu cầu xóa" onClick={()=> handleSoftDelete(l.id)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}>
                    <RedXIcon />
                  </button>
                ) : null}
              </div>
            </div>
            {!!l.users?.length && <div style={{marginTop: 6}}>Đi cùng: {l.users.join(", ")}</div>}
            {l.note && <div style={{marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>{l.note}</div>}
            {!!l.images?.length && (
              <div style={{ display: 'flex', gap: 6, flexWrap:'wrap', marginTop: 6 }}>
                {l.images.map((u, idx) => (
                  <img key={idx} src={u} alt={`ảnh ${idx+1}`} onClick={()=> openViewer(l.images, idx)} style={{ width: 88, height: 88, objectFit:'cover', borderRadius:6, border:'1px solid #eee', cursor:'pointer' }}/>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {clippedHistory.length === 0 && history.length === 0 && <div>Chưa có dữ liệu.</div>}
      
      {hasMore && (
        <div style={{justifyContent:"center", display:'flex', marginTop:8}}>
          <button
            onClick={()=>setVisiblePosts(v=>v+2)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #ccc',   // <-- ĐÃ SỬA Ở ĐÂY
              background: '#f0f0f0',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Xem thêm
          </button>
        </div>
      )}

      {/* LIGHTBOX dùng chung */}
      <LightboxSwipeOnly
        open={viewer.open}
        list={viewer.list}
        index={viewer.index}
        onClose={closeViewer}
        onPrev={goPrev}
        onNext={goNext}
      />
    </div>
  );
}

export default HutThuocToilet;
