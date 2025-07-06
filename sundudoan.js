const Fastify = require("fastify");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fastifyWebsocket = require("@fastify/websocket");

const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjB9.p56b5g73I9wyoVu4db679bOvVeFJWVjGDg_ulBXyav8";
const API_KEY = "duongd";
const PORT = process.env.PORT || 4000;

const fastify = Fastify({ logger: false });
fastify.register(require("@fastify/cors"), { origin: true });
fastify.register(fastifyWebsocket);

const dbPath = path.resolve(__dirname, "sun.sql");
const db = new sqlite3.Database(dbPath);

// ✅ Route / hiển thị luôn kết quả mới nhất
fastify.get("/", async (request, reply) => {
  const row = await new Promise((resolve) => {
    db.get("SELECT * FROM sessions ORDER BY sid DESC LIMIT 1", (err, row) => {
      resolve(row || null);
    });
  });

  return {
    status: "Sunwin API đang hoạt động",
    endpoints: [
      "/api/sunwin?key=duongd",
      "/api/history?key=duongd&limit=10",
      "/api/sunwin/taixiu/ws (WebSocket)"
    ],
    ket_qua_moi_nhat: row
      ? {
          phien_cu: row.sid,
          ket_qua: row.result,
          xuc_xac: [row.d1, row.d2, row.d3],
          phien_moi: row.sid + 1
        }
      : "Chưa có dữ liệu"
  };
});

// Favicon
fastify.get("/favicon.ico", async (request, reply) => {
  reply.code(204).send();
});

// WebSocket Sunwin

let ws = null;
let pingInterval = null;

function connectWebSocket() {
  ws = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  ws.on("open", () => {
    console.log("✅ Đã kết nối WebSocket Sunwin");

    // Gửi xác thực đăng ký nhận dữ liệu
    const authPayload = [101, "sub", "taixiu.history"];
    ws.send(JSON.stringify(authPayload));

    // Gửi ping giữ kết nối mỗi 10 giây
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 10000);
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
    console.log("⚠️ WebSocket đóng, thử kết nối lại sau 5 giây...");
    clearInterval(pingInterval);
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ Lỗi WebSocket:", err.message);
  });
}