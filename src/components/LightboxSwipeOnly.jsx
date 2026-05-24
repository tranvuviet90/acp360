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
          bottom: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "grid",
          gap: 14,
          maxWidth: "min(92vw, 420px)",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background:
                t.type === "error"
                  ? "#fee2e2"
                  : t.type === "success"
                  ? "#ecfdf5"
                  : "#eff6ff",
              color:
                t.type === "error"
                  ? "#991b1b"
                  : t.type === "success"
                  ? "#065f46"
                  : "#1e3a8a",
              border: `1px solid ${
                t.type === "error"
                  ? "#fecaca"
                  : t.type === "success"
                  ? "#bbf7d0"
                  : "#bfdbfe"
              }`,
              borderRadius: 14,
              padding: "14px 16px",
              boxShadow: "0 6px 20px rgba(0,0,0,.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {t.type === "error"
                  ? "⚠️ Lỗi"
                  : t.type === "success"
                  ? "✅ Thành công"
                  : "🔔 Thông báo"}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 15 }}>{t.msg}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * LightboxSwipeOnly (Premium 3-Panel Viewport Slider)
 * - Màn hình lớn & nhỏ: kéo trượt ngang để xem ảnh kế tiếp/trước đó theo thời gian thực (real-time peeking).
 * - Cạnh trái & cạnh phải hiển thị sẵn ảnh kế tiếp/trước đó để mang lại trải nghiệm liền mạch 100%.
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
  
  const isDragging = useRef(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const lastTime = useRef(0);
  const lastX = useRef(0);
  const velocity = useRef(0);
  const trackRef = useRef(null);

  const total = list.length;

  // Tính toán chỉ số ảnh cho 3 panel
  const prevIdx = useMemo(() => (index - 1 + total) % total, [index, total]);
  const nextIdx = useMemo(() => (index + 1) % total, [index, total]);

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
      if (e.key === "ArrowLeft" && total > 1) handlePrevTransition();
      if (e.key === "ArrowRight" && total > 1) handleNextTransition();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, index]);

  // Tải trước (preload) các ảnh xung quanh
  useEffect(() => {
    if (!open || total < 2) return;
    const leftImg = new Image();
    const rightImg = new Image();
    leftImg.src = list[prevIdx] || "";
    rightImg.src = list[nextIdx] || "";
    leftImg.decode?.().catch(() => {});
    rightImg.decode?.().catch(() => {});
  }, [open, index, list, prevIdx, nextIdx, total]);

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
    if (activePanel === "next") {
      onNext?.();
    } else if (activePanel === "prev") {
      onPrev?.();
    }
    // Trả track về vị trí trung tâm ngay lập tức không có transition
    setIsTransitioning(false);
    setActivePanel("center");
    setOffsetX(0);
  };

  // Bắt đầu kéo (Pointer Down)
  const onPointerDown = (e) => {
    if (!open || total <= 1 || isTransitioning || e.button === 2) return;
    isDragging.current = true;
    startX.current = e.clientX;
    currentX.current = e.clientX;
    lastX.current = e.clientX;
    lastTime.current = performance.now();
    velocity.current = 0;
    
    // Gắn pointer capture để theo dõi cử chỉ ra ngoài phần tử
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Di chuyển (Pointer Move)
  const onPointerMove = (e) => {
    if (!isDragging.current) return;
    const clientX = e.clientX;
    currentX.current = clientX;
    
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
  };

  // Kết thúc kéo (Pointer Up / Cancel)
  const onPointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

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

  if (!open) return null;

  // Tính toán translate của track dựa trên panel và khoảng cách drag
  let translateValue = "calc(-100vw)";
  if (isDragging.current) {
    translateValue = `calc(-100vw + ${offsetX}px)`;
  } else if (isTransitioning) {
    if (activePanel === "next") {
      translateValue = "calc(-200vw)";
    } else if (activePanel === "prev") {
      translateValue = "0vw";
    } else {
      translateValue = "calc(-100vw)";
    }
  }

  const trackStyle = {
    display: "flex",
    flexDirection: "row",
    width: "300vw",
    height: "100%",
    transform: `translate3d(${translateValue}, 0, 0)`,
    transition: isTransitioning ? "transform 0.3s cubic-bezier(0.215, 0.61, 0.355, 1)" : "none",
    willChange: "transform",
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
          {index + 1} / {total}
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

      {/* Desktop Arrow Buttons */}
      {total > 1 && !isTransitioning && (
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
          cursor: isDragging.current ? "grabbing" : "grab",
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
            {list[index] && (
              <img
                src={list[index]}
                alt=""
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "100%",
                  maxHeight: "85vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                  pointerEvents: "none",
                  WebkitUserDrag: "none",
                }}
              />
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
