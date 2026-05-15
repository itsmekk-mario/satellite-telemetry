export interface SatelliteDataPoint {
  timestamp: number;
  packetId?: string;
  source?: string;

  // Environment (Sensors)
  altitude: number;      // km or m
  temperature: number;   // °C (External)
  internalTemp: number;  // °C (Avionics/Internal)
  pressure: number;      // hPa
  humidity: number;      // %

  // Power (Battery/Solar)
  battery: number;       // %
  voltage: number;       // V
  current: number;       // mA
  powerConsumption: number; // W
  solarGeneration: number;  // W

  // System (Ubuntu/Raspberry Pi)
  sysTemp: number;       // °C (CPU)
  cpuUsage: number;      // %
  memUsage: number;      // %
  diskUsage: number;     // %

  // Communications
  signalStrength: number; // dBm
  packetLoss: number;     // %

  // Kinematics & Attitude
  velocity: number;      // vertical speed or orbital velocity
  attitudeError: number; // deg
  attitude: {
    pitch: number;
    roll: number;
    yaw: number;
  };
  acceleration: {
    x: number;
    y: number;
    z: number;
  };
  
  // Location
  gps: {
    lat: number;
    lng: number;
    satellites: number;
  };

  camera?: {
    enabled: boolean;
    mode: 'standby' | 'capture' | 'downlink' | 'offline';
    frameId: string;
    exposureMs: number;
    gain: number;
    storageUsed: number;
    lastCapture?: string;
  };
}

export interface AnalysisResult {
  maxAltitude: number;
  avgTemp: number;
  minBattery: number;
  latestPacketAge: number;
  linkStatus: 'LIVE' | 'STALE' | 'NO_DATA';
  status: 'NORMAL' | 'DANGER';
  anomalies: string[];
  interpretation?: string;
  latestAlert?: {
    message: string;
    type: 'WARNING' | 'CRITICAL';
    timestamp: number;
  };
}
