import React, { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast, useConfirm } from "./LightboxSwipeOnly";
import { colors } from "../theme";
import { 
  IoDocumentsOutline, 
  IoCloudUploadOutline, 
  IoTrashOutline, 
  IoDownloadOutline, 
  IoSearchOutline, 
  IoCloseOutline, 
  IoEyeOutline, 
  IoFileTrayOutline
} from "react-icons/io5";

// Helper normalization functions for roles
const stripDiacritics = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeRole = (r) => stripDiacritics(String(r || "").trim()).toLowerCase();

export default function DocumentManager({ user, isMobile }) {
  const { pushToast } = useToast();
  const { askConfirm } = useConfirm();

  // Active sub-tab state: 'msds' | 'sop' | 'quytrinh' | 'bieumau'
  const [activeSubTab, setActiveSubTab] = useState("msds");
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // PDF Viewer modal state
  const [viewingDoc, setViewingDoc] = useState(null);

  // Roles verification
  const userRole = normalizeRole(user?.role || "");
  const isAdmin = userRole === "admin";
  const canView = ["admin", "ehs", "ehs committee", "trainer", "manager"].includes(userRole);
  const canViewMSDS = ["admin", "ehs", "manager"].includes(userRole);

  // Fetch documents real-time
  useEffect(() => {
    if (!canView) return;

    // Do not attempt to query MSDS if user does not have permission
    if (activeSubTab === "msds" && !canViewMSDS) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Query with type filter matching Firestore rules constraint
    const q = query(collection(db, "documents"), where("type", "==", activeSubTab));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docsList = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setDocuments(docsList);
        setLoading(false);
      },
      (error) => {
        console.error("Lỗi khi tải tài liệu:", error);
        pushToast("Không thể tải danh sách tài liệu", "error");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [canView, activeSubTab, canViewMSDS]);

  // Filter documents in memory
  const currentDocs = documents
    .filter((doc) => doc.type === activeSubTab)
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA; // Descending order
    })
    .filter((doc) => {
      const matchQuery = searchQuery.trim().toLowerCase();
      if (!matchQuery) return true;
      return (
        doc.title?.toLowerCase().includes(matchQuery) ||
        doc.fileName?.toLowerCase().includes(matchQuery)
      );
    });

  // Handle file select
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      pushToast("Chỉ hỗ trợ tải lên file PDF!", "warning");
      setSelectedFile(null);
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    if (!uploadTitle) {
      // Set default title from file name (removing the .pdf extension)
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setUploadTitle(nameWithoutExt);
    }
  };

  // Handle document upload
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      pushToast("Bạn không có quyền thực hiện chức năng này!", "error");
      return;
    }

    if (!selectedFile) {
      pushToast("Vui lòng chọn file PDF để tải lên", "warning");
      return;
    }

    if (!uploadTitle.trim()) {
      pushToast("Vui lòng nhập tên tài liệu", "warning");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const cleanFileName = `${Date.now()}_${selectedFile.name.replace(/\s+/g, "_")}`;
      const storagePath = `documents/${activeSubTab}/${cleanFileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload bytes with explicit metadata content-type to allow inline PDF viewing
      const metadata = { contentType: "application/pdf" };
      
      setUploadProgress(30);
      await uploadBytes(storageRef, selectedFile, metadata);
      
      setUploadProgress(70);
      const fileUrl = await getDownloadURL(storageRef);

      setUploadProgress(90);
      // Save metadata to Firestore
      await addDoc(collection(db, "documents"), {
        title: uploadTitle.trim(),
        fileName: selectedFile.name,
        fileUrl: fileUrl,
        storagePath: storagePath,
        type: activeSubTab,
        createdAt: serverTimestamp(),
        uploadedBy: user?.name || user?.email || "Admin",
      });

      pushToast("Tải lên tài liệu thành công!", "success");
      
      // Reset form
      setUploadTitle("");
      setSelectedFile(null);
      setShowUploadForm(false);
      
      // Reset input element
      const fileInput = document.getElementById("pdf-file-input");
      if (fileInput) fileInput.value = "";

    } catch (error) {
      console.error("Lỗi khi tải tài liệu lên:", error);
      pushToast("Tải tài liệu lên thất bại: " + error.message, "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle document delete
  const handleDelete = async (docData) => {
    if (!isAdmin) {
      pushToast("Bạn không có quyền xóa tài liệu!", "error");
      return;
    }

    const confirm = await askConfirm(
      `Bạn có chắc chắn muốn xóa tài liệu "${docData.title}" không?`,
      "Xác nhận xóa tài liệu"
    );

    if (!confirm) return;

    try {
      // 1. Delete file from Storage first
      if (docData.storagePath) {
        const fileRef = ref(storage, docData.storagePath);
        try {
          await deleteObject(fileRef);
        } catch (storageError) {
          // If file is not found in storage, log and proceed to delete firestore document
          if (storageError.code !== "storage/object-not-found") {
            console.error("Lỗi khi xóa file trong storage:", storageError);
          }
        }
      } else if (docData.fileUrl) {
        // Fallback if storagePath is missing but fileUrl is present
        const fileRef = ref(storage, docData.fileUrl);
        try {
          await deleteObject(fileRef);
        } catch (storageError) {
          if (storageError.code !== "storage/object-not-found") {
            console.warn("Lỗi khi xóa file storage qua url:", storageError);
          }
        }
      }

      // 2. Delete document from Firestore
      await deleteDoc(doc(db, "documents", docData.id));
      pushToast("Đã xóa tài liệu thành công!", "success");
    } catch (error) {
      console.error("Lỗi khi xóa tài liệu:", error);
      pushToast("Xóa tài liệu thất bại", "error");
    }
  };

  // Format timestamp to user friendly string
  const formatTime = (ts) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: colors.error, fontWeight: "bold" }}>
        Bạn không có quyền truy cập tab Tài liệu.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", fontFamily: "inherit" }}>
      {/* Component Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 8px 0", color: colors.primary, display: "flex", alignItems: "center", gap: 10, fontSize: isMobile ? 22 : 28 }}>
          <IoDocumentsOutline /> Hệ thống Tài liệu EHS
        </h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: isMobile ? 14 : 16 }}>
          Tra cứu, xem trực tuyến và tải về các tài liệu MSDS, SOP, Quy trình, và Biểu mẫu an toàn.
        </p>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ 
        display: "flex", 
        borderBottom: `2px solid ${colors.border}`, 
        marginBottom: 24, 
        overflowX: "auto",
        whiteSpace: "nowrap",
        gap: 6,
        paddingBottom: 2
      }} className="no-scrollbar">
        {[
          { key: "msds", label: "MSDS" },
          { key: "sop", label: "SOP" },
          { key: "quytrinh", label: "Quy trình" },
          { key: "bieumau", label: "Biểu mẫu" }
        ].map((tab) => {
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveSubTab(tab.key);
                setSearchQuery("");
                setShowUploadForm(false);
              }}
              style={{
                padding: isMobile ? "10px 16px" : "12px 24px",
                background: isActive ? colors.primary : "transparent",
                color: isActive ? colors.white : colors.textSecondary,
                border: "none",
                borderRadius: "8px 8px 0 0",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
                outline: "none"
              }}
              onMouseOver={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = colors.backgroundLight;
                  e.currentTarget.style.color = colors.primary;
                }
              }}
              onMouseOut={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = colors.textSecondary;
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar Section */}
      <div style={{ 
        display: "flex", 
        flexDirection: isMobile ? "column" : "row", 
        gap: 16, 
        marginBottom: 24,
        alignItems: "stretch"
      }}>
        {/* Search Input */}
        <div style={{ 
          position: "relative", 
          flexGrow: 1,
          display: "flex",
          alignItems: "center"
        }}>
          <IoSearchOutline style={{ 
            position: "absolute", 
            left: 14, 
            color: colors.textSecondary, 
            fontSize: 18 
          }} />
          <input
            type="text"
            placeholder={`Tìm kiếm trong danh mục ${activeSubTab.toUpperCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px 12px 42px",
              borderRadius: 10,
              border: `1.5px solid ${colors.border}`,
              fontSize: 15,
              color: colors.textPrimary,
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
              background: colors.white
            }}
            onFocus={(e) => e.target.style.borderColor = colors.primary}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: colors.textSecondary,
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                padding: 0
              }}
            >
              <IoCloseOutline />
            </button>
          )}
        </div>

        {/* Upload Trigger Button (Admin only) */}
        {isAdmin && (
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            style={{
              background: showUploadForm ? colors.error : colors.primary,
              color: colors.white,
              border: "none",
              borderRadius: 10,
              padding: "0 22px",
              height: isMobile ? 48 : "auto",
              fontWeight: "bold",
              fontSize: 15,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 4px 12px ${showUploadForm ? colors.error : colors.primary}33`,
              transition: "all 0.2s ease"
            }}
          >
            {showUploadForm ? (
              <>
                <IoCloseOutline fontSize={18} /> Đóng form
              </>
            ) : (
              <>
                <IoCloudUploadOutline fontSize={18} /> Thêm tài liệu
              </>
            )}
          </button>
        )}
      </div>

      {/* Upload Form Panel (Collapsible, Admin only) */}
      {isAdmin && showUploadForm && (
        <div style={{
          background: colors.backgroundLight,
          borderRadius: 14,
          padding: 20,
          marginBottom: 24,
          border: `1px solid ${colors.border}`,
          animation: "fadeIn 0.3s ease"
        }}>
          <h3 style={{ margin: "0 0 16px 0", color: colors.primaryDark, fontSize: 16, fontWeight: 700 }}>
            Tải lên tài liệu mới vào danh mục: <span style={{ textTransform: "uppercase", color: colors.primary }}>{activeSubTab}</span>
          </h3>
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16 }}>
              {/* Title input */}
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                  Tên tài liệu <span style={{ color: colors.error }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nhập tiêu đề hoặc tên hiển thị của tài liệu..."
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  disabled={uploading}
                  required
                  style={{
                    width: "100%",
                    padding: 11,
                    borderRadius: 8,
                    border: `1.5px solid ${colors.border}`,
                    fontSize: 14,
                    boxSizing: "border-box",
                    background: colors.white,
                    outline: "none"
                  }}
                />
              </div>

              {/* File picker */}
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                  Chọn file PDF <span style={{ color: colors.error }}>*</span>
                </label>
                <input
                  id="pdf-file-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  disabled={uploading}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 11px",
                    borderRadius: 8,
                    border: `1.5px solid ${colors.border}`,
                    fontSize: 14,
                    boxSizing: "border-box",
                    background: colors.white,
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Selected File Details */}
            {selectedFile && (
              <div style={{ fontSize: 13, color: colors.textSecondary }}>
                File đã chọn: <strong>{selectedFile.name}</strong> ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </div>
            )}

            {/* Progress Bar */}
            {uploading && (
              <div style={{ width: "100%", background: "#e0e0e0", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ 
                  width: `${uploadProgress}%`, 
                  background: colors.primary, 
                  height: "100%", 
                  transition: "width 0.2s ease" 
                }} />
              </div>
            )}

            {/* Submit buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowUploadForm(false);
                  setUploadTitle("");
                  setSelectedFile(null);
                }}
                disabled={uploading}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: colors.white,
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={uploading}
                style={{
                  padding: "9px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: colors.primary,
                  color: colors.white,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: uploading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                {uploading ? "Đang tải lên..." : "Bắt đầu tải lên"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content Area: Document List */}
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: colors.textSecondary }}>
          <div className="spinner" style={{ marginBottom: 12 }}></div>
          Đang tải dữ liệu tài liệu...
        </div>
      ) : (activeSubTab === "msds" && !canViewMSDS) ? (
        <div style={{
          padding: 60,
          textAlign: "center",
          border: `2px dashed ${colors.error}44`,
          borderRadius: 16,
          background: "#fff5f5",
          color: colors.error,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12
        }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <div>
            <h3 style={{ margin: "0 0 4px 0", color: "#c92a2a", fontSize: 16, fontWeight: 700 }}>Quyền truy cập bị giới hạn</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#e03131" }}>
              Chỉ người dùng có vai trò <strong>Admin, EHS</strong> hoặc <strong>Manager</strong> mới được phép xem tài liệu MSDS.
            </p>
          </div>
        </div>
      ) : currentDocs.length === 0 ? (
        <div style={{
          padding: 60,
          textAlign: "center",
          border: `2px dashed ${colors.border}`,
          borderRadius: 16,
          background: colors.background,
          color: colors.textSecondary,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12
        }}>
          <IoFileTrayOutline size={48} style={{ color: colors.primaryLight }} />
          <div>
            <h3 style={{ margin: "0 0 4px 0", color: colors.textPrimary, fontSize: 16, fontWeight: 700 }}>Không tìm thấy tài liệu nào</h3>
            <p style={{ margin: 0, fontSize: 14 }}>
              {searchQuery ? "Không có kết quả nào khớp với từ khóa tìm kiếm." : `Chưa có tài liệu nào trong danh mục ${activeSubTab.toUpperCase()}.`}
            </p>
          </div>
          {isAdmin && !searchQuery && (
            <button
              onClick={() => setShowUploadForm(true)}
              style={{
                marginTop: 8,
                padding: "8px 16px",
                borderRadius: 8,
                background: colors.primary,
                color: colors.white,
                border: "none",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Tải lên tài liệu đầu tiên
            </button>
          )}
        </div>
      ) : (
        /* Document Cards Grid */
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16
        }}>
          {currentDocs.map((docItem) => (
            <div
              key={docItem.id}
              style={{
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 14,
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                transition: "all 0.2s ease-in-out",
                cursor: "default"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(70,110,115,0.08)";
                e.currentTarget.style.borderColor = colors.primaryLight;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.02)";
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Card Header & Metadata */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* PDF Icon Badge */}
                <div style={{
                  background: "linear-gradient(135deg, #FF6B6B 0%, #E63946 100%)",
                  borderRadius: 10,
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: colors.white,
                  fontWeight: 900,
                  fontSize: 13,
                  boxShadow: "0 4px 10px rgba(230,57,70,0.25)"
                }}>
                  PDF
                </div>
                
                {/* Text Metadata */}
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ 
                    margin: "0 0 6px 0", 
                    color: colors.textPrimary, 
                    fontSize: 16, 
                    fontWeight: 700,
                    lineHeight: 1.3,
                    wordBreak: "break-word"
                  }}>
                    {docItem.title}
                  </h4>
                  <div style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3
                  }}>
                    <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "block" }}>
                      File: {docItem.fileName}
                    </span>
                    <span>
                      Đăng bởi: <strong>{docItem.uploadedBy}</strong>
                    </span>
                    <span>
                      Ngày đăng: {formatTime(docItem.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "flex-end", 
                gap: 8,
                borderTop: `1px solid ${colors.backgroundLight}`,
                paddingTop: 12
              }}>
                {/* Delete button (Admin only) */}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(docItem)}
                    title="Xóa tài liệu"
                    style={{
                      background: "none",
                      border: `1.5px solid ${colors.error}44`,
                      borderRadius: 8,
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: colors.error,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = colors.error;
                      e.currentTarget.style.color = colors.white;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.color = colors.error;
                    }}
                  >
                    <IoTrashOutline fontSize={16} />
                  </button>
                )}

                {/* Download button */}
                <a
                  href={docItem.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={docItem.fileName}
                  title="Tải về file PDF"
                  style={{
                    background: "none",
                    border: `1.5px solid ${colors.primary}44`,
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: colors.primary,
                    cursor: "pointer",
                    textDecoration: "none",
                    boxSizing: "border-box",
                    transition: "all 0.2s ease"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = colors.backgroundLight;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <IoDownloadOutline fontSize={16} />
                </a>

                {/* View button */}
                <button
                  onClick={() => setViewingDoc(docItem)}
                  style={{
                    background: colors.primary,
                    color: colors.white,
                    border: "none",
                    borderRadius: 8,
                    padding: "0 14px",
                    height: 36,
                    fontWeight: "bold",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "background 0.2s"
                  }}
                  onMouseOver={(e) => e.target.style.background = colors.primaryDark}
                  onMouseOut={(e) => e.target.style.background = colors.primary}
                >
                  <IoEyeOutline fontSize={14} /> Xem trực tiếp
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF View Modal Overlay */}
      {viewingDoc && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: isMobile ? 0 : 24,
          boxSizing: "border-box"
        }}>
          <div style={{
            background: colors.white,
            width: "100%",
            height: "100%",
            maxWidth: 1000,
            maxHeight: 800,
            borderRadius: isMobile ? 0 : 16,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.3)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: colors.background
            }}>
              <div style={{ minWidth: 0, marginRight: 16 }}>
                <h3 style={{ 
                  margin: 0, 
                  color: colors.primaryDark, 
                  fontSize: 16, 
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                  {viewingDoc.title}
                </h3>
                <span style={{ fontSize: 12, color: colors.textSecondary, display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  File: {viewingDoc.fileName}
                </span>
              </div>

              {/* Control Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {/* Open in new tab fallback */}
                <button
                  onClick={() => window.open(viewingDoc.fileUrl, "_blank")}
                  style={{
                    background: "transparent",
                    border: `1.5px solid ${colors.primary}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    color: colors.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = colors.primary;
                    e.currentTarget.style.color = colors.white;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = colors.primary;
                  }}
                >
                  Mở tab mới
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setViewingDoc(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: colors.textPrimary,
                    fontSize: 24,
                    display: "flex",
                    alignItems: "center",
                    padding: 4
                  }}
                >
                  <IoCloseOutline />
                </button>
              </div>
            </div>

            {/* Modal Body: PDF Iframe */}
            <div style={{ flexGrow: 1, background: "#525659", position: "relative" }}>
              <iframe
                src={`${viewingDoc.fileUrl}#toolbar=1`}
                title={viewingDoc.title}
                width="100%"
                height="100%"
                style={{ border: "none" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
