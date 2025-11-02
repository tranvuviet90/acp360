// Calamviec.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  collection,
  getDocs,
  getDoc,
} from "firebase/firestore";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

/* ====== UI constants ====== */
const orange = "#E88E2E";
const orangeLight = "#FFD8A8";
const dark = "#222";
const redInvalid = "#f8d7da";
const statusGreenBg = "#d4edda";
const statusGreenText = "#155724";
const statusGreenBorder = "#c3e6cb";
const statusRedBg = "#f8d7da";
const statusRedText = "#721c24";
const statusRedBorder = "#f5c6cb";

/* ====== Domain constants ====== */
const DYNAMIC_TASKS = ["Giám sát hút thuốc", "Gemba vòng ngoài", "Giám sát nhà rác"];
const STATIC_TASK = "Gemba tại bộ phận";
const SHIFTS = { S1: "Ca 1", S2: "Ca 2", S3: "Ca 3", HC: "Ca HC", S8: "Ca 8" };
const SHIFT_KEYS = ["S1", "S2", "S3", "HC", "S8"];
const ALL_SHIFTS_LIST = ["S1", "S2", "S3", "HC", "S8", "Off"];
const PERSONNEL_COLUMNS = [...SHIFT_KEYS, "Off"];

/* ====== Helpers ====== */
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getWeekDates = (baseDate) => {
  const d = new Date(baseDate);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const firstDayOfWeek = new Date(d);
  firstDayOfWeek.setDate(diff);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(firstDayOfWeek);
    day.setDate(day.getDate() + i);
    weekDays.push(day);
  }
  return weekDays;
};

// =================================================================
// === HÀM ĐÃ SỬA LỖI: Luôn dùng ngày địa phương, không đổi sang UTC ===
// =================================================================
const formatDateToId = (date) => {
    // Lấy các thành phần của ngày dựa trên múi giờ địa phương
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // getMonth() trả về 0-11
    const day = date.getDate();

    // Thêm số 0 vào trước nếu cần (ví dụ: 9 -> "09")
    const monthStr = month < 10 ? '0' + month : month;
    const dayStr = day < 10 ? '0' + day : day;

    return `${year}-${monthStr}-${dayStr}`;
};
// =================================================================
// === KẾT THÚC VÙNG SỬA LỖI ========================================
// =================================================================


const createEmptyBoardForWeek = (weekDates) => {
  const board = {};
  weekDates.forEach((day) => {
    const dayId = formatDateToId(day);
    board[dayId] = {};
    SHIFT_KEYS.forEach((shiftKey) => {
      board[dayId][shiftKey] = {};
      DYNAMIC_TASKS.forEach((task) => {
        board[dayId][shiftKey][task] = [];
      });
    });
  });
  return board;
};

const ensureDayInBoard = (boardObj, dayId) => {
  if (!boardObj[dayId]) boardObj[dayId] = {};
  SHIFT_KEYS.forEach((shiftKey) => {
    if (!boardObj[dayId][shiftKey]) boardObj[dayId][shiftKey] = {};
    DYNAMIC_TASKS.forEach((task) => {
      if (!Array.isArray(boardObj[dayId][shiftKey][task])) {
        boardObj[dayId][shiftKey][task] = [];
      }
    });
  });
};

const parseBoardDroppableId = (id) => {
  const parts = id.split("-");
  if (parts[0] !== "board") return null;
  const shift = parts[1];
  const task = parts.slice(2).join("-");
  return { shift, task };
};

const getColorForAssignmentCount = (count) => {
  if (count === 1) return "#d4edda";
  if (count === 2) return "#a3d9a5";
  if (count >= 3) return "#72bf76";
  return "white";
};

/* ====== Component ====== */
function CaLamViec({ user, isMobile }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userShifts, setUserShifts] = useState({});
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [draggingItemId, setDraggingItemId] = useState(null);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekId = useMemo(
    () => `${weekDates[0].getFullYear()}-${getWeekNumber(weekDates[0])}`,
    [weekDates]
  );

  const selectedDateId = formatDateToId(selectedDate);
  const currentUserName = user?.name || "";
  const userRole = (user && user.role) ? user.role.toLowerCase() : "";

  const canUpdateShift = ["admin", "ehs", "ehs committee"].includes(userRole);
  const canPlanBoard = ["admin", "ehs"].includes(userRole);

  const ehsCommitteeMembers = useMemo(
    () => allUsers
      .filter((u) => u.role?.toLowerCase() === "ehs committee")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allUsers]
  );

  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const usersList = querySnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAllUsers(usersList);
      } catch (error) {
        console.error("Lỗi khi lấy danh sách người dùng:", error);
      }
    };
    fetchAllUsers();
  }, []);

  useEffect(() => {
    setLoading(true);
    
    const unsubShifts = onSnapshot(doc(db, "weekly_shifts", weekId), async (docSnap) => {
      if (docSnap.exists()) {
        setUserShifts(docSnap.data());
      } else {
        const prevDate = new Date(weekDates[0]);
        prevDate.setDate(prevDate.getDate() - 7);
        const prevWeekDates = getWeekDates(prevDate);
        const prevWeekId = `${prevWeekDates[0].getFullYear()}-${getWeekNumber(prevWeekDates[0])}`;
        
        const prevDocRef = doc(db, "weekly_shifts", prevWeekId);
        try {
          const prevDocSnap = await getDoc(prevDocRef);
          if (prevDocSnap.exists()) {
            const prevWeekData = prevDocSnap.data();
            setUserShifts(prevWeekData); 
            if (canUpdateShift) { 
              await setDoc(doc(db, "weekly_shifts", weekId), prevWeekData);
            }
          } else {
            setUserShifts({}); 
          }
        } catch (error) {
          console.error("Lỗi khi sao chép lịch tuần trước:", error);
          setUserShifts({});
        }
      }
    });

    const unsubAssignments = onSnapshot(
      doc(db, "weekly_assignments_v6", weekId),
      async (docSnap) => {
        if (!docSnap.exists()) {
          const emptyBoard = createEmptyBoardForWeek(weekDates);
          if (canPlanBoard) {
            try {
              await setDoc(
                doc(db, "weekly_assignments_v6", weekId),
                { board: emptyBoard },
                { merge: true }
              );
            } catch (e) {
              console.error("Không thể tạo bảng phân công tuần mới:", e);
            }
          }
          setBoard(emptyBoard);
        } else {
          const boardData = docSnap.data().board || createEmptyBoardForWeek(weekDates);
          weekDates.forEach((d) => ensureDayInBoard(boardData, formatDateToId(d)));
          setBoard(boardData);
        }

        setLoading(false);
      }
    );

    return () => {
      unsubShifts();
      unsubAssignments();
    };
  }, [weekId, canPlanBoard, JSON.stringify(weekDates)]); 

  const handleShiftChange = async (dayId, newShift) => {
    if (!currentUserName || !canUpdateShift) return;
    const docRef = doc(db, "weekly_shifts", weekId);
    try {
      await setDoc(
        docRef,
        { [currentUserName]: { [dayId]: newShift } },
        { merge: true }
      );
    } catch (error) {
      console.error("Lỗi khi cập nhật ca làm việc:", error);
      alert("Không thể cập nhật ca làm việc. Vui lòng kiểm tra quyền truy cập của bạn.");
    }
  };

  const assignmentCountToday = useMemo(() => {
    const map = {};
    if (!board) return map;
    const dayData = board[selectedDateId] || {};
    SHIFT_KEYS.forEach((sk) => {
      DYNAMIC_TASKS.forEach((task) => {
        (dayData[sk]?.[task] || []).forEach((p) => {
          if (p?.name) map[p.name] = (map[p.name] || 0) + 1;
        });
      });
    });
    return map;
  }, [board, selectedDateId]);

  const onDragStart = (start) => {
    if (!canPlanBoard) return;
    setDraggingItemId(start.draggableId);
    if (isMobile && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  const onDragEnd = async (result) => {
    setDraggingItemId(null);
    if (!canPlanBoard) return;

    const { source, destination, draggableId } = result;
    if (!destination) return;
    
    const draggedNameFromDraggableId =
      allUsers.find((u) => u.name === draggableId)?.name ||
      (board[selectedDateId]
        ? Object.values(board[selectedDateId])
            .flatMap((shift) => Object.values(shift))
            .flatMap((task) => task)
            .find((item) => item.id === draggableId)?.name
        : null);

    if (!draggedNameFromDraggableId) return;

    const draggedUser = allUsers.find((u) => u.name === draggedNameFromDraggableId);
    const draggedUserRole = draggedUser?.role?.toLowerCase();
    if (draggedUserRole === "admin" || draggedUserRole === "ehs") return;

    const draggedName = draggableId.includes("-")
      ? board[selectedDateId][parseBoardDroppableId(source.droppableId).shift][
          parseBoardDroppableId(source.droppableId).task
        ].find((item) => item.id === draggableId)?.name
      : draggableId;
    if (!draggedName) return;

    const destIsBoard = destination.droppableId.startsWith("board-");
    if (destIsBoard) {
      const { shift: dShift } = parseBoardDroppableId(destination.droppableId);
      const shiftForDay = userShifts[draggedName]?.[selectedDateId];
      if (shiftForDay !== dShift) return;
    }

    const newBoard = JSON.parse(JSON.stringify(board));
    const sourceIsBoard = source.droppableId.startsWith("board-");
    let draggedItem;

    if (sourceIsBoard) {
      const { shift: sShift, task: sTask } = parseBoardDroppableId(source.droppableId);
      const srcList = newBoard[selectedDateId][sShift][sTask];
      const idx = srcList.findIndex((it) => it.id === draggableId);
      if (idx > -1) {
        [draggedItem] = srcList.splice(idx, 1);
      } else {
        return;
      }
    } else {
      draggedItem = { name: draggedName, id: `${draggedName}-${Date.now()}` };
    }

    if (destIsBoard) {
      const { shift: dShift, task: dTask } = parseBoardDroppableId(destination.droppableId);
      const destList = newBoard[selectedDateId][dShift][dTask];
      if (destList.some((p) => p.name === draggedItem.name)) return;
      destList.splice(destination.index, 0, draggedItem);
    }

    setBoard(newBoard);

    try {
      await setDoc(
        doc(db, "weekly_assignments_v6", weekId),
        { board: newBoard },
        { merge: true }
      );
    } catch (e) {
      console.error("Lỗi khi lưu phân công:", e);
    }
  };

  const handlePreviousWeek = () => {
    setSelectedDate((prevDate) => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };
  const handleNextWeek = () => {
    setSelectedDate((prevDate) => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };
  const goToCurrentWeek = () => {
    setSelectedDate(new Date());
  };

  if (loading || !board || allUsers.length === 0) {
    return (
      <div style={{ textAlign: "center", fontWeight: "bold" }}>
        Đang tải dữ liệu ca làm việc...
      </div>
    );
  }

  const renderAssignmentBoard = () => {
    if (isMobile) {
      return (
        <div>
          {SHIFT_KEYS.map((shiftKey) => (
            <div key={shiftKey} style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px 0", paddingBottom: 4, borderBottom: `2px solid ${orangeLight}` }}>
                {SHIFTS[shiftKey]}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DYNAMIC_TASKS.map((task) => (
                  <div key={`${shiftKey}-${task}`} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ width: '120px', flexShrink: 0, fontSize: 13, paddingTop: '8px' }}>{task}</div>
                    <Droppable droppableId={`board-${shiftKey}-${task}`} isDropDisabled={!canPlanBoard}>
                      {(provided, snapshot) => {
                        const draggingUser = allUsers.find((u) => u.name === draggingItemId);
                        const draggingUserShift = userShifts[draggingUser?.name]?.[selectedDateId];
                        const isDropInvalid = snapshot.isDraggingOver && draggingItemId && draggingUserShift !== shiftKey;
                        return (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            style={{
                              background: isDropInvalid ? redInvalid : snapshot.isDraggingOver ? orangeLight : "#e9ecef",
                              border: `1px dashed ${isDropInvalid ? "red" : orange}`,
                              borderRadius: 6, minHeight: 40, padding: 4, flexGrow: 1, display: 'flex', flexWrap: 'wrap', gap: 4,
                            }}
                          >
                            {(board[selectedDateId]?.[shiftKey]?.[task] || []).map((item, index) => (
                              item && item.name ? (
                                <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!canPlanBoard}>
                                  {(provided2) => (
                                    <div
                                      ref={provided2.innerRef}
                                      {...provided2.draggableProps}
                                      {...provided2.dragHandleProps}
                                      style={{
                                        padding: "6px 8px", borderRadius: 4, cursor: "grab", fontSize: 12, fontWeight: 500,
                                        background: "#fff0e1", ...provided2.draggableProps.style,
                                      }}
                                    >
                                      {item.name}
                                    </div>
                                  )}
                                </Draggable>
                              ) : null
                            ))}
                            {provided.placeholder}
                          </div>
                        );
                      }}
                    </Droppable>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '120px', flexShrink: 0, fontSize: 13 }}>{STATIC_TASK}</div>
                    <div style={{ padding: '8px', background: '#e9ecef', borderRadius: 6, textAlign: 'center', color: '#6c757d', flexGrow: 1, fontSize: 12 }}>
                        Tất cả nhân sự trong ca
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "100px repeat(4, 1fr)",
          gap: "10px",
        }}
      >
        <div />
        {[...DYNAMIC_TASKS, STATIC_TASK].map((task) => (
          <div key={task} style={{ textAlign: "center", fontWeight: "bold", fontSize: 14, wordBreak: "break-word" }}>
            {task}
          </div>
        ))}
        {SHIFT_KEYS.map((shiftKey) => (
          <React.Fragment key={shiftKey}>
            <div style={{ fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {SHIFTS[shiftKey]}
            </div>
            {DYNAMIC_TASKS.map((task) => (
              <Droppable key={`${shiftKey}-${task}`} droppableId={`board-${shiftKey}-${task}`} isDropDisabled={!canPlanBoard}>
                {(provided, snapshot) => {
                  const draggingUser = allUsers.find((u) => u.name === draggingItemId);
                  const draggingUserShift = userShifts[draggingUser?.name]?.[selectedDateId];
                  const isDropInvalid = snapshot.isDraggingOver && draggingItemId && draggingUserShift !== shiftKey;
                  return (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        background: isDropInvalid ? redInvalid : snapshot.isDraggingOver ? orangeLight : "#e9ecef",
                        border: `2px dashed ${isDropInvalid ? "red" : snapshot.isDraggingOver ? orange : "transparent"}`,
                        borderRadius: 6, minHeight: 60, padding: 2,
                      }}
                    >
                      {(board[selectedDateId]?.[shiftKey]?.[task] || []).map((item, index) => (
                        item && item.name ? (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!canPlanBoard}>
                            {(provided2, snapshot2) => (
                              <div
                                ref={provided2.innerRef}
                                {...provided2.draggableProps}
                                {...provided2.dragHandleProps}
                                style={{
                                  padding: "8px 10px", margin: "2px", borderRadius: 4, cursor: "grab", textAlign: "center",
                                  fontSize: 13, fontWeight: 500, background: "#fff0e1",
                                  ...provided2.draggableProps.style,
                                  transform: snapshot2.isDragging ? `${provided2.draggableProps.style.transform} scale(1.05)` : provided2.draggableProps.style.transform,
                                  boxShadow: snapshot2.isDragging ? "0 4px 12px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.1)",
                                }}
                              >
                                {item.name}
                              </div>
                            )}
                          </Draggable>
                        ) : null
                      ))}
                      {provided.placeholder}
                    </div>
                  );
                }}
              </Droppable>
            ))}
            <div style={{ background: "#e9ecef", borderRadius: 6, minHeight: 60, padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ padding: "8px 12px", margin: "2px", borderRadius: 4, background: "#e9ecef", color: "#6c757d", cursor: "not-allowed", textAlign: "center", fontSize: 12 }}>All</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ fontWeight: 700, color: orange }}>
        Phân ca & Công việc EHS Committee
      </h2>

      <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
          Ca làm việc của tôi (Tuần {getWeekNumber(weekDates[0])})
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
          {weekDates.map((day) => {
            const dayId = formatDateToId(day);
            return (
              <div key={dayId}>
                <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: isMobile ? 13 : 14 }}>
                  {day.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
                <select
                  value={userShifts[currentUserName]?.[dayId] || ""}
                  onChange={(e) => handleShiftChange(dayId, e.target.value)}
                  disabled={!canUpdateShift}
                  style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #ccc" }}
                >
                  <option value="">-- Chọn ca --</option>
                  {ALL_SHIFTS_LIST.map((ca) => ( <option key={ca} value={ca}> {ca === "Off" ? "Off" : SHIFTS[ca] || ca} </option> ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
          Trạng thái báo ca:{" "} {selectedDate.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? "8px" : "10px" }}>
          {ehsCommitteeMembers.map((member) => {
            const hasReported = userShifts[member.name]?.[selectedDateId];
            const style = {
              padding: "6px 12px", borderRadius: 16, fontSize: isMobile ? 12 : 13, fontWeight: 500,
              backgroundColor: hasReported ? statusGreenBg : statusRedBg,
              color: hasReported ? statusGreenText : statusRedText,
              border: `1px solid ${ hasReported ? statusGreenBorder : statusRedBorder }`,
            };
            return ( <div key={member.name} style={style}> {member.name} </div> );
          })}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, marginBottom: 20 }}>
          <h3 style={{ textAlign: "center", color: dark, marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
            Ca làm việc (Nhân sự có sẵn)
          </h3>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 15, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={handlePreviousWeek} style={{ padding: "8px 12px", fontWeight: "bold" }}> &lt; Tuần trước </button>
            <div style={{ fontWeight: "bold", fontSize: 16 }}>
              Tuần {getWeekNumber(weekDates[0])} ({weekDates[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}{" "}-{" "}
              {weekDates[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })})
            </div>
            <button onClick={handleNextWeek} style={{ padding: "8px 12px", fontWeight: "bold" }}> Tuần sau &gt; </button>
          </div>
          {getWeekNumber(new Date()) !== getWeekNumber(selectedDate) && (
            <div style={{ textAlign: "center", marginBottom: 15 }}>
              <button onClick={goToCurrentWeek} style={{ fontSize: 13, padding: "5px 10px", cursor: "pointer", background: "#e9ecef", border: "1px solid #ccc", borderRadius: 5 }}>
                Quay về tuần hiện tại
              </button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
            {weekDates.map((day) => {
              const dayId = formatDateToId(day);
              const isActive = dayId === selectedDateId;
              return (
                <button
                  key={dayId} onClick={() => setSelectedDate(day)}
                  style={{ background: isActive ? orange : "white", color: isActive ? "white" : dark, border: "1px solid #ddd", padding: "8px 12px", borderRadius: 6, fontWeight: "bold" }}
                > {day.getDate()} </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: isMobile ? "wrap" : "nowrap", minHeight: "60px" }}>
            {PERSONNEL_COLUMNS.map((shiftKey) => (
              <Droppable key={shiftKey} droppableId={`inventory-${shiftKey}`} isDropDisabled={!canPlanBoard || shiftKey === "Off"}>
                {(provided) => (
                  <div
                    ref={provided.innerRef} {...provided.droppableProps}
                    style={{
                      background: "#e9ecef", borderRadius: 6, flex: 1, minWidth: isMobile ? "calc(33.33% - 7px)" : "auto",
                      padding: 8, display: "flex", flexDirection: "column",
                    }}
                  >
                    <h4 style={{ margin: "0 0 10px 0", textAlign: "center", fontSize: isMobile ? 14 : 16 }}>
                      {SHIFTS[shiftKey] || shiftKey}
                    </h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, minHeight: 40, alignItems: "flex-start" }}>
                      {Object.keys(userShifts)
                        .filter((name) => userShifts[name]?.[selectedDateId] === shiftKey)
                        .map((name, index) => {
                          const userDetails = allUsers.find((u) => u.name === name);
                          const userRoleFromList = userDetails?.role?.toLowerCase() || "";
                          const isProtectedRole = userRoleFromList === "admin" || userRoleFromList === "ehs";
                          const isOff = shiftKey === "Off";
                          return (
                            <Draggable key={name} draggableId={name} index={index} isDragDisabled={!canPlanBoard || isProtectedRole || isOff}>
                              {(provided2, snapshot) => {
                                const backgroundColor = isProtectedRole ? orange : isOff ? "#d3d3d3" : getColorForAssignmentCount(assignmentCountToday[name] || 0);
                                const textColor = isProtectedRole ? "white" : isOff ? "#555" : "inherit";
                                const style = {
                                  padding: isMobile ? "8px" : "8px 10px", margin: "2px", borderRadius: 4,
                                  cursor: !canPlanBoard || isProtectedRole || isOff ? "not-allowed" : "grab",
                                  textAlign: "center", fontSize: isMobile ? 12 : 13, fontWeight: 500, background: backgroundColor, color: textColor,
                                  border: "1px solid #ddd", ...provided2.draggableProps.style,
                                  transform: snapshot.isDragging ? `${provided2.draggableProps.style.transform} scale(1.05)` : provided2.draggableProps.style.transform,
                                  boxShadow: snapshot.isDragging ? "0 4px 12px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.1)",
                                };
                                return ( <div ref={provided2.innerRef} {...provided2.draggableProps} {...provided2.dragHandleProps} style={style}> {name} </div> );
                              }}
                            </Draggable>
                          );
                        })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </div>

        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, flexGrow: 1 }}>
          <h3 style={{ textAlign: "center", color: dark, marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
            Bảng phân công ngày: {selectedDate.toLocaleDateString("vi-VN")}
          </h3>
          {renderAssignmentBoard()}
        </div>
      </DragDropContext>
    </div>
  );
}

export default CaLamViec;