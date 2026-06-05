import React, { useState, useEffect, useRef } from "react";
import { 
  IoCloseOutline, 
  IoChevronBackOutline, 
  IoChevronForwardOutline, 
  IoDownloadOutline,
  IoRefreshOutline,
  IoAddOutline,
  IoRemoveOutline
} from "react-icons/io5";

// Cấu hình CDN cho PDF.js
const PDFJS_DIST = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
const PDFJS_SRC = `${PDFJS_DIST}/pdf.min.js`;
const PDFJS_WORKER_SRC = `${PDFJS_DIST}/pdf.worker.min.js`;

export default function BookViewer3D({ fileUrl, fileUrlEn, title, onClose, isMobile }) {
  const [lang, setLang] = useState(fileUrl ? "vi" : "en");
  const [activeUrl, setActiveUrl] = useState(lang === "vi" ? fileUrl : fileUrlEn);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setActiveUrl(lang === "vi" ? (fileUrl || fileUrlEn) : (fileUrlEn || fileUrl));
  }, [lang, fileUrl, fileUrlEn]);

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentSheet, setCurrentSheet] = useState(0);
  const [scale, setScale] = useState(1);
  
  const containerRef = useRef(null);
  const bookRef = useRef(null);

  // Kích thước chuẩn cho mỗi trang (tỷ lệ A4 xấp xỉ 1:1.41)
  const pageWidth = isMobile ? 280 : 360;
  const pageHeight = isMobile ? 396 : 508;
  const bookWidth = pageWidth * 2;

  // 1. Tải và xử lý PDF bằng PDF.js
  useEffect(() => {
    let active = true;
    
    const loadAndRenderPDF = async () => {
      try {
        setLoading(true);
        setLoadingProgress(5);
        setError(null);
        setPages([]);
        setCurrentSheet(0);

        // Đảm bảo PDF.js được tải động từ CDN
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = PDFJS_SRC;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Không thể tải thư viện PDF.js. Vui lòng kiểm tra kết nối mạng."));
            document.body.appendChild(script);
          });
        }

        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        
        if (!active) return;
        setLoadingProgress(15);

        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          withCredentials: false
        });

        const pdfDoc = await loadingTask.promise;
        if (!active) return;
        setLoadingProgress(30);

        const numPages = pdfDoc.numPages;
        const tempPages = [];

        for (let i = 1; i <= numPages; i++) {
          if (!active) return;
          const page = await pdfDoc.getPage(i);
          
          // Sử dụng scale phù hợp để hình ảnh rõ nét mà không quá nặng
          const viewport = page.getViewport({ scale: isMobile ? 1.2 : 1.6 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          if (!active) return;
          
          // Nén dạng JPEG 0.85 để tiết kiệm bộ nhớ RAM/GPU
          const imgData = canvas.toDataURL("image/jpeg", 0.85);
          tempPages.push(imgData);
          setLoadingProgress(Math.round(30 + (i / numPages) * 70));
        }

        // Bổ sung trang trống để số lượng trang là số chẵn (để lật trang 2 bên chuẩn xác)
        if (tempPages.length % 2 !== 0) {
          tempPages.push(""); // Trang trống ở cuối
        }

        if (active) {
          setPages(tempPages);
          setLoading(false);
        }
      } catch (err) {
        console.error("Lỗi khi xử lý file PDF:", err);
        if (active) {
          setError(err.message || "Đã xảy ra lỗi khi kết xuất PDF.");
          setLoading(false);
        }
      }
    };

    loadAndRenderPDF();

    return () => {
      active = false;
    };
  }, [activeUrl, isMobile]);

  // 2. Tính toán tỉ lệ co giãn (Responsive Scale)
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Chừa lề xung quanh cuốn sách
      const marginX = isMobile ? 16 : 48;
      const marginY = isMobile ? 120 : 160;
      
      const scaleX = (containerWidth - marginX) / bookWidth;
      const scaleY = (containerHeight - marginY) / pageHeight;
      
      // Chọn tỉ lệ nhỏ hơn để vừa vặn cả chiều ngang lẫn dọc (không giới hạn tối đa = 1 để tự co giãn to)
      const finalScale = Math.min(scaleX, scaleY);
      setScale(finalScale);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pages, bookWidth, pageHeight, isMobile]);

  // Lăn con lăn chuột để phóng to/thu nhỏ
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      if (loading || error || pages.length === 0) return;
      e.preventDefault();
      const zoomStep = 0.08;
      if (e.deltaY < 0) {
        setZoom(prev => Math.min(prev + zoomStep, 3.0));
      } else {
        setZoom(prev => Math.max(prev - zoomStep, 0.4));
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [pages, loading, error]);

  // Điều hướng lật trang
  const totalSheets = pages.length / 2;

  const nextSheet = () => {
    if (currentSheet < totalSheets) {
      setCurrentSheet(prev => prev + 1);
    }
  };

  const prevSheet = () => {
    if (currentSheet > 0) {
      setCurrentSheet(prev => prev - 1);
    }
  };

  // Lật trực tiếp khi click vào góc trang
  const handlePageClick = (sheetIndex, side) => {
    if (side === "right" && sheetIndex === currentSheet) {
      nextSheet();
    } else if (side === "left" && sheetIndex === currentSheet - 1) {
      prevSheet();
    }
  };

  // Lắng nghe phím mũi tên Trái/Phải để lật trang
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight") nextSheet();
      else if (e.key === "ArrowLeft") prevSheet();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSheet, totalSheets]);

  // Xây dựng các tờ giấy của sách (Mỗi tờ gồm 1 trang trước và 1 trang sau)
  const sheets = [];
  for (let i = 0; i < totalSheets; i++) {
    sheets.push({
      index: i,
      frontImg: pages[i * 2],
      backImg: pages[i * 2 + 1]
    });
  }

  // Định nghĩa màu chủ đạo lấy từ theme hệ thống
  const primaryColor = "#466e73";
  const primaryLight = "#f0e2cf";

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
      display: "flex",
      flexDirection: "column",
      zIndex: 99999,
      fontFamily: "inherit",
      boxSizing: "border-box"
    }}>
      {/* 1. Header điều khiển */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        background: "rgba(17, 24, 39, 0.8)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        zIndex: 10
      }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: 16 }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📖 {title}
          </h3>
          <span style={{ fontSize: 12, color: "#9ca3af", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", marginTop: 2 }}>
            Chế độ đọc sách 3D
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Bộ chọn ngôn ngữ */}
          {(fileUrl && fileUrlEn) && (
            <div style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: 8,
              padding: 2,
              marginRight: 8
            }}>
              <button
                onClick={() => setLang("vi")}
                style={{
                  background: lang === "vi" ? primaryColor : "transparent",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                🇻🇳 Tiếng Việt
              </button>
              <button
                onClick={() => setLang("en")}
                style={{
                  background: lang === "en" ? primaryColor : "transparent",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                🇬🇧 English
              </button>
            </div>
          )}

          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            style={{
              background: "transparent",
              border: "1.5px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 8,
              padding: "7px 14px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none"
            }}
          >
            <IoDownloadOutline fontSize={16} /> Tải xuống
          </a>

          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
            onMouseOut={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
          >
            <IoCloseOutline fontSize={24} />
          </button>
        </div>
      </div>

      {/* 2. Vùng hiển thị chính */}
      <div 
        ref={containerRef}
        style={{
          flexGrow: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          overflow: "auto", // Cho phép hiện thanh cuộn khi zoom to
          padding: "20px"
        }}
      >
        {loading && (
          <div style={{
            textAlign: "center",
            color: "#fff",
            zIndex: 20,
            background: "rgba(17, 24, 39, 0.85)",
            padding: "32px 48px",
            borderRadius: 16,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16
          }}>
            <IoRefreshOutline className="spin" style={{ fontSize: 44, color: primaryLight, animation: "spin 2s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600 }}>Đang chuẩn bị tài liệu...</div>
            <div style={{ width: 200, background: "rgba(255,255,255,0.1)", borderRadius: 10, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${loadingProgress}%`, background: primaryLight, height: "100%", transition: "width 0.1s ease" }} />
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{loadingProgress}% hoàn thành</div>
          </div>
        )}

        {error && (
          <div style={{
            textAlign: "center",
            color: "#fff",
            zIndex: 20,
            background: "rgba(17, 24, 39, 0.9)",
            padding: "32px 48px",
            borderRadius: 16,
            maxWidth: 450,
            border: "1px solid rgba(239, 68, 68, 0.2)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16
          }}>
            <div style={{ fontSize: 48 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>Không thể kết xuất 3D</div>
            <p style={{ margin: 0, fontSize: 14, color: "#d1d5db", lineHeight: 1.5 }}>{error}</p>
            <button
              onClick={() => window.open(fileUrl, "_blank")}
              style={{
                marginTop: 8,
                background: primaryColor,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              Mở trực tiếp tệp PDF
            </button>
          </div>
        )}

        {/* Cấu trúc sách 3D */}
        {!loading && !error && pages.length > 0 && (
          <div style={{
            width: bookWidth * scale * zoom,
            height: pageHeight * scale * zoom,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexShrink: 0,
            transition: "width 0.15s ease, height 0.15s ease"
          }}>
            <div style={{
              transform: `scale(${scale * zoom})`,
              transformOrigin: "center center",
              width: bookWidth,
              height: pageHeight,
              transition: "transform 0.15s ease",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0
            }}>
            {/* Vỏ bìa sách cứng 3D (Book Cover Backdrop) */}
            <div style={{
              position: "absolute",
              width: bookWidth + (isMobile ? 12 : 24),
              height: pageHeight + (isMobile ? 12 : 24),
              background: "#1e293b",
              borderRadius: isMobile ? 8 : 16,
              boxShadow: "0 30px 70px rgba(0,0,0,0.8), inset 0 0 40px rgba(0,0,0,0.6)",
              display: "flex",
              zIndex: 1,
              border: "1px solid rgba(255,255,255,0.05)"
            }}>
              {/* Đường chỉ may dọc bên trái trang bìa */}
              <div style={{ flex: 1, borderRight: "4px solid rgba(0,0,0,0.45)" }} />
              <div style={{ flex: 1, borderLeft: "4px solid rgba(0,0,0,0.45)" }} />
            </div>

            {/* Khung chứa các tờ giấy lật 3D */}
            <div 
              ref={bookRef}
              style={{
                position: "relative",
                width: pageWidth,
                height: pageHeight,
                // Đẩy sang phải để trục xoay (trái của trang bìa) trùng với gáy sách ở giữa
                left: pageWidth / 2, 
                perspective: "1600px",
                transformStyle: "preserve-3d",
                zIndex: 2
              }}
            >
              {sheets.map((sheet, idx) => {
                const isFlipped = idx < currentSheet;
                // Áp dụng góc quay 3D
                const rotateAngle = isFlipped ? -180 : 0;
                
                // Thuật toán z-index xếp chồng trang chuẩn xác
                const zIndex = isFlipped ? idx : (totalSheets - idx);

                // Độ trễ bóng đổ trang giấy khi lật
                const shadowOpacity = isFlipped ? 0 : 0.15;

                return (
                  <div
                    key={sheet.index}
                    style={{
                      position: "absolute",
                      width: pageWidth,
                      height: pageHeight,
                      top: 0,
                      left: 0,
                      transformOrigin: "left center",
                      transformStyle: "preserve-3d",
                      transform: `rotateY(${rotateAngle}deg)`,
                      transition: "transform 0.85s cubic-bezier(0.645, 0.045, 0.355, 1)",
                      zIndex: zIndex,
                      cursor: "pointer"
                    }}
                  >
                    {/* TRANG TRƯỚC (Front Page) - Hiển thị khi nằm bên phải */}
                    <div 
                      onClick={() => handlePageClick(idx, "right")}
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        background: "linear-gradient(to right, #e2e8f0 0%, #ffffff 8%, #ffffff 100%)",
                        boxSizing: "border-box",
                        borderRadius: "0 6px 6px 0",
                        boxShadow: `inset 3px 0 10px rgba(0,0,0,0.1), ${isFlipped ? "none" : "5px 5px 15px rgba(0,0,0,0.2)"}`,
                        overflow: "hidden",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                    >
                      {sheet.frontImg ? (
                        <img 
                          src={sheet.frontImg} 
                          alt={`Page ${idx * 2 + 1}`} 
                          style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }} 
                        />
                      ) : (
                        <div style={{ color: "#9ca3af", fontSize: 14 }}>[Trang trống]</div>
                      )}
                      
                      {/* Vùng bóng đổ khi lật trang */}
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        background: `linear-gradient(to right, rgba(0,0,0,${shadowOpacity}) 0%, rgba(0,0,0,0) 10%)`,
                        pointerEvents: "none"
                      }} />
                    </div>

                    {/* TRANG SAU (Back Page) - Hiển thị khi lật sang bên trái */}
                    <div 
                      onClick={() => handlePageClick(idx, "left")}
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        background: "linear-gradient(to left, #e2e8f0 0%, #ffffff 8%, #ffffff 100%)",
                        boxSizing: "border-box",
                        borderRadius: "6px 0 0 6px",
                        boxShadow: `inset -3px 0 10px rgba(0,0,0,0.1), ${isFlipped ? "-5px 5px 15px rgba(0,0,0,0.2)" : "none"}`,
                        overflow: "hidden",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                    >
                      {sheet.backImg ? (
                        <img 
                          src={sheet.backImg} 
                          alt={`Page ${idx * 2 + 2}`} 
                          style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }} 
                        />
                      ) : (
                        <div style={{ color: "#9ca3af", fontSize: 14 }}>[Trang kết thúc]</div>
                      )}
                      
                      {/* Vùng bóng đổ khi lật trang */}
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        background: `linear-gradient(to left, rgba(0,0,0,${isFlipped ? 0.15 : 0}) 0%, rgba(0,0,0,0) 10%)`,
                        pointerEvents: "none"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gáy sách ở giữa (Book Spine shadow overlay) */}
            <div style={{
              position: "absolute",
              width: isMobile ? 8 : 16,
              height: pageHeight + (isMobile ? 12 : 24),
              background: "linear-gradient(to right, rgba(0,0,0,0.5), rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.5))",
              zIndex: 10,
              boxShadow: "0 0 10px rgba(0,0,0,0.5)"
            }} />
            </div>
          </div>
        )}
      </div>

      {/* 3. Vùng thanh trạng thái và điều khiển dưới */}
      {!loading && !error && pages.length > 0 && (
        <div style={{
          padding: "16px 24px",
          background: "rgba(17, 24, 39, 0.8)",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          color: "#fff",
          zIndex: 10
        }}>
          {/* Nút bấm điều hướng và Phóng to/Thu nhỏ */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 800, flexWrap: "wrap", gap: 16 }}>
            
            {/* Bộ điều khiển Zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.4))}
                title="Thu nhỏ"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              >
                <IoRemoveOutline fontSize={18} />
              </button>
              
              <span style={{ fontSize: 13, minWidth: 45, textAlign: "center", fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={() => setZoom(prev => Math.min(prev + 0.1, 3.0))}
                title="Phóng to"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              >
                <IoAddOutline fontSize={18} />
              </button>
              
              <button
                onClick={() => setZoom(1)}
                title="Đặt lại"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 10px",
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              >
                Đặt lại
              </button>
            </div>

            {/* Điều hướng trang */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={prevSheet}
                disabled={currentSheet === 0}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  cursor: currentSheet === 0 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  opacity: currentSheet === 0 ? 0.4 : 1,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => { if (currentSheet > 0) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              >
                <IoChevronBackOutline fontSize={16} /> Trang trước
              </button>

              <span style={{ fontSize: 15, fontWeight: 700, minWidth: 100, textAlign: "center" }}>
                {currentSheet === 0 ? (
                  <span>Trang bìa</span>
                ) : currentSheet === totalSheets ? (
                  <span>Trang cuối</span>
                ) : (
                  <span>Trang {currentSheet * 2} - {currentSheet * 2 + 1} / {pages.length}</span>
                )}
              </span>

              <button
                onClick={nextSheet}
                disabled={currentSheet === totalSheets}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  cursor: currentSheet === totalSheets ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  opacity: currentSheet === totalSheets ? 0.4 : 1,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => { if (currentSheet < totalSheets) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              >
                Trang sau <IoChevronForwardOutline fontSize={16} />
              </button>
            </div>
          </div>
          
          <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
            * Mẹo: Nhấn phím mũi tên Trái (←) / Phải (→) để lật trang. Lăn chuột hoặc bấm kính lúp để phóng to/thu nhỏ.
          </div>
        </div>
      )}

      {/* Animation Spin cho hiệu ứng Loading */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
