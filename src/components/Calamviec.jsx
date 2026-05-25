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
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useI18n } from "../i18n/I18nProvider";

/* ====== UI constants ====== */
const orange = "#466E73";
const orangeLight = "#A9D9D4";
const dark = "#222";
const redInvalid = "#f8d7da";
const statusGreenBg = "#d4edda";
const statusGreenText = "#155724";
const statusGreenBorder = "#c3e6cb";
const statusRedBg = "#f8d7da";
const statusRedText = "#721c24";
const statusRedBorder = "#f5c6cb";

/* ====== Domain constants ====== */
const DEFAULT_TASKS = [
  { id: "Giám sát hút thuốc", name: "Giám sát hút thuốc" },
  { id: "Gemba vòng ngoài", name: "Gemba vòng ngoài" },
  { id: "Giám sát nhà rác", name: "Giám sát nhà rác" }
];
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


const createEmptyBoardForWeek = (weekDates, tasksList) => {
  const board = {};
  weekDates.forEach((day) => {
    const dayId = formatDateToId(day);
    board[dayId] = {};
    SHIFT_KEYS.forEach((shiftKey) => {
      board[dayId][shiftKey] = {};
      tasksList.forEach((task) => {
        board[dayId][shiftKey][task.id] = [];
      });
    });
  });
  return board;
};

const ensureDayInBoard = (boardObj, dayId, tasksList) => {
  if (!boardObj[dayId]) boardObj[dayId] = {};
  SHIFT_KEYS.forEach((shiftKey) => {
    if (!boardObj[dayId][shiftKey]) boardObj[dayId][shiftKey] = {};
    tasksList.forEach((task) => {
      if (!Array.isArray(boardObj[dayId][shiftKey][task.id])) {
        boardObj[dayId][shiftKey][task.id] = [];
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
  const { t } = useI18n();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userShifts, setUserShifts] = useState({});
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [draggingItemId, setDraggingItemId] = useState(null);

  // Dynamic tasks state
  const [tasks, setTasks] = useState([]);
  const [newTaskName, setNewTaskName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskName, setEditingTaskName] = useState("");

  // Notes modal state
  const [noteModal, setNoteModal] = useState(null); // { item, shiftKey, task, noteText }

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
  const isEhsCommittee = userRole === "ehs committee";
  const today = new Date();
  const isSundayMorning = today.getDay() === 0 && today.getHours() < 12;

  const ehsCommitteeMembers = useMemo(
    () => allUsers
      .filter((u) => u.role?.toLowerCase() === "ehs committee")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allUsers]
  );

  // 1. Fetch Dynamic Tasks
  useEffect(() => {
    const docRef = doc(db, "weekly_assignments_v6", "config_tasks");
    const unsubTasks = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.tasks)) {
          setTasks(data.tasks);
        } else {
          setTasks(DEFAULT_TASKS);
        }
      } else {
        setTasks(DEFAULT_TASKS);
        if (canPlanBoard) {
          setDoc(docRef, { tasks: DEFAULT_TASKS }).catch(console.error);
        }
      }
    });
    return () => unsubTasks();
  }, [canPlanBoard]);

  // 2. Fetch Users list
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
        setAllUsers([]);
      }
    };
    fetchAllUsers();
  }, []);

  // 3. Fetch Shifts & Assignments
  useEffect(() => {
    if (tasks.length === 0) return; // Đợi tasks được load xong

    setLoading(true);
    
    const unsubShifts = onSnapshot(
      doc(db, "weekly_shifts", weekId),
      async (docSnap) => {
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
      },
      (error) => {
        console.error("Lỗi onSnapshot weekly_shifts:", error);
        setUserShifts({});
      }
    );

    const unsubAssignments = onSnapshot(
      doc(db, "weekly_assignments_v6", weekId),
      async (docSnap) => {
        if (!docSnap.exists()) {
          const emptyBoard = createEmptyBoardForWeek(weekDates, tasks);
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
          const boardData = docSnap.data().board || createEmptyBoardForWeek(weekDates, tasks);
          weekDates.forEach((d) => ensureDayInBoard(boardData, formatDateToId(d), tasks));
          setBoard(boardData);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Lỗi onSnapshot weekly_assignments_v6:", error);
        setBoard(createEmptyBoardForWeek(weekDates, tasks));
        setLoading(false);
      }
    );

    return () => {
      unsubShifts();
      unsubAssignments();
    };
  }, [weekId, canPlanBoard, tasks]); 

  // Helpers for managing task columns (Admin/EHS)
  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    const duplicate = tasks.some(t => t.name.toLowerCase() === newTaskName.trim().toLowerCase());
    if (duplicate) {
      alert("Tên nhiệm vụ này đã tồn tại!");
      return;
    }
    const newTaskId = `task_${Date.now()}`;
    const updatedTasks = [...tasks, { id: newTaskId, name: newTaskName.trim() }];
    try {
      await setDoc(doc(db, "weekly_assignments_v6", "config_tasks"), { tasks: updatedTasks });
      setNewTaskName("");
    } catch (error) {
      console.error("Lỗi khi thêm cột nhiệm vụ:", error);
      alert("Không thể thêm nhiệm vụ. Kiểm tra cấu hình Security Rules.");
    }
  };

  const handleSaveTaskName = async (taskId) => {
    if (!editingTaskName.trim()) return;
    const duplicate = tasks.some(t => t.id !== taskId && t.name.toLowerCase() === editingTaskName.trim().toLowerCase());
    if (duplicate) {
      alert("Tên nhiệm vụ này đã tồn tại!");
      return;
    }
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, name: editingTaskName.trim() } : t);
    try {
      await setDoc(doc(db, "weekly_assignments_v6", "config_tasks"), { tasks: updatedTasks });
      setEditingTaskId(null);
    } catch (error) {
      console.error("Lỗi khi cập nhật tên nhiệm vụ:", error);
      alert("Không thể cập nhật tên nhiệm vụ.");
    }
  };

  const handleDeleteTask = async (taskId, taskName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa cột nhiệm vụ "${taskName}"? Các dữ liệu đã phân công trong cột này sẽ bị ẩn.`)) return;
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    try {
      await setDoc(doc(db, "weekly_assignments_v6", "config_tasks"), { tasks: updatedTasks });
    } catch (error) {
      console.error("Lỗi khi xóa nhiệm vụ:", error);
      alert("Không thể xóa nhiệm vụ.");
    }
  };

  // Open note popup
  const handleNameTagClick = (item, shiftKey, task) => {
    if (!canPlanBoard) return;
    setNoteModal({
      item,
      shiftKey,
      task,
      noteText: item.note || ""
    });
  };

  // Save note to Firestore
  const handleSaveNote = async () => {
    if (!noteModal) return;
    const { item, shiftKey, task, noteText } = noteModal;
    
    const newBoard = JSON.parse(JSON.stringify(board));
    const list = newBoard[selectedDateId]?.[shiftKey]?.[task.id] || [];
    const idx = list.findIndex((it) => it.id === item.id);
    if (idx > -1) {
      list[idx].note = noteText.trim();
    } else {
      return;
    }
    
    setBoard(newBoard);
    setNoteModal(null);
    
    try {
      await setDoc(
        doc(db, "weekly_assignments_v6", weekId),
        { board: newBoard },
        { merge: true }
      );
      
      // Gửi thông báo đến người được note
      const targetUserObj = allUsers.find((u) => u.name === item.name);
      if (targetUserObj && targetUserObj.id) {
        const formattedDate = selectedDate.toLocaleDateString("vi-VN");
        const msg = noteText.trim()
          ? `Bạn có ghi chú mới cho nhiệm vụ "${task.name}" ca ${SHIFTS[shiftKey] || shiftKey} ngày ${formattedDate}: "${noteText.trim()}"`
          : `Ghi chú cho nhiệm vụ "${task.name}" ca ${SHIFTS[shiftKey] || shiftKey} ngày ${formattedDate} đã được xóa.`;
        
        await addDoc(collection(db, "notifications"), {
          type: "shift_note",
          message: msg,
          targetUserId: targetUserObj.id,
          readBy: [],
          timestamp: serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Lỗi khi lưu ghi chú:", e);
      alert("Lỗi khi lưu ghi chú!");
    }
  };

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
      alert(t("errors.updateShift"));
    }
  };

  const assignmentCountToday = useMemo(() => {
    const map = {};
    if (!board || tasks.length === 0) return map;
    const dayData = board[selectedDateId] || {};
    SHIFT_KEYS.forEach((sk) => {
      tasks.forEach((task) => {
        (dayData[sk]?.[task.id] || []).forEach((p) => {
          if (p?.name) map[p.name] = (map[p.name] || 0) + 1;
        });
      });
    });
    return map;
  }, [board, selectedDateId, tasks]);

  // Gather tasks for the logged in user this week
  const myWeekAssignments = useMemo(() => {
    const list = [];
    if (!board || !currentUserName || tasks.length === 0) return list;
    
    weekDates.forEach((day) => {
      const dayId = formatDateToId(day);
      const dayData = board[dayId] || {};
      SHIFT_KEYS.forEach((sk) => {
        tasks.forEach((t) => {
          const assignedList = dayData[sk]?.[t.id] || [];
          assignedList.forEach((item) => {
            if (item?.name === currentUserName) {
              list.push({
                date: day,
                dateId: dayId,
                shiftKey: sk,
                taskId: t.id,
                taskName: t.name,
                note: item.note || ""
              });
            }
          });
        });
      });
    });
    return list;
  }, [board, weekDates, tasks, currentUserName]);

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
            .flatMap((taskList) => taskList)
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

      // Gửi thông báo nếu kéo vào bảng phân công
      if (destIsBoard) {
        const { shift: dShift, task: dTask } = parseBoardDroppableId(destination.droppableId);
        try {
          const targetUserObj = allUsers.find((u) => u.name === draggedItem.name);
          if (targetUserObj && targetUserObj.id) {
            // Lấy tên nhiệm vụ hiển thị trên UI từ tasks list
            const foundTask = tasks.find(t => t.id === dTask);
            const displayTaskName = foundTask ? foundTask.name : dTask;
            
            await addDoc(collection(db, "notifications"), {
              type: "shift_assign",
              message: `Bạn được phân công nhiệm vụ "${displayTaskName}" ca ${SHIFTS[dShift] || dShift} ngày ${selectedDate.toLocaleDateString("vi-VN")}.`,
              targetUserId: targetUserObj.id,
              readBy: [],
              timestamp: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Lỗi gửi thông báo phân công:", e);
        }
      }
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

  if (loading || !board || tasks.length === 0) {
    return (
      <div style={{ textAlign: "center", fontWeight: "bold" }}>
        {t("loading.shifts")}
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
                {tasks.map((task) => (
                  <div key={`${shiftKey}-${task.id}`} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ width: '120px', flexShrink: 0, fontSize: 13, paddingTop: '8px' }}>{task.name}</div>
                    <Droppable droppableId={`board-${shiftKey}-${task.id}`} isDropDisabled={!canPlanBoard}>
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
                            {(board[selectedDateId]?.[shiftKey]?.[task.id] || []).map((item, index) => (
                              item && item.name ? (
                                <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!canPlanBoard}>
                                  {(provided2) => (
                                    <div
                                      ref={provided2.innerRef}
                                      {...provided2.draggableProps}
                                      {...provided2.dragHandleProps}
                                      onClick={() => handleNameTagClick(item, shiftKey, task)}
                                      className="name-tag-container"
                                      style={{
                                        padding: "6px 8px", borderRadius: 4, cursor: canPlanBoard ? "pointer" : "default", fontSize: 12, fontWeight: 500,
                                        background: "#EBF5F4", ...provided2.draggableProps.style,
                                      }}
                                    >
                                      {item.name}
                                      {item.note && <span style={{ marginLeft: 4, color: orange }} title={item.note}>📝</span>}
                                      {item.note && <div className="note-tooltip"><b>Ghi chú:</b> {item.note}</div>}
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
          gridTemplateColumns: `100px repeat(${tasks.length + 1}, 1fr)`,
          gap: "10px",
        }}
      >
        <div />
        {tasks.map((task) => (
          <div key={task.id} style={{ textAlign: "center", fontWeight: "bold", fontSize: 14, wordBreak: "break-word" }}>
            {task.name}
          </div>
        ))}
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 14, wordBreak: "break-word" }}>
          {STATIC_TASK}
        </div>
        {SHIFT_KEYS.map((shiftKey) => (
          <React.Fragment key={shiftKey}>
            <div style={{ fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {SHIFTS[shiftKey]}
            </div>
            {tasks.map((task) => (
              <Droppable key={`${shiftKey}-${task.id}`} droppableId={`board-${shiftKey}-${task.id}`} isDropDisabled={!canPlanBoard}>
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
                      {(board[selectedDateId]?.[shiftKey]?.[task.id] || []).map((item, index) => (
                        item && item.name ? (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!canPlanBoard}>
                            {(provided2, snapshot2) => (
                              <div
                                ref={provided2.innerRef}
                                {...provided2.draggableProps}
                                {...provided2.dragHandleProps}
                                onClick={() => handleNameTagClick(item, shiftKey, task)}
                                className="name-tag-container"
                                style={{
                                  padding: "8px 10px", margin: "2px", borderRadius: 4, cursor: canPlanBoard ? "pointer" : "default", textAlign: "center",
                                  fontSize: 13, fontWeight: 500, background: "#EBF5F4",
                                  ...provided2.draggableProps.style,
                                  transform: snapshot2.isDragging ? `${provided2.draggableProps.style.transform} scale(1.05)` : provided2.draggableProps.style.transform,
                                  boxShadow: snapshot2.isDragging ? "0 4px 12px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.1)",
                                }}
                              >
                                {item.name}
                                {item.note && <span style={{ marginLeft: 4, color: orange }} title={item.note}>📝</span>}
                                {item.note && <div className="note-tooltip"><b>Ghi chú:</b> {item.note}</div>}
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
      {/* Dynamic hover styles for notes tooltip */}
      <style>{`
        .name-tag-container {
          position: relative;
        }
        .note-tooltip {
          visibility: hidden;
          position: absolute;
          bottom: 115%;
          left: 50%;
          transform: translateX(-50%);
          background-color: #2c3e50;
          color: #fff;
          padding: 8px 12px;
          border-radius: 8px;
          z-index: 9999;
          width: 180px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-size: 12px;
          line-height: 1.4;
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
          font-weight: normal;
          text-align: left;
          white-space: normal;
        }
        .note-tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -5px;
          border-width: 5px;
          border-style: solid;
          border-color: #2c3e50 transparent transparent transparent;
        }
        .name-tag-container:hover .note-tooltip {
          visibility: visible;
          opacity: 1;
        }
      `}</style>

      <h2 style={{ fontWeight: 700, color: orange }}>
        {t("page.shifts.title")}
      </h2>

      {/* Sleek dashboard for user's assigned tasks and notes */}
      {isEhsCommittee && (
        <div style={{
          background: "#eef7f6", borderRadius: 8, padding: isMobile ? 12 : 18,
          marginBottom: 20, borderLeft: `5px solid ${orange}`
        }}>
          <h3 style={{ marginTop: 0, fontSize: isMobile ? 16 : 20, color: orange, display: "flex", alignItems: "center", gap: 8 }}>
            📋 Nhiệm vụ & Ghi chú của tôi tuần này
          </h3>
          {myWeekAssignments.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {myWeekAssignments.map((assign, idx) => (
                <div key={idx} style={{
                  background: "white", padding: 12, borderRadius: 8,
                  boxShadow: "0 2px 5px rgba(0,0,0,0.05)", border: "1px solid #d1e7e4"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: "bold", fontSize: 13, color: "#555" }}>
                      📅 {assign.date.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </span>
                    <span style={{
                      background: orangeLight, color: orange, padding: "2px 8px",
                      borderRadius: 12, fontSize: 11, fontWeight: "bold"
                    }}>
                      {SHIFTS[assign.shiftKey] || assign.shiftKey}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: "#2c3e50", marginBottom: 6 }}>
                    Nhiệm vụ: {assign.taskName}
                  </div>
                  {assign.note ? (
                    <div style={{
                      background: "#fdf8e2", borderLeft: "3px solid #f39c12",
                      padding: "8px 10px", borderRadius: 4, fontSize: 12, color: "#7f8c8d"
                    }}>
                      <b>Ghi chú:</b> {assign.note}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#95a5a6", fontStyle: "italic" }}>
                      Không có ghi chú nào.
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#666", fontSize: 14, fontStyle: "italic" }}>
              Bạn không có nhiệm vụ phân công đặc biệt nào trong tuần này.
            </div>
          )}
        </div>
      )}

      <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
          {t("shifts.myWeek").replace("{week}", getWeekNumber(weekDates[0]))}
        </h3>
        {isEhsCommittee && isSundayMorning && (
          <div style={{
            background: "#fff3cd", color: "#856404", border: "1px solid #ffeeba",
            padding: "12px 16px", borderRadius: 8, marginBottom: 15, fontWeight: "bold",
            display: "flex", alignItems: "center", gap: 8, fontSize: 13
          }}>
            ⚠️ Đang là sáng Chủ Nhật! Vui lòng hoàn tất báo ca đầy đủ cho tuần mới.
          </div>
        )}
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
                  <option value="">{t("shifts.selectShift")}</option>
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
            {t("shifts.availableStaff")}
          </h3>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 15, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={handlePreviousWeek} style={{ padding: "8px 12px", fontWeight: "bold" }}>{t("nav.prevWeek")}</button>
            <div style={{ fontWeight: "bold", fontSize: 16 }}>
              {t("nav.weekRange").replace("{week}", getWeekNumber(weekDates[0])).replace("{from}", weekDates[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })).replace("{to}", weekDates[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }))}
            </div>
            <button onClick={handleNextWeek} style={{ padding: "8px 12px", fontWeight: "bold" }}>{t("nav.nextWeek")}</button>
          </div>
          {getWeekNumber(new Date()) !== getWeekNumber(selectedDate) && (
            <div style={{ textAlign: "center", marginBottom: 15 }}>
              <button onClick={goToCurrentWeek} style={{ fontSize: 13, padding: "5px 10px", cursor: "pointer", background: "#e9ecef", border: "1px solid #ccc", borderRadius: 5 }}>
                {t("nav.backToCurrentWeek")}
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

        {/* Cấu hình/Quản lý danh sách nhiệm vụ của Admin & EHS */}
        {canPlanBoard && (
          <div style={{
            background: "white", padding: 15, borderRadius: 8, marginBottom: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${orangeLight}`
          }}>
            <h4 style={{ margin: "0 0 10px 0", color: orange, display: "flex", alignItems: "center", gap: 6, fontSize: 15 }}>
              🛠️ Quản lý danh sách cột nhiệm vụ (Chỉ Admin / EHS)
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {tasks.map((task) => (
                <div key={task.id} style={{
                  display: "flex", alignItems: "center", gap: 6, background: "#f1f3f5",
                  padding: "6px 12px", borderRadius: 20, fontSize: 13, border: "1px solid #dee2e6"
                }}>
                  {editingTaskId === task.id ? (
                    <input
                      type="text"
                      value={editingTaskName}
                      onChange={(e) => setEditingTaskName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTaskName(task.id);
                        if (e.key === 'Escape') setEditingTaskId(null);
                      }}
                      autoFocus
                      style={{
                        padding: "2px 6px", fontSize: 13, border: `1px solid ${orange}`,
                        borderRadius: 4, width: 120
                      }}
                    />
                  ) : (
                    <span>{task.name}</span>
                  )}
                  
                  {editingTaskId === task.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => handleSaveTaskName(task.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12 }} title="Lưu">✔️</button>
                      <button onClick={() => setEditingTaskId(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12 }} title="Hủy">❌</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
                      <button onClick={() => {
                        setEditingTaskId(task.id);
                        setEditingTaskName(task.name);
                      }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, opacity: 0.6 }} title="Sửa tên">✏️</button>
                      <button onClick={() => handleDeleteTask(task.id, task.name)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, opacity: 0.6 }} title="Xóa cột">🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Nhập tên cột nhiệm vụ mới..."
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
                style={{
                  padding: "8px 12px", border: "1px solid #ced4da", borderRadius: 6,
                  fontSize: 13, flexGrow: 1, maxWidth: 300
                }}
              />
              <button onClick={handleAddTask} style={{
                background: orange, color: "white", border: "none", padding: "8px 16px",
                borderRadius: 6, fontSize: 13, fontWeight: "bold", cursor: "pointer"
              }}>
                ➕ Thêm cột
              </button>
            </div>
          </div>
        )}

        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: isMobile ? 10 : 15, flexGrow: 1 }}>
          <h3 style={{ textAlign: "center", color: dark, marginTop: 0, fontSize: isMobile ? 16 : 20 }}>
            {t("board.titleForDay").replace("{date}", selectedDate.toLocaleDateString("vi-VN"))}
          </h3>
          {renderAssignmentBoard()}
        </div>
      </DragDropContext>

      {/* Note Edit Modal Overlay */}
      {noteModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center",
          alignItems: "center", zIndex: 10000, padding: 15
        }}>
          <div style={{
            backgroundColor: "white", padding: 20, borderRadius: 12, width: "100%",
            maxWidth: 450, boxShadow: "0 10px 25px rgba(0,0,0,0.2)", position: "relative"
          }}>
            <h3 style={{ marginTop: 0, color: orange, marginBottom: 4 }}>
              📝 Ghi chú cho {noteModal.item.name}
            </h3>
            <p style={{ margin: "0 0 15px 0", fontSize: 13, color: "#666" }}>
              Nhiệm vụ: <b>{noteModal.task.name}</b> | Ca: <b>{SHIFTS[noteModal.shiftKey] || noteModal.shiftKey}</b>
            </p>
            
            <textarea
              value={noteModal.noteText}
              onChange={(e) => setNoteModal({ ...noteModal, noteText: e.target.value })}
              placeholder="Nhập nội dung ghi chú (ví dụ: vị trí Gemba, lưu ý đặc biệt...)"
              rows={4}
              style={{
                width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #ccc",
                fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 15
              }}
              autoFocus
            />
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setNoteModal(null)}
                style={{
                  padding: "8px 16px", border: "1px solid #ccc", background: "none",
                  borderRadius: 6, cursor: "pointer", fontSize: 13
                }}
              >
                Hủy
              </button>
              <button
                onClick={handleSaveNote}
                style={{
                  padding: "8px 16px", border: "none", background: orange, color: "white",
                  borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: "bold"
                }}
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CaLamViec;