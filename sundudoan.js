const Fastify = require("fastify");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const fastifyWebsocket = require("@fastify/websocket");

// Cấu hình
const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjB9.p56b5g73I9wyoVu4db679bOvVeFJWVjGDg_ulBXyav8";
const API_KEY = "duongd";
const PORT = process.env.PORT || 4000;

const fastify = Fastify({ logger: false });
fastify.register(require("@fastify/cors"), { origin: true });
fastify.register(fastifyWebsocket);

// Kết nối SQLite
const dbPath = path.resolve(__dirname, "sun.sql");
const db = new sqlite3.Database(dbPath);

// Route gốc
fastify.get("/", async (request, reply) => {
  return {
    status: "Sunwin API đang hoạt động",
    endpoints: [
      "/api/sunwin?key=duongd",
      "/api/history?key=duongd&limit=10",
      "/api/sunwin/taixiu/ws (WebSocket)"
    ]
  };
});

// Favicon
fastify.get("/favicon.ico", async (request, reply) => {
  reply.code(204).send();
});

// Kết nối WebSocket đến Sunwin
let ws = null;

function connectWebSocket() {
  ws = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  ws.on("open", () => {
    console.log("Đã kết nối WebSocket Sunwin");
    const authPayload = [101, "sub", "taixiu.history"];
    ws.send(JSON.stringify(authPayload));
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        json[1].htr.forEach((item) => {
          if (item.d1 && item.d2 && item.d3) {
            const total = item.d1 + item.d2 + item.d3;
            const result = total >= 11 ? "Tài" : "Xỉu";
            db.run(
              `INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [item.sid, item.d1, item.d2, item.d3, total, result, Date.now()]
            );
          }
        });
      }
    } catch (e) {
      console.error("Lỗi xử lý WebSocket:", e);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket đóng, thử kết nối lại sau 5 giây...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("Lỗi WebSocket:", err.message);
  });
}

// API: Kết quả gần nhất
fastify.get("/api/sunwin", async (request, reply) => {
  if (request.query.key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  const rows = await new Promise((resolve) => {
    db.all("SELECT * FROM sessions ORDER BY sid DESC LIMIT 1", (err, rows) => {
      resolve(rows || []);
    });
  });

  if (rows.length === 0) {
    return { error: "No data available" };
  }

  const last = rows[0];

  return {
    phien_cu: last.sid,
    ket_qua: last.result,
    xuc_xac: [last.d1, last.d2, last.d3],
    phien_moi: last.sid + 1
  };
});

// API: Lịch sử
fastify.get("/api/history", async (request, reply) => {
  if (request.query.key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  const limit = Math.min(parseInt(request.query.limit) || 50, 100);
  const rows = await new Promise((resolve) => {
    db.all("SELECT * FROM sessions ORDER BY sid DESC LIMIT ?", [limit], (err, rows) => {
      resolve(rows || []);
    });
  });

  return rows;
});

// WebSocket API
fastify.get("/api/sunwin/taixiu/ws", { websocket: true }, (connection) => {
  connection.socket.on("message", (message) => {
    console.log("Client WebSocket gửi:", message.toString());
  });
});

// Tạo bảng và khởi động
const start = async () => {
  try {
    await new Promise((resolve) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS sessions (
          sid INTEGER PRIMARY KEY,
          d1 INTEGER NOT NULL,
          d2 INTEGER NOT NULL,
          d3 INTEGER NOT NULL,
          total INTEGER NOT NULL,
          result TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )`,
        resolve
      );
    });

    connectWebSocket();
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
  } catch (err) {
    console.error("Lỗi khi khởi động server:", err);
    process.exit(1);
  }
};

start();