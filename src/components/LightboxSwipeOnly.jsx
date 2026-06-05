import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";

/* ===========================================================
   TOASTER TOÀN CỤC – dùng cho toàn bộ website
   - Named exports: useToast, ToastProvider
   - Default export: LightboxSwipeOnly (viewer)
   - Dùng ở App: <ToastProvider><AppRoutes/></ToastProvider>
 =========================================================== */
const ToastCtx = createContext({ pushToast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]); // {id,msg,type}
  const idRef = useRef(0);

  const pushToast = (msg, type = "info", ttlMs = 4000) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, ttlMs);
  };
  const removeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ pushToast }}>
      {children}
      {/* Portal */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "grid",
          gap: 12,
          maxWidth: "min(90vw, 360px)",
        }}
      >
        <style>{`
          @keyframes toastSlideIn {
            from { transform: translateX(50px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "#ffffff",
              color: "#222222",
              borderLeft: `5px solid ${
                t.type === "error"
                  ? "#dc2626"
                  : t.type === "success"
                  ? "#16a34a"
                  : "#1f80e0"
              }`,
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              minWidth: 280,
              maxWidth: 360,
              position: "relative",
              animation: "toastSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards"
            }}
          >
            <div
              style={{
                background:
                  t.type === "error"
                    ? "#fee2e2"
                    : t.type === "success"
                    ? "#e6f4ea"
                    : "#e8f0fe",
                borderRadius: "50%",
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {t.type === "error" ? "🚨" : t.type === "success" ? "✅" : "🔔"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111", marginBottom: 3 }}>
                {t.type === "error"
                  ? "Cảnh báo"
                  : t.type === "success"
                  ? "Thành công"
                  : "Thông báo"}
              </div>
              <div style={{ fontSize: 13, color: "#444", lineHeight: 1.45 }}>{t.msg}</div>
            </div>

            <button
              onClick={() => removeToast(t.id)}
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                fontSize: 16,
                color: "#aaa",
                lineHeight: 1,
                padding: 0,
                alignSelf: "flex-start",
                marginTop: -2,
                transition: "color 0.2s"
              }}
              onMouseOver={(e) => e.currentTarget.style.color = "#333"}
              onMouseOut={(e) => e.currentTarget.style.color = "#aaa"}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const ConfirmCtx = createContext({ askConfirm: () => Promise.resolve(false) });

export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    open: false,
    message: "",
    title: "Xác nhận",
    resolve: null,
  });

  const askConfirm = (message, title = "Xác nhận hành động") => {
    return new Promise((resolve) => {
      setConfirmState({
        open: true,
        message,
        title,
        resolve,
      });
    });
  };

  const handleCancel = () => {
    confirmState.resolve?.(false);
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  const handleConfirm = () => {
    confirmState.resolve?.(true);
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  return (
    <ConfirmCtx.Provider value={{ askConfirm }}>
      {children}
      {confirmState.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 12000,
            padding: "16px",
            animation: "confirmFadeIn 0.2s ease-out",
          }}
          onClick={handleCancel}
        >
          <style>{`
            @keyframes confirmFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes confirmScaleUp {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .confirm-btn {
              padding: 10px 22px;
              border-radius: 12px;
              font-weight: 700;
              font-size: 15px;
              cursor: pointer;
              transition: all 0.2s ease;
              border: none;
              line-height: 1.4;
            }
            .confirm-btn-cancel {
              background: #f1f5f9;
              color: #475569;
              border: 1px solid #cbd5e1;
            }
            .confirm-btn-cancel:hover {
              background: #e2e8f0;
              transform: translateY(-1px);
            }
            .confirm-btn-confirm {
              background: #466E73;
              color: white;
            }
            .confirm-btn-confirm:hover {
              background: #395c60;
              box-shadow: 0 4px 12px rgba(70, 110, 115, 0.3);
              transform: translateY(-1px);
            }
            .confirm-btn:active {
              transform: translateY(1px);
            }
          `}</style>
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "24px 28px",
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 15px 35px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "confirmScaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: 12,
              }}
            >
              <span style={{ fontSize: 24 }}>⚠️</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#1e293b",
                }}
              >
                {confirmState.title}
              </h3>
            </div>
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: "#475569",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {confirmState.message}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 8,
              }}
            >
              <button
                className="confirm-btn confirm-btn-cancel"
                onClick={handleCancel}
              >
                Hủy (No)
              </button>
              <button
                className="confirm-btn confirm-btn-confirm"
                onClick={handleConfirm}
              >
                Xác nhận (Yes)
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/**
 * LightboxSwipeOnly (Premium 3-Panel Viewport Slider with Image Zoom/Pan Support)
 * - Màn hình lớn & nhỏ: kéo trượt ngang để xem ảnh kế tiếp/trước đó theo thời gian thực (real-time peeking).
 * - Cạnh trái & cạnh phải hiển thị sẵn ảnh kế tiếp/trước đó để mang lại trải nghiệm liền mạch 100%.
 * - Hỗ trợ phóng to/thu nhỏ ảnh và kéo pan xung quanh khi đang zoom.
 * - Hỗ trợ nút mũi tên điều hướng trên máy tính và nút tắt đóng/backdrop.
 */
export default function LightboxSwipeOnly({
  open,
  list = [],
  index = 0,
  onClose,
  onPrev,
  onNext,
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activePanel, setActivePanel] = useState("center"); // 'prev' | 'center' | 'next'
  const [localIndex, setLocalIndex] = useState(index);
  
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const lastTime = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const velocity = useRef(0);
  const trackRef = useRef(null);

  const total = list.length;

  // Sync index from parent when it opens or changes from outside
  useEffect(() => {
    if (open) {
      setLocalIndex(index);
    }
  }, [open, index]);

  // Reset zoom whenever localIndex changes
  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, [localIndex]);

  // Tính toán chỉ số ảnh cho 3 panel
  const prevIdx = useMemo(() => (localIndex - 1 + total) % total, [localIndex, total]);
  const nextIdx = useMemo(() => (localIndex + 1) % total, [localIndex, total]);

  // Ngăn cuộn trang web khi đang mở Lightbox
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [open]);

  // Phím tắt bàn phím
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft" && total > 1 && scale === 1) handlePrevTransition();
      if (e.key === "ArrowRight" && total > 1 && scale === 1) handleNextTransition();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, localIndex, scale]);

  // Tải trước (preload) các ảnh xung quanh
  useEffect(() => {
    if (!open || total < 2) return;
    const leftImg = new Image();
    const rightImg = new Image();
    leftImg.src = list[prevIdx] || "";
    rightImg.src = list[nextIdx] || "";
    leftImg.decode?.().catch(() => {});
    rightImg.decode?.().catch(() => {});
  }, [open, localIndex, list, prevIdx, nextIdx, total]);

  // Xử lý chuyển tiếp mượt mà qua ảnh trước
  const handlePrevTransition = () => {
    if (isTransitioning || total <= 1) return;
    setIsTransitioning(true);
    setActivePanel("prev");
    setOffsetX(0);
  };

  // Xử lý chuyển tiếp mượt mà qua ảnh sau
  const handleNextTransition = () => {
    if (isTransitioning || total <= 1) return;
    setIsTransitioning(true);
    setActivePanel("next");
    setOffsetX(0);
  };

  // Hoàn tất animation chuyển slide
  const handleTransitionEnd = () => {
    if (!isTransitioning) return;
    let nextIdxVal = localIndex;
    if (activePanel === "next") {
      nextIdxVal = (localIndex + 1) % total;
      onNext?.();
    } else if (activePanel === "prev") {
      nextIdxVal = (localIndex - 1 + total) % total;
      onPrev?.();
    }
    setLocalIndex(nextIdxVal);
    setIsTransitioning(false);
    setActivePanel("center");
    setOffsetX(0);
  };

  // Bắt đầu kéo (Pointer Down)
  const onPointerDown = (e) => {
    if (!open || isTransitioning || e.button === 2) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    currentX.current = e.clientX;
    currentY.current = e.clientY;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    lastTime.current = performance.now();
    velocity.current = 0;
    
    // Gắn pointer capture để theo dõi cử chỉ ra ngoài phần tử
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Di chuyển (Pointer Move)
  const onPointerMove = (e) => {
    if (!isDragging.current) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    currentX.current = clientX;
    currentY.current = clientY;
    
    if (scale > 1) {
      // Pan the image instead of swiping
      setTranslateX((prev) => prev + (clientX - lastX.current));
      setTranslateY((prev) => prev + (clientY - lastY.current));
    } else {
      const now = performance.now();
      const dt = now - lastTime.current;
      if (dt > 10) {
        const dx = clientX - lastX.current;
        velocity.current = dx / dt; // px/ms
        lastX.current = clientX;
        lastTime.current = now;
      }
      
      const dragDistance = clientX - startX.current;
      setOffsetX(dragDistance);
    }
    
    lastX.current = clientX;
    lastY.current = clientY;
  };

  // Kết thúc kéo (Pointer Up / Cancel)
  const onPointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (scale > 1) {
      return;
    }

    const dragDistance = currentX.current - startX.current;
    const threshold = window.innerWidth * 0.22; // Cần kéo ít nhất 22% chiều rộng màn hình
    const flickVelocity = 0.35; // Tốc độ vuốt tối thiểu

    if (dragDistance < -threshold || velocity.current < -flickVelocity) {
      // Vuốt qua trái -> Xem ảnh kế tiếp
      setIsTransitioning(true);
      setActivePanel("next");
      setOffsetX(0);
    } else if (dragDistance > threshold || velocity.current > flickVelocity) {
      // Vuốt qua phải -> Xem ảnh trước đó
      setIsTransitioning(true);
      setActivePanel("prev");
      setOffsetX(0);
    } else {
      // Snap quay lại ảnh hiện tại
      setIsTransitioning(true);
      setActivePanel("center");
      setOffsetX(0);
    }
  };

  // Tải hình ảnh
  const handleDownload = async () => {
    const imageUrl = list[localIndex];
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = imageUrl.split('/').pop().split('?')[0] || 'ehs_image.jpg';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.open(imageUrl, '_blank');
    }
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    } else {
      setScale(2.5);
      setTranslateX(0);
      setTranslateY(0);
    }
  };

  if (!open) return null;

  // Tính toán translate của track dựa trên panel và khoảng cách drag bằng px nguyên bản để tăng hiệu suất mobile (không dùng calc)
  let tx = -window.innerWidth;
  if (isDragging.current && scale === 1) {
    tx = -window.innerWidth + offsetX;
  } else if (isTransitioning) {
    if (activePanel === "next") {
      tx = -2 * window.innerWidth;
    } else if (activePanel === "prev") {
      tx = 0;
    } else {
      tx = -window.innerWidth;
    }
  }

  const trackStyle = {
    display: "flex",
    flexDirection: "row",
    width: "300vw",
    height: "100%",
    transform: `translate3d(${tx}px, 0, 0)`,
    transition: isTransitioning ? "transform 0.3s cubic-bezier(0.215, 0.61, 0.355, 1)" : "none",
    willChange: "transform",
  };

  const activeImageStyle = {
    maxWidth: "100%",
    maxHeight: "85vh",
    objectFit: "contain",
    borderRadius: 12,
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
    transition: isDragging.current ? "none" : "transform 0.15s ease-out",
    willChange: "transform",
    cursor: scale > 1 ? "move" : "default",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 10, 0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 11000,
        overscrollBehavior: "contain",
        userSelect: "none",
        animation: "fadeIn .25s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .lightbox-btn {
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 11002;
        }
        .lightbox-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: scale(1.06);
        }
        .lightbox-btn:active {
          transform: scale(0.95);
        }
        .lightbox-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
        }
        .lightbox-arrow-left {
          position: absolute;
          left: 24px;
          top: 50%;
          transform: translateY(-50%);
        }
        .lightbox-arrow-right {
          position: absolute;
          right: 24px;
          top: 50%;
          transform: translateY(-50%);
        }
      `}</style>

      {/* Header Indicator */}
      {total > 0 && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.5)",
            color: "rgba(255,255,255,0.9)",
            padding: "6px 16px",
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 11002,
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          {localIndex + 1} / {total}
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        className="lightbox-btn lightbox-close-btn"
        title="Đóng (Esc)"
      >
        ✕
      </button>

      {/* Download Button */}
      {total > 0 && (
        <button
          onClick={handleDownload}
          className="lightbox-btn"
          style={{
            position: "absolute",
            top: 20,
            right: 80,
            zIndex: 11002,
          }}
          title="Tải ảnh nhanh"
        >
          📥
        </button>
      )}

      {/* Zoom In Button */}
      {total > 0 && (
        <button
          onClick={() => setScale(s => Math.min(4, s + 0.5))}
          className="lightbox-btn"
          style={{
            position: "absolute",
            top: 20,
            right: 140,
            zIndex: 11002,
            fontSize: 18,
          }}
          title="Phóng to"
        >
          ➕
        </button>
      )}

      {/* Zoom Out Button */}
      {total > 0 && (
        <button
          onClick={() => {
            setScale(s => {
              const next = Math.max(1, s - 0.5);
              if (next === 1) {
                setTranslateX(0);
                setTranslateY(0);
              }
              return next;
            });
          }}
          className="lightbox-btn"
          style={{
            position: "absolute",
            top: 20,
            right: 200,
            zIndex: 11002,
            fontSize: 18,
          }}
          title="Thu nhỏ"
        >
          ➖
        </button>
      )}

      {/* Desktop Arrow Buttons */}
      {total > 1 && !isTransitioning && scale === 1 && (
        <>
          <button
            onClick={handlePrevTransition}
            className="lightbox-btn lightbox-arrow-left"
            style={{ display: window.innerWidth < 768 ? "none" : "flex" }}
            title="Ảnh trước"
          >
            ‹
          </button>
          <button
            onClick={handleNextTransition}
            className="lightbox-btn lightbox-arrow-right"
            style={{ display: window.innerWidth < 768 ? "none" : "flex" }}
            title="Ảnh sau"
          >
            ›
          </button>
        </>
      )}

      {/* Slider Viewport Container */}
      <div
        style={{
          width: "100vw",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          touchAction: "none",
          cursor: isDragging.current ? "grabbing" : (scale > 1 ? "move" : "grab"),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={trackRef}
          style={trackStyle}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* Panel 1: Previous Image */}
          <div
            style={{
              width: "100vw",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: "20px",
              boxSizing: "border-box",
            }}
          >
            {total > 1 && (
              <img
                src={list[prevIdx]}
                alt=""
                draggable={false}
                style={{
                  maxWidth: "100%",
                  maxHeight: "85vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                  pointerEvents: "none",
                  WebkitUserDrag: "none",
                }}
              />
            )}
          </div>

          {/* Panel 2: Current Image */}
          <div
            style={{
              width: "100vw",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: "20px",
              boxSizing: "border-box",
            }}
            onClick={onClose}
          >
            {list[localIndex] && (
              <div
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={handleDoubleClick}
                style={{
                  display: "inline-block",
                  position: "relative",
                  maxWidth: "100%",
                  maxHeight: "85vh",
                }}
              >
                <img
                  src={list[localIndex]}
                  alt=""
                  draggable={false}
                  style={activeImageStyle}
                />
              </div>
            )}
          </div>

          {/* Panel 3: Next Image */}
          <div
            style={{
              width: "100vw",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: "20px",
              boxSizing: "border-box",
            }}
          >
            {total > 1 && (
              <img
                src={list[nextIdx]}
                alt=""
                draggable={false}
                style={{
                  maxWidth: "100%",
                  maxHeight: "85vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                  pointerEvents: "none",
                  WebkitUserDrag: "none",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
