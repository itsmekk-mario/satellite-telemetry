# RaspberrySat Telemetry Console

라즈베리파이, 캔위성, 큐브위성 실험에서 들어오는 텔레메트리를 실시간으로 확인하는 미션 콘솔입니다. 라즈베리파이에서 `POST /api/telemetry`로 센서 데이터를 보내면 브라우저 대시보드가 SSE(Server-Sent Events)로 즉시 받아서 전력, 온도, 자세, GPS, 통신, 시스템 상태를 시각화하고 이상 징후를 표시합니다.

Gemini API 키를 설정하면 현재 텔레메트리 상태를 한국어로 요약하는 AI 해석도 사용할 수 있습니다. 키가 없어도 실시간 수신, 그래프, JSON 재생, 규칙 기반 이상 감지는 그대로 동작합니다.

## 주요 기능

- 실시간 텔레메트리 수신: 라즈베리파이 또는 외부 장치가 보낸 JSON을 대시보드에 즉시 반영합니다.
- 미션 상태판: 전력, 태양광/부하, OBC, 자세, 통신, 카메라, SSE 링크 상태를 한눈에 확인합니다.
- 사고/이상 감지: 저전력, CPU 과열, 저전압, 자세 오차, 패킷 손실, GPS 위성 수 부족 등을 규칙 기반으로 감지합니다.
- JSON 파일 재생: 저장된 텔레메트리 JSON을 업로드하고 실제 수신처럼 재생할 수 있습니다.
- API 상태 확인: `/api/health`로 연결된 브라우저 수, 마지막 수신 시각, 링크 상태를 확인합니다.
- 선택형 AI 해석: Gemini API 키가 있으면 `/api/analyze`로 현재 상태를 한국어로 요약합니다.

## 프로젝트 구성

```text
.
├── server.ts                         # Express API + Vite 개발 서버
├── src/
│   ├── components/Dashboard.tsx      # React 대시보드 화면
│   ├── types.ts                      # 텔레메트리 타입 정의
│   └── utils.ts                      # JSON 정규화, 분석, 모의 데이터
├── pi_telemetry_client.py            # 라즈베리파이 전송 예제 클라이언트
├── se3c_cubesat_extended_telemetry.json
├── .env.example
└── package.json
```

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

서버가 실행되면 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3000
```

서버는 `0.0.0.0`에 바인딩되므로 같은 네트워크의 라즈베리파이에서도 `http://서버IP:3000`으로 접근할 수 있습니다.

## Gemini AI 해석 설정

AI 해석 기능을 사용하려면 `.env.example`을 참고해 프로젝트 루트에 `.env` 파일을 만들고 `GEMINI_API_KEY`를 설정합니다.

```bash
cp .env.example .env
```

`.env`:

```bash
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

그 다음 서버를 다시 시작합니다.

```bash
npm run dev
```

API 키가 없으면 AI 해석 대신 “로컬 규칙 기반 판정만 사용 중”이라는 안내가 표시됩니다.

## 라즈베리파이에서 텔레메트리 보내기

### 1. 지상국 서버 IP 확인

대시보드를 실행 중인 컴퓨터의 로컬 IP를 확인합니다.

macOS:

```bash
ipconfig getifaddr en0
```

Linux/Raspberry Pi:

```bash
hostname -I
```

예를 들어 지상국 컴퓨터 IP가 `192.168.0.10`이면 라즈베리파이에서 아래처럼 실행합니다.

```bash
export DASHBOARD_URL="http://192.168.0.10:3000/api/telemetry"
python3 pi_telemetry_client.py
```

기본 전송 주기는 2초입니다. 더 자주 보내고 싶으면 `SAT_INTERVAL`을 설정합니다.

```bash
SAT_INTERVAL=1 python3 pi_telemetry_client.py
```

장치 이름을 바꾸고 싶으면 `SAT_SOURCE`를 설정합니다.

```bash
SAT_SOURCE="raspberry-pi-zero-2w" python3 pi_telemetry_client.py
```

## curl로 테스트하기

라즈베리파이 없이도 터미널에서 바로 수신 테스트를 할 수 있습니다.

```bash
curl -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": 1710000000,
    "packetId": "TEST-000001",
    "source": "curl-test",
    "altitude": 120.5,
    "temperature": 21.8,
    "battery": 96.4,
    "voltage": 4.08,
    "sysTemp": 48.5,
    "cpuUsage": 24,
    "attitude": { "pitch": 0.4, "roll": -0.2, "yaw": 16.5 },
    "gps": { "lat": 37.5665, "lng": 126.978, "satellites": 8 }
  }'
```

정상 수신되면 다음과 비슷한 응답을 받습니다.

```json
{
  "success": true,
  "accepted": 1,
  "clients": 1
}
```

## 텔레메트리 JSON 형식

서버는 아래 입력 형식을 모두 받을 수 있습니다.

- 단일 객체: `{ ... }`
- 배열: `[{ ... }, { ... }]`
- `data` 래퍼: `{ "data": [{ ... }] }`
- `telemetry` 래퍼: `{ "telemetry": { ... } }`

일부 값은 문자열로 들어와도 숫자로 변환합니다. 누락된 필드는 기본값으로 보정되므로 최소한의 센서 값부터 보내면서 확장할 수 있습니다.

```json
{
  "timestamp": 1710000000,
  "packetId": "PI-000001",
  "source": "raspberry-pi",
  "altitude": 120.5,
  "temperature": 21.8,
  "internalTemp": 34.2,
  "pressure": 1012.7,
  "humidity": 38.2,
  "battery": 96.4,
  "voltage": 4.08,
  "current": 180,
  "powerConsumption": 0.65,
  "solarGeneration": 0.8,
  "sysTemp": 48.5,
  "cpuUsage": 24,
  "memUsage": 35,
  "diskUsage": 12,
  "signalStrength": -72,
  "packetLoss": 0,
  "velocity": 0.02,
  "attitudeError": 1.2,
  "attitude": {
    "pitch": 0.4,
    "roll": -0.2,
    "yaw": 16.5
  },
  "acceleration": {
    "x": 0.01,
    "y": 0.03,
    "z": 9.8
  },
  "gps": {
    "lat": 37.5665,
    "lng": 126.978,
    "satellites": 8
  },
  "camera": {
    "enabled": true,
    "mode": "capture",
    "frameId": "CAM-00001",
    "exposureMs": 8,
    "gain": 1.4,
    "storageUsed": 12.5,
    "lastCapture": "2026-05-15T06:00:00.000Z"
  }
}
```

## 자주 쓰는 API

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/api/telemetry` | 텔레메트리 JSON을 수신하고 연결된 브라우저에 브로드캐스트합니다. |
| `GET` | `/api/stream` | 브라우저가 구독하는 SSE 실시간 스트림입니다. |
| `GET` | `/api/health` | 서버 상태, 연결된 클라이언트 수, 마지막 수신 시각, 링크 상태를 반환합니다. |
| `POST` | `/api/analyze` | Gemini 기반 한국어 상태 해석을 요청합니다. |

## 빌드와 실행

운영용 번들을 만들려면 아래 명령을 사용합니다.

```bash
npm run build
```

빌드 결과를 실행합니다.

```bash
npm start
```

포트를 바꾸고 싶으면 `PORT` 환경 변수를 지정합니다.

```bash
PORT=8080 npm run dev
```

## 문제 해결

### 대시보드는 열리는데 Pi 데이터가 안 들어옵니다

- 라즈베리파이의 `DASHBOARD_URL`이 `http://서버IP:3000/api/telemetry` 형태인지 확인합니다.
- 서버와 라즈베리파이가 같은 네트워크에 있는지 확인합니다.
- 지상국 컴퓨터 방화벽이 3000번 포트를 막고 있지 않은지 확인합니다.
- `GET /api/health`에서 `clients`와 `lastTelemetryAt` 값을 확인합니다.

### `linkStatus`가 `STALE`로 보입니다

마지막 텔레메트리 수신 후 30초 이상 새 데이터가 오지 않으면 `STALE`로 표시됩니다. Pi 클라이언트가 실행 중인지, 전송 주기와 네트워크 연결을 확인합니다.

### AI 해석이 동작하지 않습니다

- 프로젝트 루트에 `.env` 파일이 있는지 확인합니다.
- `GEMINI_API_KEY` 값이 설정되어 있는지 확인합니다.
- 키를 추가한 뒤 `npm run dev` 서버를 다시 시작합니다.

### JSON 업로드가 실패합니다

업로드 파일이 UTF-8 JSON인지 확인합니다. 서버와 대시보드는 단일 객체, 배열, `{ "data": [...] }`, `{ "telemetry": ... }` 형식을 지원합니다.

## 개발용 명령어

```bash
npm run dev      # 개발 서버 실행
npm run build    # 프론트엔드와 서버 번들 빌드
npm start        # dist/server.cjs 실행
npm run lint     # TypeScript 타입 검사
npm run clean    # 빌드 산출물 삭제
```
