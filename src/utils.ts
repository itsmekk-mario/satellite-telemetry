import { SatelliteDataPoint, AnalysisResult } from './types';

type RawTelemetryInput = SatelliteDataPoint | SatelliteDataPoint[] | {
  data?: SatelliteDataPoint | SatelliteDataPoint[];
  telemetry?: SatelliteDataPoint | SatelliteDataPoint[];
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toNumber = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseTimestamp = (value: unknown, fallback: number): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return fallback;
};

const normalizePoint = (raw: unknown, index: number): SatelliteDataPoint | null => {
  if (!isObject(raw)) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const timestamp = parseTimestamp(raw.timestamp ?? raw.time ?? raw.t, nowSeconds + index);
  const attitude = isObject(raw.attitude) ? raw.attitude : {};
  const acceleration = isObject(raw.acceleration) ? raw.acceleration : {};
  const gps = isObject(raw.gps) ? raw.gps : {};
  const camera = isObject(raw.camera) ? raw.camera : {};
  const altitude = toNumber(raw.altitude, 0);
  const battery = Math.max(0, Math.min(100, toNumber(raw.battery ?? raw.battery_level, 0)));
  const internalTemp = toNumber(raw.internalTemp ?? raw.internal_temp, 0);
  const cpuLoad = Math.max(0, Math.min(100, toNumber(raw.cpuUsage ?? raw.cpu_load, 0)));
  const attitudeError = toNumber(raw.attitudeError ?? raw.attitude_error, 0);
  const signalStrength = toNumber(raw.signalStrength ?? raw.signal_strength, 0);
  const cameraMode = typeof camera.mode === 'string' ? camera.mode : altitude > 1000 && battery > 15 ? 'capture' : battery > 0 ? 'standby' : 'offline';

  return {
    timestamp,
    packetId: typeof raw.packetId === 'string' ? raw.packetId : typeof raw.packet_id === 'string' ? raw.packet_id : undefined,
    source: typeof raw.source === 'string' ? raw.source : 'raspberry-pi',
    altitude,
    temperature: toNumber(raw.temperature ?? raw.temp ?? raw.external_temp, 0),
    internalTemp,
    pressure: toNumber(raw.pressure ?? raw.pressure_hpa, 0),
    humidity: toNumber(raw.humidity, 0),
    battery,
    voltage: toNumber(raw.voltage ?? raw.battery_voltage, 0),
    current: toNumber(raw.current, 0),
    powerConsumption: toNumber(raw.powerConsumption ?? raw.power_consumption, 0),
    solarGeneration: toNumber(raw.solarGeneration ?? raw.solar_generation, 0),
    sysTemp: toNumber(raw.sysTemp ?? raw.cpuTemp, internalTemp),
    cpuUsage: cpuLoad,
    memUsage: Math.max(0, Math.min(100, toNumber(raw.memUsage, 0))),
    diskUsage: Math.max(0, Math.min(100, toNumber(raw.diskUsage, 0))),
    signalStrength,
    packetLoss: Math.max(0, Math.min(100, toNumber(raw.packetLoss ?? raw.packet_loss, 0))),
    velocity: toNumber(raw.velocity ?? raw.vertical_speed, 0),
    attitudeError,
    attitude: {
      pitch: toNumber(attitude.pitch, attitudeError),
      roll: toNumber(attitude.roll, 0),
      yaw: toNumber(attitude.yaw, 0),
    },
    acceleration: {
      x: toNumber(acceleration.x, 0),
      y: toNumber(acceleration.y, 0),
      z: toNumber(acceleration.z, 0),
    },
    gps: {
      lat: toNumber(gps.lat, 0),
      lng: toNumber(gps.lng ?? gps.lon, 0),
      satellites: toNumber(gps.satellites, 0),
    },
    camera: {
      enabled: typeof camera.enabled === 'boolean' ? camera.enabled : battery > 0,
      mode: ['standby', 'capture', 'downlink', 'offline'].includes(cameraMode) ? cameraMode as SatelliteDataPoint['camera']['mode'] : 'standby',
      frameId: typeof camera.frameId === 'string' ? camera.frameId : `CAM-${String(index + 1).padStart(5, '0')}`,
      exposureMs: toNumber(camera.exposureMs, altitude > 1000 ? 8 : 16),
      gain: toNumber(camera.gain, altitude > 1000 ? 1.4 : 1.0),
      storageUsed: Math.max(0, Math.min(100, toNumber(camera.storageUsed, Math.min(92, index * 0.25)))),
      lastCapture: typeof camera.lastCapture === 'string' ? camera.lastCapture : typeof camera.last_capture === 'string' ? camera.last_capture : new Date(timestamp * 1000).toISOString(),
    },
  };
};

export const normalizeTelemetryInput = (input: RawTelemetryInput): SatelliteDataPoint[] | null => {
  const candidate = isObject(input) && ('data' in input || 'telemetry' in input)
    ? input.data ?? input.telemetry
    : input;
  const rawPoints = Array.isArray(candidate) ? candidate : [candidate];
  const points = rawPoints
    .map((point, index) => normalizePoint(point, index))
    .filter((point): point is SatelliteDataPoint => Boolean(point));

  return points.length > 0 ? points : null;
};

export const validateJSON = (data: any): data is SatelliteDataPoint[] => {
  return Boolean(normalizeTelemetryInput(data));
};

export const analyzeSatelliteData = (data: SatelliteDataPoint[]): AnalysisResult => {
  let maxAlt = -Infinity;
  let totalTemp = 0;
  let minBat = Infinity;
  const anomalies: string[] = [];
  let latestAlert: AnalysisResult['latestAlert'] = undefined;

  data.forEach((p, i) => {
    if (p.altitude > maxAlt) maxAlt = p.altitude;
    if (p.battery < minBat) minBat = p.battery;
    totalTemp += p.temperature;

    // Accident Detection
    if (i > 0) {
      const tempDiff = Math.abs(p.temperature - data[i-1].temperature);
      if (tempDiff > 10) {
        anomalies.push(`급격한 온도 변화 감지 (${p.timestamp}s): ${tempDiff.toFixed(1)}°C 차이`);
        latestAlert = { message: `급격한 온도 변화: ${tempDiff.toFixed(1)}°C 하락/상승`, type: 'WARNING', timestamp: p.timestamp };
      }

      if (p.attitude && data[i-1].attitude) {
        const pitchDiff = Math.abs(p.attitude.pitch - data[i-1].attitude.pitch);
        if (pitchDiff > 20) {
          anomalies.push(`자세 제어 이상 감지 (${p.timestamp}s): 피치각 급변`);
          latestAlert = { message: "자세 제어 이상 (Attitude Control Failure)", type: 'CRITICAL', timestamp: p.timestamp };
        }
      }
      
      const altDiff = p.altitude - data[i-1].altitude;
      if (altDiff < -500) {
         anomalies.push(`고도 급강하 (${p.timestamp}s): ${altDiff.toFixed(1)}m`);
         latestAlert = { message: "위험: 고도 급강하 (추락 의심)", type: 'CRITICAL', timestamp: p.timestamp };
      }
    }
    
    // Status Determination
    if (p.temperature < -50 || p.temperature > 80) {
      anomalies.push(`극한 온도 도달 (${p.timestamp}s): ${p.temperature}°C`);
      latestAlert = { message: `극한 온도 도달: ${p.temperature}°C`, type: 'CRITICAL', timestamp: p.timestamp };
    }
    if (p.battery < 15) {
      anomalies.push(`저전력 상태 (${p.timestamp}s): ${p.battery}%`);
      if (!latestAlert || latestAlert.type !== 'CRITICAL') {
         latestAlert = { message: `배터리 부족: ${p.battery}%`, type: 'WARNING', timestamp: p.timestamp };
      }
    }
    if (p.packetLoss > 10) {
      anomalies.push(`통신 패킷 손실 증가 (${p.timestamp}s): ${p.packetLoss}%`);
      if (!latestAlert || latestAlert.type !== 'CRITICAL') {
        latestAlert = { message: `패킷 손실 증가: ${p.packetLoss}%`, type: 'WARNING', timestamp: p.timestamp };
      }
    }
    if (p.signalStrength !== 0 && p.signalStrength < -115) {
      anomalies.push(`수신 신호 약화 (${p.timestamp}s): ${p.signalStrength} dBm`);
      if (!latestAlert || latestAlert.type !== 'CRITICAL') {
        latestAlert = { message: `RF 링크 약화: ${p.signalStrength} dBm`, type: 'WARNING', timestamp: p.timestamp };
      }
    }
    if (p.attitudeError > 15) {
      anomalies.push(`자세 오차 초과 (${p.timestamp}s): ${p.attitudeError}°`);
      latestAlert = { message: `자세 오차 초과: ${p.attitudeError}°`, type: 'CRITICAL', timestamp: p.timestamp };
    }
    if (p.sysTemp > 75) {
      anomalies.push(`라즈베리파이 CPU 과열 (${p.timestamp}s): ${p.sysTemp}°C`);
      latestAlert = { message: `CPU 과열: ${p.sysTemp}°C`, type: 'CRITICAL', timestamp: p.timestamp };
    }
    if (p.voltage > 0 && p.voltage < 3.35) {
      anomalies.push(`저전압 감지 (${p.timestamp}s): ${p.voltage}V`);
      if (!latestAlert || latestAlert.type !== 'CRITICAL') {
        latestAlert = { message: `전원 저전압: ${p.voltage}V`, type: 'WARNING', timestamp: p.timestamp };
      }
    }
    if (p.gps.satellites > 0 && p.gps.satellites < 4) {
      anomalies.push(`GPS 위성 수 부족 (${p.timestamp}s): ${p.gps.satellites}개`);
    }
  });

  const avgTemp = data.length > 0 ? totalTemp / data.length : 0;
  const latestPacketAge = data.length > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - data[data.length - 1].timestamp) : Infinity;
  const linkStatus = data.length === 0 ? 'NO_DATA' : latestPacketAge > 30 ? 'STALE' : 'LIVE';
  const isDanger = anomalies.length > 3 || minBat < 10 || latestAlert?.type === 'CRITICAL' || linkStatus === 'STALE';

  return {
    maxAltitude: maxAlt === -Infinity ? 0 : maxAlt,
    avgTemp,
    minBattery: minBat === Infinity ? 0 : minBat,
    latestPacketAge,
    linkStatus,
    status: isDanger ? 'DANGER' : 'NORMAL',
    anomalies: Array.from(new Set(anomalies)), // Unique
    latestAlert
  };
};

export const generateMockDataPoint = (i: number): SatelliteDataPoint => ({
  timestamp: i * 10,
  altitude: 34000 + Math.sin(i / 5) * 500 + i * 10,
  temperature: -40 + Math.random() * 10 - (i > 30 ? (i - 30) * 2 : 0),
  pressure: 10 + Math.random() * 2,
  humidity: 5 + Math.random() * 2,
  battery: Math.max(0, 100 - i * 0.5),
  voltage: Math.max(3.0, 4.2 - i * 0.01),
  current: 120 + Math.random() * 10,
  internalTemp: 34 + Math.random() * 3,
  powerConsumption: 0.6 + Math.random() * 0.05,
  solarGeneration: 0.75 + Math.random() * 0.08,
  sysTemp: 45 + Math.random() * 5 + (i > 40 ? 20 : 0),
  cpuUsage: 10 + Math.random() * 20,
  memUsage: 30 + Math.random() * 5,
  diskUsage: 15,
  signalStrength: -58 - i * 0.4,
  packetLoss: Math.max(0, i - 35) * 1.5,
  velocity: 7.5 + Math.random() * 0.2,
  attitudeError: Math.random() * 3 + (i > 45 ? 20 : 0),
  attitude: {
    pitch: Math.random() * 5 + (i > 45 ? 25 : 0), // Cause anomaly near end
    roll: Math.random() * 5,
    yaw: Math.random() * 5,
  },
  acceleration: { x: 0, y: 0, z: 9.8 },
  gps: { lat: 37.5 + i*0.001, lng: 127.0 + i*0.001, satellites: 8 },
  camera: {
    enabled: true,
    mode: i % 12 === 0 ? 'downlink' : 'capture',
    frameId: `SIM-CAM-${String(i + 1).padStart(5, '0')}`,
    exposureMs: 8,
    gain: 1.4,
    storageUsed: Math.min(95, i * 0.8),
    lastCapture: new Date(Date.now() - (50 - i) * 2000).toISOString(),
  }
});

export const generateMockData = (length: number = 50): SatelliteDataPoint[] => {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length }, (_, i) => ({
    ...generateMockDataPoint(i),
    timestamp: now - (length - i) * 2,
    packetId: `SIM-${String(i + 1).padStart(4, '0')}`,
    source: 'simulator',
  }));
};

export const mockData: SatelliteDataPoint[] = generateMockData();
