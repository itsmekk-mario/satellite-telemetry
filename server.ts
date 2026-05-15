import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { normalizeTelemetryInput } from "./src/utils";

dotenv.config();

const clients = new Set<express.Response>();
let lastTelemetryAt = 0;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "1mb" }));

  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  }) : null;

  // API Routes
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.add(res);
    
    // Send ping every 15s to keep connection alive
    const ping = setInterval(() => {
      res.write(':ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      clients: clients.size,
      lastTelemetryAt,
      linkStatus: lastTelemetryAt && Date.now() - lastTelemetryAt < 30000 ? 'LIVE' : 'STALE',
    });
  });

  app.post('/api/telemetry', (req, res) => {
    const data = normalizeTelemetryInput(req.body);
    if (!data) {
      return res.status(400).json({
        success: false,
        error: "Invalid telemetry payload. Send one point, an array, or { data: [...] }.",
      });
    }

    lastTelemetryAt = Date.now();
    // Broadcast to all connected SSE clients
    clients.forEach(client => {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
    res.json({ success: true, accepted: data.length, clients: clients.size });
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: "No data provided" });
      }
      if (!ai) {
        return res.json({
          interpretation: "GEMINI_API_KEY가 설정되지 않아 로컬 규칙 기반 판정만 사용 중입니다. 대시보드의 상태, 전력, 온도, 자세 이상 알림은 계속 동작합니다.",
        });
      }

      const prompt = `
        You are a satellite mission control expert. Analyze the following satellite telemetry data and provide a human-readable interpretation of the current mission state.
        Your final response must naturally include a clear, easy-to-read conclusion sentence like "현재 전력이 부족함" or "현재 궤도와 상태가 매우 안정적임" so anyone can understand the status instantly.

        Focus on:
        1. Overall health status.
        2. Power levels (battery).
        3. Thermal state (temperature).
        4. Any detected anomalies.
        5. Concise recommendations.

        Data (JSON):
        ${JSON.stringify(data, null, 2)}

        Response should be in Korean as requested by the user.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      res.json({ interpretation: result.text });
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
