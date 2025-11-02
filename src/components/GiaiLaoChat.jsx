import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, storage } from "../firebase";
import { collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, doc, deleteDoc, where, getDocs, Timestamp, writeBatch, updateDoc } from "firebase/firestore";
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

function GiaiLaoChat({ user }) {
  const [chat, setChat] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewer, setViewer] = useState({ open:false, list:[], index:0 });
  const [visiblePosts, setVisiblePosts] = useState(2);
  const fileRef = useRef();
  const userRole = user?.role?.toLowerCase() || '';

  useEffect(() => {
    const q = query(collection(db, "gialaokv"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => setChat(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  // Dọn rác >7 ngày (không đổi)
  useEffect(() => {
    const cleanupOldData = async () => {
      const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oldDataQuery = query(collection(db, "gialaokv"), where("timestamp", "<", sevenDaysAgo));
      
      try {
        const snapshot = await getDocs(oldDataQuery);
        if (snapshot.empty) return;

        const deleteImagePromises = [];
        snapshot.forEach(docu => {
          const data = docu.data();
          if (data.images?.length) {
            data.images.forEach(url => {
              const imageRef = ref(storage, url);
              const promise = deleteObject(imageRef).catch(error => {
                if (error.code !== 'storage/object-not-found') {
                  console.error("Lỗi khi xóa ảnh cũ từ Storage:", error);
                }
              });
              deleteImagePromises.push(promise);
            });
          }
        });
        await Promise.all(deleteImagePromises);
        
        const batch = writeBatch(db);
        snapshot.forEach(docu => batch.delete(docu.ref));
        await batch.commit();
      } catch (error) {
        console.error("Lỗi khi dọn dẹp dữ liệu cũ:", error);
      }
    };
    
    cleanupOldData();
    const intervalId = setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const handleImageChange = async (e) => {
    if (!e.target.files?.length) { setFiles([]); setFileNames([]); return; }
    const arr = Array.from(e.target.files);
    const opt = { maxSizeMB: 3, maxWidthOrHeight: 1920, useWebWorker: true };
    try {
      const processed = await Promise.all(arr.map(f => f.size > opt.maxSizeMB * 1024 * 1024 ? imageCompression(f, opt) : f));
      setFiles(processed); setFileNames(processed.map(f => f.name));
    } catch (error) { console.error("Lỗi nén ảnh:", error); setFiles([]); setFileNames([]); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    setIsUploading(true);
    let uploaded = [];
    if (files.length) {
      try {
        uploaded = await Promise.all(files.map(async f => {
          const sr = ref(storage, "gialaokv_images/" + Date.now() + "_" + f.name);
          await uploadBytes(sr, f);
          return await getDownloadURL(sr);
        }));
      } catch (e) { console.error(e); alert("Tải ảnh thất bại!"); setIsUploading(false); return; }
    }
    await addDoc(collection(db, "gialaokv"), { 
      user: user.name, 
      userId: user.uid,
      text, 
      images: uploaded, 
      timestamp: serverTimestamp() 
    });
    setText(""); setFiles([]); setFileNames([]); if (fileRef.current) fileRef.current.value = ""; setIsUploading(false);
  };

  // Soft/Permanent delete (giữ nguyên)
  const handleSoftDelete = async (postId) => {
    if (window.confirm("Bạn có muốn yêu cầu xóa bài đăng này không? EHS/Admin sẽ xem xét.")) {
      const docRef = doc(db, "gialaokv", postId);
      await updateDoc(docRef, { pendingDeletion: true });
    }
  };
  const handleCancelDelete = async (postId) => {
    const docRef = doc(db, "gialaokv", postId);
    await updateDoc(docRef, { pendingDeletion: false });
  };
  const handlePermanentDelete = async (message) => {
    if (!window.confirm("Bạn có chắc muốn XÓA VĨNH VIỄN bài đăng này không?")) return;
    try {
      if (message.images?.length) {
        for (const url of message.images) {
          try {
            await deleteObject(ref(storage, url));
          } catch (error) {
            if (error.code !== 'storage/object-not-found') console.error("Lỗi xóa ảnh:", error);
          }
        }
      }
      await deleteDoc(doc(db, "gialaokv", message.id));
    } catch (err) { console.error("Lỗi khi xóa vĩnh viễn:", err); alert("Xóa bài đăng thất bại."); }
  };

  const filteredChat = useMemo(() => {
    if (userRole === 'admin' || userRole === 'ehs') return chat;
    return chat.filter(item => !item.pendingDeletion);
  }, [chat, userRole]);

  const clippedChat = filteredChat.slice(0, visiblePosts);
  const hasMore = visiblePosts < filteredChat.length;

  const openViewer = (list, index=0)=> setViewer({ open:true, list, index });
  const closeViewer = ()=> setViewer({ open:false, list:[], index:0 });
  const goPrev = ()=> setViewer(v => ({ ...v, index:(v.index-1+v.list.length)%v.list.length }));
  const goNext = ()=> setViewer(v => ({ ...v, index:(v.index+1)%v.list.length }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 16, color: orange, flexShrink: 0 }}>Giải lao & KV hút thuốc</h2>
      
      <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, marginBottom: 16 }}>
        <textarea 
          value={text} onChange={e => setText(e.target.value)} placeholder="Nhập nội dung..."
          rows={2} style={{ width: '100%', padding: "7px 12px", borderRadius: 6, boxSizing: 'border-box', border: `1.2px solid ${orangeLight}`, color: dark, background: "#fff" }}
        />
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <input id="imageUploadChat" type="file" accept="image/*" onChange={handleImageChange} ref={fileRef} multiple style={{ display: 'none' }} />
          <label htmlFor="imageUploadChat" style={{background: 'white', color: orange, border: `1.2px solid ${orangeLight}`, borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 600}}>
            Ảnh đính kèm
          </label>
          <span style={{fontStyle: 'italic', fontSize: 14, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {fileNames.length ? fileNames.join(', ') : "Chưa có ảnh"}
          </span>
          <button type="submit" disabled={isUploading} style={{ background: orange, color: "#fff", border: "none", padding: "8px 22px", borderRadius: 8, fontWeight: 700, fontSize: 15, boxShadow: "0 1px 8px #e88e2e22", cursor: "pointer", marginLeft: 'auto', opacity: isUploading ? 0.7 : 1 }}>
            {isUploading ? 'Đang gửi...' : 'Gửi'}
          </button>
        </div>
      </form>

      <div style={{ flexGrow: 1, background: "#fff6ea", borderRadius: 8, padding: 10, overflowY: 'auto', border: `1px solid ${orangeLight}` }}>
        {clippedChat.map((msg) => {
          const canInitiateDelete = userRole === 'admin' || userRole === 'ehs' || user.uid === msg.userId;
          return (
            <div key={msg.id} style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: msg.userId === user.uid ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '80%', borderRadius: 12, padding: '8px 12px', position: 'relative', border: `1px solid ${msg.pendingDeletion ? 'red' : '#f0e2cf'}`, background: msg.pendingDeletion ? '#fff0f0' : (msg.userId === user.uid ? orangeLight : 'white') }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: orange, fontSize: 14 }}>{msg.user} {msg.pendingDeletion && <span style={{color: 'red'}}>(Chờ xóa)</span>}</b>
                  
                  <div>
                    {msg.pendingDeletion && (userRole === 'admin' || userRole === 'ehs') ? (
                      <div style={{display: 'flex', gap: '8px'}}>
                        <button title="Xác nhận xóa" onClick={() => handlePermanentDelete(msg)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}><CheckIcon/></button>
                        <button title="Hủy yêu cầu xóa" onClick={() => handleCancelDelete(msg.id)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}><UndoIcon/></button>
                      </div>
                    ) : canInitiateDelete && !msg.pendingDeletion ? (
                      <button title="Yêu cầu xóa" onClick={()=> handleSoftDelete(msg.id)} style={{ background:'transparent', border:'none', padding:4, cursor:'pointer' }}>
                        <RedXIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
                {msg.text && <p style={{ margin: '4px 0', color: dark, whiteSpace: 'pre-wrap' }}>{msg.text}</p>}
                {!!msg.images?.length && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {msg.images.map((imgUrl, index) => (
                      <img key={index} src={imgUrl} alt={`ảnh ${index + 1}`} onClick={() => openViewer(msg.images, index)} style={{ maxWidth: 90, maxHeight: 65, borderRadius: 4, cursor: "pointer", border: '1px solid #eee' }} />
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#666", marginTop: 5, textAlign: 'right' }}>
                  {msg.timestamp && new Date(msg.timestamp.seconds * 1000).toLocaleString("vi-VN")}
                </div>
              </div>
            </div>
          );
        })}
        {clippedChat.length === 0 && chat.length === 0 && <div>Chưa có dữ liệu.</div>}
      </div>

      {hasMore && (
        <div className="row" style={{justifyContent:"center", display:'flex', marginTop:8}}>
          <button className="btn" onClick={()=>setVisiblePosts(v=>v+2)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#f0f0f0', cursor: 'pointer', fontWeight: 600 }}>Xem thêm</button>
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
export default GiaiLaoChat;
