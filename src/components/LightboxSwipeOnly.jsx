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
 * LightboxSwipeOnly (viewer)
 * - PC & Mobile: kéo (drag) trái/phải để chuyển ảnh
 * - Bấm ra ngoài (backdrop) để tắt, ESC để tắt (PC)
 */
export default function LightboxSwipeOnly({
  open,
  list = [],
  index = 0,
  onClose,
  onPrev,
  onNext,
}) {
  const SUPPORTS_POINTER = useMemo(
    () => typeof window !== "undefined" && "PointerEvent" in window,
    []
  );
  const prevIndex = useRef(index);
  const contentRef = useRef(null);
  const imgRef = useRef(null);

  const dragging = useRef(false);
  const [dragUI, setDragUI] = useState(false);
  const startX = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const dxTarget = useRef(0);
  const rafId = useRef(null);
  const leaving = useRef(false);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || list.length < 2) return;
    const left = new Image();
    const right = new Image();
    left.src = list[(index - 1 + list.length) % list.length] || "";
    right.src = list[(index + 1) % list.length] || "";
    left.decode?.().catch(() => {});
    right.decode?.().catch(() => {});
  }, [open, index, list]);

  useEffect(() => {
    if (!open || !imgRef.current) return;
    leaving.current = false;
    imgRef.current.style.transition = "none";
    imgRef.current.style.transform = "translate3d(0,0,0)";
    imgRef.current.style.willChange = "transform";
  }, [open, index]);

  const schedule = () => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      const el = imgRef.current;
      if (el) el.style.transform = `translate3d(${dxTarget.current}px,0,0)`;
      rafId.current = null;
    });
  };

  const beginDrag = (x) => {
    dragging.current = true;
    setDragUI(true);
    startX.current = x;
    lastX.current = x;
    lastT.current = performance.now();
    dxTarget.current = 0;
    const el = imgRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.willChange = "transform";
    }
  };

  const moveDrag = (x, ev) => {
    if (!dragging.current) return;
    dxTarget.current = x - startX.current;
    const now = performance.now();
    if (now - lastT.current > 12) {
      lastX.current = x;
      lastT.current = now;
    }
    if (ev?.cancelable) ev.preventDefault();
    schedule();
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setDragUI(false);

    const dt = Math.max(1, performance.now() - lastT.current);
    const vx = (dxTarget.current - (lastX.current - startX.current)) / dt; // px/ms
    const threshold = 80;
    const flick = 0.5; // px/ms

    const shouldNext = dxTarget.current <= -threshold || vx <= -flick;
    const shouldPrev = dxTarget.current >= threshold || vx >= flick;

    const el = imgRef.current;
    if (!el) return;

    el.style.transition = "transform .22s cubic-bezier(.22,.61,.36,1)";

    const onEnd = () => {
      if (!leaving.current) {
        el.removeEventListener("transitionend", onEnd);
        return;
      }
      el.removeEventListener("transitionend", onEnd);
      el.style.transition = "none";
      el.style.transform = "translate3d(0,0,0)";
      leaving.current = false;
      if (shouldNext) onNext?.();
      else if (shouldPrev) onPrev?.();
    };

    if (shouldNext) {
      leaving.current = true;
      el.addEventListener("transitionend", onEnd);
      el.style.transform = "translate3d(-110vw,0,0)";
    } else if (shouldPrev) {
      leaving.current = true;
      el.addEventListener("transitionend", onEnd);
      el.style.transform = "translate3d(110vw,0,0)";
    } else {
      dxTarget.current = 0;
      schedule();
    }
  };

  const onPointerDown = (e) => {
    if (!open || e.button === 2) return;
    contentRef.current?.setPointerCapture?.(e.pointerId);
    beginDrag(e.clientX ?? 0);
  };
  const onPointerMove = (e) => moveDrag(e.clientX ?? 0, e);
  const onPointerUp = () => endDrag();
  const onPointerCancel = () => endDrag();

  const getTouchX = (e) =>
    e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0;
  const onTouchStart = (e) => {
    if (!open) return;
    if (e.touches?.length > 1) return;
    beginDrag(getTouchX(e));
  };
  const onTouchMove = (e) => moveDrag(getTouchX(e), e);
  const onTouchEnd = () => endDrag();
  const onTouchCancel = () => endDrag();

  const slideAnim = () => {
    let anim = "slideInNext";
    if (index < prevIndex.current) anim = "slideInPrev";
    prevIndex.current = index;
    return anim;
  };

  if (!open) return null;
  const src = list[index] || "";

  const handlers = SUPPORTS_POINTER
    ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
    : { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        animation: "fadeInZoom .2s ease",
        overscrollBehavior: "contain",
      }}
    >
      <style>{`
        @keyframes fadeInZoom {
          from { opacity: 0; transform: scale(0.985); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInNext {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInPrev {
          from { opacity: 0; transform: translateX(-30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, cursor: "zoom-out" }}
      />

      <div
        ref={contentRef}
        {...handlers}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "92vw",
          maxHeight: "92vh",
          touchAction: "none",
          cursor: dragUI ? "grabbing" : "grab",
          contain: "content",
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
          style={{
            maxWidth: "92vw",
            maxHeight: "92vh",
            objectFit: "contain",
            borderRadius: 10,
            background: "#111",
            willChange: "transform",
            animation: `${slideAnim()} .24s ease`,
            userSelect: "none",
            WebkitUserDrag: "none",
            backfaceVisibility: "hidden",
            transform: "translate3d(0,0,0)",
          }}
        />
      </div>
    </div>
  );
}
