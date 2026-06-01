// backend/controllers/dbController.js
import pool from "../db.js";

// Helper to broadcast changes to WebSocket connections
let ioInstance = null;
export function setIoInstance(io) {
  ioInstance = io;
}

function broadcastChange(path, data) {
  if (ioInstance) {
    ioInstance.emit("db_change", { path, data });
  }
}

// Map collection name to MySQL table name and key field
const TABLE_MAPPING = {
  users: { table: "users", key: "uid" },
  notifications: { table: "notifications", key: "id" },
  role_requests: { table: "role_requests", key: "id" },
  chat_messages: { table: "chat_messages", key: "id" },
  weekly_shifts: { table: "weekly_shifts", key: "week_id" },
  msds_chemicals: { table: "msds_chemicals", key: "chemical_code" },
  gemba: { table: "gemba_reports", key: "id", filter: { type: "gemba" } },
  tu_gemba: { table: "gemba_reports", key: "id", filter: { type: "tu_gemba" } },
  hutthuoc: { table: "smoking_violations", key: "id" },
  meal_reports: { table: "meal_reports", key: "date_key" }
};

// JSON Columns helper
const JSON_COLUMNS = {
  notifications: ["target_roles", "read_by"],
  weekly_shifts: ["data"],
  meal_reports: ["summary", "confirmed_summary", "reports", "overtime_fulfilled", "history"]
};

function isJsonCol(table, col) {
  return JSON_COLUMNS[table] && JSON_COLUMNS[table].includes(col);
}

// Convert DB row to frontend object
function formatRow(table, row) {
  if (!row) return null;
  const formatted = { ...row };
  
  // Convert ID
  if (row.uid) formatted.id = row.uid;
  
  // Parse JSON columns
  if (JSON_COLUMNS[table]) {
    JSON_COLUMNS[table].forEach(col => {
      if (formatted[col] !== undefined) {
        try {
          formatted[col] = typeof formatted[col] === "string" ? JSON.parse(formatted[col]) : formatted[col];
        } catch (e) {
          formatted[col] = null;
        }
      }
    });
  }
  return formatted;
}

// GET all items in a collection
export async function getCollection(req, res) {
  const { collection } = req.params;
  const cfg = TABLE_MAPPING[collection];
  if (!cfg) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });

  try {
    let queryStr = `SELECT * FROM ${cfg.table}`;
    const params = [];
    if (cfg.filter) {
      const [[k, v]] = Object.entries(cfg.filter);
      queryStr += ` WHERE ${k} = ?`;
      params.push(v);
    }
    
    // Default sorting for chat and notifications
    if (cfg.table === "chat_messages" || cfg.table === "notifications") {
      queryStr += " ORDER BY id DESC LIMIT 100";
    }

    const [rows] = await pool.query(queryStr, params);
    const result = rows.map(r => formatRow(cfg.table, r));
    res.status(200).json(result);
  } catch (error) {
    console.error(`Get collection ${collection} error:`, error);
    res.status(500).json({ error: "Lỗi cơ sở dữ liệu" });
  }
}

// GET single document by ID
export async function getDocument(req, res) {
  const { collection, id } = req.params;
  const cfg = TABLE_MAPPING[collection];
  if (!cfg) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });

  try {
    // Special mapping for meal_reports (composite key)
    if (cfg.table === "meal_reports") {
      const [rows] = await pool.query("SELECT * FROM meal_reports WHERE date_key = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Không có dữ liệu báo cơm cho ngày này" });
      }

      const payload = {};
      rows.forEach(r => {
        payload[r.shift_key] = {
          summary: JSON.parse(r.summary || "null"),
          confirmedSummary: JSON.parse(r.confirmed_summary || "null"),
          confirmedByAdmin: r.confirmed_by_admin,
          confirmedAtAdmin: r.confirmed_at_admin,
          confirmedByCanteen: r.confirmed_by_canteen,
          confirmedAtCanteen: r.confirmed_at_canteen,
          reports: JSON.parse(r.reports || "null"),
          overtimeFulfilled: JSON.parse(r.overtime_fulfilled || "null"),
          lastReportAt: r.last_report_at
        };
      });
      // Flatten history & lastHistoryAt from the first available row
      payload.history = JSON.parse(rows[0].history || "[]");
      payload.lastHistoryAt = rows[0].last_history_at;

      return res.status(200).json(payload);
    }

    // Normal table lookups
    const [rows] = await pool.query(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy dòng tương ứng" });
    }
    res.status(200).json(formatRow(cfg.table, rows[0]));
  } catch (error) {
    console.error(`Get document ${collection}/${id} error:`, error);
    res.status(500).json({ error: "Lỗi cơ sở dữ liệu" });
  }
}

// Helper to compile updates with serverTimestamp and arrayUnion
function processFieldUpdate(currentValue, updateValue) {
  if (updateValue && updateValue.type === "serverTimestamp") {
    return new Date().toISOString();
  }
  if (updateValue && updateValue.type === "arrayUnion") {
    const list = Array.isArray(currentValue) ? currentValue : [];
    const elementsToAdd = Array.isArray(updateValue.elements) ? updateValue.elements : [];
    // Deduplicate
    const combined = [...list];
    elementsToAdd.forEach(el => {
      const match = combined.some(item => JSON.stringify(item) === JSON.stringify(el));
      if (!match) combined.push(el);
    });
    return combined;
  }
  return updateValue;
}

// POST or PATCH single document
export async function updateDocument(req, res) {
  const { collection, id } = req.params;
  const isPatch = req.method === "PATCH";
  const cfg = TABLE_MAPPING[collection];
  if (!cfg) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });

  try {
    const payload = req.body;

    // Special mapping for meal_reports (composite key)
    if (cfg.table === "meal_reports") {
      const shifts = ["HC", "S1", "S2", "S3", "S8"];
      
      // 1. Fetch current rows for this date to support patch merges
      const [rows] = await pool.query("SELECT * FROM meal_reports WHERE date_key = ?", [id]);
      const currentMap = {};
      rows.forEach(r => { currentMap[r.shift_key] = r; });

      // Identify history update in payload
      let historyVal = rows.length > 0 ? JSON.parse(rows[0].history || "[]") : [];
      let historyChanged = false;
      if (payload.history) {
        historyVal = processFieldUpdate(historyVal, payload.history);
        historyChanged = true;
      }
      
      let lastHistoryAtVal = rows.length > 0 ? rows[0].last_history_at : null;
      if (payload.lastHistoryAt) {
        lastHistoryAtVal = processFieldUpdate(lastHistoryAtVal, payload.lastHistoryAt);
      }

      // Iterate shifts to perform individual row sets/patches
      for (const shift of shifts) {
        const shiftPayload = payload[shift];
        const hasShiftUpdate = !!shiftPayload;

        if (hasShiftUpdate || historyChanged) {
          const rowExists = !!currentMap[shift];
          const cur = currentMap[shift] || {};

          let summary = shiftPayload?.summary !== undefined ? shiftPayload.summary : (rowExists ? JSON.parse(cur.summary || "null") : null);
          let confirmedSummary = shiftPayload?.confirmedSummary !== undefined ? shiftPayload.confirmedSummary : (rowExists ? JSON.parse(cur.confirmed_summary || "null") : null);
          let confirmedByAdmin = shiftPayload?.confirmedByAdmin !== undefined ? shiftPayload.confirmedByAdmin : (rowExists ? cur.confirmed_by_admin : null);
          let confirmedAtAdmin = shiftPayload?.confirmedAtAdmin !== undefined ? processFieldUpdate(cur.confirmed_at_admin, shiftPayload.confirmedAtAdmin) : (rowExists ? cur.confirmed_at_admin : null);
          let confirmedByCanteen = shiftPayload?.confirmedByCanteen !== undefined ? shiftPayload.confirmedByCanteen : (rowExists ? cur.confirmed_by_canteen : null);
          let confirmedAtCanteen = shiftPayload?.confirmedAtCanteen !== undefined ? processFieldUpdate(cur.confirmed_at_canteen, shiftPayload.confirmedAtCanteen) : (rowExists ? cur.confirmed_at_canteen : null);
          
          // Deep merge for nested reports and overtimeFulfilled objects
          let reports = rowExists ? JSON.parse(cur.reports || "{}") : {};
          if (shiftPayload?.reports) {
            reports = { ...reports, ...shiftPayload.reports };
          }
          let overtimeFulfilled = rowExists ? JSON.parse(cur.overtime_fulfilled || "{}") : {};
          if (shiftPayload?.overtimeFulfilled) {
            overtimeFulfilled = { ...overtimeFulfilled, ...shiftPayload.overtimeFulfilled };
          }
          
          let lastReportAt = shiftPayload?.lastReportAt !== undefined ? processFieldUpdate(cur.last_report_at, shiftPayload.lastReportAt) : (rowExists ? cur.last_report_at : null);

          // Build INSERT ON DUPLICATE KEY UPDATE query
          await pool.query(
            `INSERT INTO meal_reports (
              date_key, shift_key, summary, confirmed_summary, confirmed_by_admin, confirmed_at_admin, 
              confirmed_by_canteen, confirmed_at_canteen, reports, overtime_fulfilled, history, last_history_at, last_report_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
              summary = VALUES(summary), confirmed_summary = VALUES(confirmed_summary), 
              confirmed_by_admin = VALUES(confirmed_by_admin), confirmed_at_admin = VALUES(confirmed_at_admin),
              confirmed_by_canteen = VALUES(confirmed_by_canteen), confirmed_at_canteen = VALUES(confirmed_at_canteen),
              reports = VALUES(reports), overtime_fulfilled = VALUES(overtime_fulfilled),
              history = VALUES(history), last_history_at = VALUES(last_history_at), last_report_at = VALUES(last_report_at)`,
            [
              id, shift, JSON.stringify(summary), JSON.stringify(confirmedSummary), confirmedByAdmin, confirmedAtAdmin,
              confirmedByCanteen, confirmedAtCanteen, JSON.stringify(reports), JSON.stringify(overtimeFulfilled),
              JSON.stringify(historyVal), lastHistoryAtVal, lastReportAt
            ]
          );
        }
      }

      // Query complete data and broadcast update
      const [updatedRows] = await pool.query("SELECT * FROM meal_reports WHERE date_key = ?", [id]);
      const updatePayload = {};
      updatedRows.forEach(r => {
        updatePayload[r.shift_key] = {
          summary: JSON.parse(r.summary || "null"),
          confirmedSummary: JSON.parse(r.confirmed_summary || "null"),
          confirmedByAdmin: r.confirmed_by_admin,
          confirmedAtAdmin: r.confirmed_at_admin,
          confirmedByCanteen: r.confirmed_by_canteen,
          confirmedAtCanteen: r.confirmed_at_canteen,
          reports: JSON.parse(r.reports || "null"),
          overtimeFulfilled: JSON.parse(r.overtime_fulfilled || "null"),
          lastReportAt: r.last_report_at
        };
      });
      updatePayload.history = JSON.parse(updatedRows[0].history || "[]");
      updatePayload.lastHistoryAt = updatedRows[0].last_history_at;

      broadcastChange(`meal_reports/${id}`, updatePayload);
      broadcastChange("meal_reports", [updatePayload]); // list broadcast
      return res.status(200).json({ success: true });
    }

    // Normal tables CRUD Lookups
    const [existing] = await pool.query(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
    const rowExists = existing.length > 0;
    const curRow = rowExists ? existing[0] : {};

    const dbPayload = {};
    
    // Construct columns based on row fields or default schema attributes
    const updateKeys = Object.keys(payload);
    for (const key of updateKeys) {
      let rawVal = payload[key];
      let curVal = curRow[key];
      
      if (isJsonCol(cfg.table, key)) {
        try {
          curVal = typeof curVal === "string" ? JSON.parse(curVal) : curVal;
        } catch (e) {
          curVal = null;
        }
      }

      const processed = processFieldUpdate(curVal, rawVal);
      dbPayload[key] = isJsonCol(cfg.table, key) ? JSON.stringify(processed) : processed;
    }

    if (rowExists) {
      // Perform UPDATE
      const setClauses = Object.keys(dbPayload).map(k => `${k} = ?`).join(", ");
      const values = [...Object.values(dbPayload), id];
      await pool.query(`UPDATE ${cfg.table} SET ${setClauses} WHERE ${cfg.key} = ?`, values);
    } else {
      // Perform INSERT
      dbPayload[cfg.key] = id;
      if (cfg.filter) {
        const [[k, v]] = Object.entries(cfg.filter);
        dbPayload[k] = v;
      }
      const columns = Object.keys(dbPayload).join(", ");
      const placeholders = Object.keys(dbPayload).map(() => "?").join(", ");
      const values = Object.values(dbPayload);
      await pool.query(`INSERT INTO ${cfg.table} (${columns}) VALUES (${placeholders})`, values);
    }

    // Fetch and broadcast final update
    const [finalRow] = await pool.query(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
    const formatted = formatRow(cfg.table, finalRow[0]);
    broadcastChange(`${collection}/${id}`, formatted);
    
    // Also trigger collection list broadcast
    const [allRows] = await pool.query(`SELECT * FROM ${cfg.table}`);
    broadcastChange(collection, allRows.map(r => formatRow(cfg.table, r)));

    res.status(200).json(formatted);
  } catch (error) {
    console.error(`Update document ${collection}/${id} error:`, error);
    res.status(500).json({ error: "Lỗi cập nhật cơ sở dữ liệu" });
  }
}

// POST to collection (Add Document)
export async function addDocument(req, res) {
  const { collection } = req.params;
  const cfg = TABLE_MAPPING[collection];
  if (!cfg) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });

  try {
    const payload = req.body;
    const id = "doc-" + Date.now() + Math.random().toString(36).substr(2, 9);
    
    const dbPayload = {};
    for (const key of Object.keys(payload)) {
      const processed = processFieldUpdate(null, payload[key]);
      dbPayload[key] = isJsonCol(cfg.table, key) ? JSON.stringify(processed) : processed;
    }

    dbPayload[cfg.key] = id;
    if (cfg.filter) {
      const [[k, v]] = Object.entries(cfg.filter);
      dbPayload[k] = v;
    }

    const columns = Object.keys(dbPayload).join(", ");
    const placeholders = Object.keys(dbPayload).map(() => "?").join(", ");
    const values = Object.values(dbPayload);
    await pool.query(`INSERT INTO ${cfg.table} (${columns}) VALUES (${placeholders})`, values);

    // Fetch, respond, and broadcast
    const [finalRow] = await pool.query(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
    const formatted = formatRow(cfg.table, finalRow[0]);
    broadcastChange(`${collection}/${id}`, formatted);

    const [allRows] = await pool.query(`SELECT * FROM ${cfg.table}`);
    broadcastChange(collection, allRows.map(r => formatRow(cfg.table, r)));

    res.status(200).json(formatted);
  } catch (error) {
    console.error(`Add document in ${collection} error:`, error);
    res.status(500).json({ error: "Lỗi thêm dữ liệu cơ sở dữ liệu" });
  }
}

// POST batch operations equivalent
export async function commitBatch(req, res) {
  const { operations } = req.body;
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: "Thiếu danh sách thao tác batch" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const op of operations) {
      // Simple parse url e.g. "/api/db/notifications/123"
      const parts = op.path.split("/");
      const collection = parts[3];
      const id = parts[4];
      const cfg = TABLE_MAPPING[collection];
      if (!cfg) throw new Error(`Batch path không hợp lệ: ${op.path}`);

      const body = op.body || {};

      if (op.method === "POST" || op.method === "PATCH") {
        const [existing] = await connection.query(`SELECT * FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
        const rowExists = existing.length > 0;
        const curRow = rowExists ? existing[0] : {};

        const dbPayload = {};
        for (const key of Object.keys(body)) {
          let curVal = curRow[key];
          if (isJsonCol(cfg.table, key)) {
            try {
              curVal = typeof curVal === "string" ? JSON.parse(curVal) : curVal;
            } catch (e) {}
          }
          const processed = processFieldUpdate(curVal, body[key]);
          dbPayload[key] = isJsonCol(cfg.table, key) ? JSON.stringify(processed) : processed;
        }

        if (rowExists) {
          const setClauses = Object.keys(dbPayload).map(k => `${k} = ?`).join(", ");
          const values = [...Object.values(dbPayload), id];
          await connection.query(`UPDATE ${cfg.table} SET ${setClauses} WHERE ${cfg.key} = ?`, values);
        } else {
          dbPayload[cfg.key] = id;
          if (cfg.filter) {
            const [[k, v]] = Object.entries(cfg.filter);
            dbPayload[k] = v;
          }
          const columns = Object.keys(dbPayload).join(", ");
          const placeholders = Object.keys(dbPayload).map(() => "?").join(", ");
          const values = Object.values(dbPayload);
          await connection.query(`INSERT INTO ${cfg.table} (${columns}) VALUES (${placeholders})`, values);
        }
      } else if (op.method === "DELETE") {
        await connection.query(`DELETE FROM ${cfg.table} WHERE ${cfg.key} = ?`, [id]);
      }
    }

    await connection.commit();

    // Trigger post-commit broadcasts for all modified paths (as a robust measure, trigger generic collection refreshes)
    const processedCollections = Array.from(new Set(operations.map(op => op.path.split("/")[3])));
    for (const col of processedCollections) {
      const cfg = TABLE_MAPPING[col];
      if (cfg) {
        const [allRows] = await pool.query(`SELECT * FROM ${cfg.table}`);
        broadcastChange(col, allRows.map(r => formatRow(cfg.table, r)));
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error("Batch commit transaction error:", error);
    res.status(500).json({ error: "Batch commit thất bại" });
  } finally {
    connection.release();
  }
}
