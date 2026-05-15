# RaspberrySat Telemetry Console

라즈베리파이 기반 위성/캔위성 텔레메트리 모니터링 대시보드입니다. Pi에서 센서 데이터를 `POST /api/telemetry`로 보내면 브라우저가 실시간으로 수신하고, 전력/온도/자세/GPS/시스템 상태 이상을 감지합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

AI 해석 기능을 쓰려면 `.env.local`에 Gemini 키를 넣습니다.

```bash
GEMINI_API_KEY="YOUR_KEY"
```

키가 없어도 실시간 수신, 그래프, 규칙 기반 이상 감지는 동작합니다.

## 라즈베리파이에서 데이터 보내기

대시보드 서버가 실행 중인 컴퓨터의 IP를 확인한 뒤 Pi에서 아래처럼 실행합니다.

```bash
export DASHBOARD_URL="http://서버IP:3000/api/telemetry"
python3 pi_telemetry_client.py
```

전송 주기는 기본 2초입니다.

```bash
SAT_INTERVAL=1 python3 pi_telemetry_client.py
```

## 텔레메트리 JSON 형식

단일 객체, 배열, `{ "data": [...] }`, `{ "telemetry": {...} }` 모두 받을 수 있습니다. 일부 값이 문자열이어도 숫자로 변환합니다.

```json
{
  "timestamp": 1710000000,
  "packetId": "PI-000001",
  "source": "raspberry-pi",
  "altitude": 120.5,
  "temperature": 21.8,
  "pressure": 1012.7,
  "humidity": 38.2,
  "battery": 96.4,
  "voltage": 4.08,
  "current": 180,
  "sysTemp": 48.5,
  "cpuUsage": 24,
  "memUsage": 35,
  "diskUsage": 12,
  "velocity": 0.02,
  "attitude": { "pitch": 0.4, "roll": -0.2, "yaw": 16.5 },
  "acceleration": { "x": 0.01, "y": 0.03, "z": 9.8 },
  "gps": { "lat": 37.5665, "lng": 126.978, "satellites": 8 }
}
```

## API

- `POST /api/telemetry`: Pi 텔레메트리 수신 및 대시보드로 브로드캐스트
- `GET /api/stream`: 브라우저 SSE 실시간 스트림
- `GET /api/health`: 서버 상태, 연결된 브라우저 수, 마지막 수신 시각 확인
- `POST /api/analyze`: Gemini 기반 한국어 상태 해석
