import React, { useState, useRef, useEffect } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { Upload, AlertTriangle, CheckCircle, Box, Database, Radio, Gauge, Cpu, MapPin, Terminal, Server, Navigation, ShieldCheck, Play, Pause, RotateCcw, Camera, HardDrive, Zap } from 'lucide-react';
import { SatelliteDataPoint, AnalysisResult } from '../types';
import { validateJSON, normalizeTelemetryInput, analyzeSatelliteData, mockData } from '../utils';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard() {
  const [data, setData] = useState<SatelliteDataPoint[]>(mockData);
  const [result, setResult] = useState<AnalysisResult>(analyzeSatelliteData(mockData));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<keyof SatelliteDataPoint>('altitude');
  const [playbackData, setPlaybackData] = useState<SatelliteDataPoint[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(750);

  const telemetrySignals: { key: keyof SatelliteDataPoint, label: string }[] = [
    { key: 'altitude', label: 'Altitude (m)' },
    { key: 'temperature', label: 'External Temp (°C)' },
    { key: 'internalTemp', label: 'Internal Temp (°C)' },
    { key: 'humidity', label: 'Humidity (%)' },
    { key: 'battery', label: 'Battery (%)' },
    { key: 'voltage', label: 'Voltage (V)' },
    { key: 'powerConsumption', label: 'Power Use (W)' },
    { key: 'solarGeneration', label: 'Solar Gen (W)' },
    { key: 'signalStrength', label: 'Signal (dBm)' },
    { key: 'pressure', label: 'Pressure (hPa)' },
    { key: 'velocity', label: 'Vertical Speed (m/s)' },
    { key: 'cpuUsage', label: 'CPU Load (%)' },
    { key: 'packetLoss', label: 'Packet Loss (%)' },
    { key: 'attitudeError', label: 'Attitude Error (°)' },
  ];

  const latestData = data[data.length - 1];
  const packetCount = data.length;
  const lastSeenText = latestData
    ? `${result.latestPacketAge === Infinity ? '-' : result.latestPacketAge}s ago`
    : 'No packet';
  const missionPhase = latestData?.altitude > 100000 ? 'Orbit' : latestData?.altitude > 30000 ? 'Near Space' : 'Ascent/Test';
  const activeSignal = telemetrySignals.find(sig => sig.key === selectedSignal);
  const fullSignalValues = playbackData
    .map(point => point[selectedSignal])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const fullSignalMin = fullSignalValues.length ? Math.min(...fullSignalValues) : 0;
  const fullSignalMax = fullSignalValues.length ? Math.max(...fullSignalValues) : 0;
  const fullDatasetResult = analyzeSatelliteData(playbackData);
  const latestPacketJson = latestData ? JSON.stringify(latestData, null, 2) : 'No packet received yet';
  const pythonSnippet = `export DASHBOARD_URL="http://GROUND_STATION_IP:3000/api/telemetry"
python3 pi_telemetry_client.py`;
  const curlSnippet = latestData
    ? `curl -X POST http://localhost:3000/api/telemetry \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(latestData)}'`
    : `curl -X POST http://localhost:3000/api/telemetry \\
  -H 'Content-Type: application/json' \\
  -d '{"timestamp":1710000000,"altitude":120,"temperature":22,"battery":96}'`;
  const healthRows = [
    { label: 'EPS / Power', value: `${(latestData?.battery || 0).toFixed(1)}% / ${(latestData?.voltage || 0).toFixed(2)}V`, ok: (latestData?.battery || 0) > 20 && (latestData?.voltage || 0) >= 6.5 },
    { label: 'Solar / Load', value: `${(latestData?.solarGeneration || 0).toFixed(3)}W / ${(latestData?.powerConsumption || 0).toFixed(3)}W`, ok: (latestData?.solarGeneration || 0) >= (latestData?.powerConsumption || 0) || (latestData?.battery || 0) > 40 },
    { label: 'OBC / Raspberry Pi', value: `${(latestData?.internalTemp || 0).toFixed(1)}°C / ${(latestData?.cpuUsage || 0).toFixed(1)}%`, ok: (latestData?.internalTemp || 0) < 55 && (latestData?.cpuUsage || 0) < 90 },
    { label: 'ADCS / Attitude', value: `${(latestData?.attitudeError || 0).toFixed(1)}° error`, ok: (latestData?.attitudeError || 0) < 15 },
    { label: 'COMMS / UHF', value: `${(latestData?.signalStrength || 0).toFixed(1)} dBm / ${(latestData?.packetLoss || 0).toFixed(1)}% loss`, ok: (latestData?.signalStrength || 0) > -115 && (latestData?.packetLoss || 0) < 10 },
    { label: 'Payload Camera', value: latestData?.camera ? `${latestData.camera.mode.toUpperCase()} / ${latestData.camera.frameId}` : 'standby', ok: latestData?.camera?.enabled !== false },
    { label: 'TM Link / SSE', value: isLive ? 'CONNECTED' : 'DISCONNECTED', ok: isLive },
  ];

  const appendTelemetryPoints = (points: SatelliteDataPoint[], preserveInterpretation = true) => {
    if (points.length === 0) return;

    setData(prev => {
      let updated = [...prev, ...points];
      if (updated.length > 50) updated = updated.slice(updated.length - 50);

      const analysis = analyzeSatelliteData(updated);
      setResult(prevRes => ({
        ...analysis,
        interpretation: preserveInterpretation ? prevRes.interpretation : analysis.interpretation,
      }));

      if (analysis.latestAlert) {
        setActiveAlert(analysis.latestAlert);
      }

      return updated;
    });
  };

  const seekPlayback = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, playbackData.length));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const visibleWindow = playbackData
      .slice(Math.max(0, boundedIndex - 50), boundedIndex)
      .map((point, index, window) => ({
        ...point,
        timestamp: nowSeconds - (window.length - index),
        source: point.source || 'json-playback',
      }));

    setPlaybackIndex(boundedIndex);
    setData(visibleWindow);
    const analysis = analyzeSatelliteData(visibleWindow);
    setResult(prev => ({ ...analysis, interpretation: prev.interpretation }));
  };

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');
    eventSource.onopen = () => setIsLive(true);
    eventSource.onerror = () => setIsLive(false);

    eventSource.onmessage = (e) => {
      try {
        if (e.data === ':ping') return;
        const newData = JSON.parse(e.data);
        if (!newData) return;
        const normalized = normalizeTelemetryInput(newData);
        if (!normalized) return;

        appendTelemetryPoints(normalized);
      } catch (err) {}
    };

    return () => {
      eventSource.close();
      setIsLive(false);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    if (playbackIndex >= playbackData.length) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      const sourcePoint = playbackData[playbackIndex];
      appendTelemetryPoints([{
        ...sourcePoint,
        timestamp: Math.floor(Date.now() / 1000),
        source: sourcePoint.source || 'json-playback',
      }]);
      setPlaybackIndex(index => index + 1);
    }, playbackSpeedMs);

    return () => clearTimeout(timer);
  }, [isPlaying, playbackIndex, playbackData, playbackSpeedMs]);

  useEffect(() => {
    if (activeAlert) {
      const timer = setTimeout(() => setActiveAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeAlert]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '').replace(/^\uFEFF/, '');
        const json = JSON.parse(text);
        if (validateJSON(json)) {
          const normalized = normalizeTelemetryInput(json) || [];
          setPlaybackData(normalized);
          setPlaybackIndex(0);
          setIsPlaying(false);
          setData([]);
          const analysis = analyzeSatelliteData([]);
          setResult(analysis);
        } else {
          setError("제공된 JSON 데이터 형식이 올바르지 않습니다.");
        }
      } catch (err) {
        setError("JSON 파일을 파싱하는 데 실패했습니다.");
      }
    };
    reader.readAsText(file);
  };

  const startPlayback = () => {
    if (playbackData.length === 0) return;
    if (playbackIndex >= playbackData.length) {
      seekPlayback(0);
    }
    setIsPlaying(true);
  };

  const pausePlayback = () => {
    setIsPlaying(false);
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    seekPlayback(0);
  };

  const fetchInterpretation = async (satelliteData: SatelliteDataPoint[], currentResult: AnalysisResult) => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: satelliteData })
      });
      const aiData = await res.json();
      setResult(prev => ({ ...prev, interpretation: aiData.interpretation }));
    } catch (err) {
      console.error("AI Analysis failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col font-sans">
      {/* Header */}
      <header className="h-[64px] px-6 flex items-center justify-between border-b border-[#1f2937] bg-[#07090d] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${result.status === 'NORMAL' ? 'bg-[#22c55e]' : 'bg-[#ef4444]'} shadow-[0_0_12px_currentColor]`} aria-hidden="true" />
          <div>
            <h1 className="text-[15px] font-semibold tracking-[0.12em] uppercase">RaspberrySat Mission Operations Center</h1>
            <div className="font-mono text-[10px] text-[#94a3b8]">GS-01 / PI-SAT / Telemetry, Tracking & Command</div>
          </div>
          <span className="font-mono text-[11px] text-[#22c55e] bg-[#22c55e]/10 px-2 py-1 rounded-[4px] border border-[#22c55e]/20 uppercase">
            {result.linkStatus}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="font-mono text-[11px] text-[#a1a1aa]">
            MET: {lastSeenText} | PKT {packetCount.toString().padStart(5, '0')} | SRC {latestData?.source || 'simulator'}
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#3b82f6] hover:bg-[#3b82f6]/90 text-white text-[12px] font-semibold px-4 py-1.5 rounded-[8px] transition-colors flex items-center gap-2"
          >
            <Upload size={14} /> Upload JSON
          </button>
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
        </div>
      </header>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 font-mono text-[12px] flex items-center gap-3 absolute top-[70px] left-1/2 -translate-x-1/2 z-50 rounded-lg backdrop-blur-sm"
        >
          <AlertTriangle size={18} /> {error}
        </motion.div>
      )}

      {/* Real-time Alert System */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div 
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className={`absolute top-20 right-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-4 cursor-pointer backdrop-blur-md ${activeAlert.type === 'CRITICAL' ? 'bg-[#ef4444]/90 border-red-500' : 'bg-[#f59e0b]/90 border-orange-500'}`}
            onClick={() => setActiveAlert(null)}
          >
            <AlertTriangle className="text-white shrink-0" size={24} />
            <div>
              <div className="text-white font-bold uppercase tracking-wider text-[11px] opacity-80">{activeAlert.type} ALERT</div>
              <div className="text-white text-[13px] font-medium">{activeAlert.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[320px_minmax(520px,1fr)_420px] gap-[1px] bg-[#1f2937] overflow-hidden">
        
        {/* Left Panel: File & Accident */}
        <aside className="bg-[#0f141d] p-5 flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-6">
            <section>
              <h2 className="panel-title mb-4"><ShieldCheck size={14} /> Mission Status Board</h2>
              <div className="space-y-2">
                {healthRows.map(row => (
                  <div key={row.label} className="bg-[#07090d] border border-[#243244] rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#94a3b8] font-mono uppercase">{row.label}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 border rounded ${row.ok ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10' : 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10'}`}>
                        {row.ok ? 'GO' : 'WATCH'}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[13px] text-[#f8fafc]">{row.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-4"><Play size={14} /> Telemetry Playback</h2>
              <div className="bg-[#07090d] border border-[#243244] rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#94a3b8]">Loaded packets</span>
                  <span className="text-[#f8fafc]">{playbackData.length}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#94a3b8]">Playback cursor</span>
                  <span className="text-[#f8fafc]">{playbackIndex}/{playbackData.length}</span>
                </div>
                <div className="h-1.5 bg-[#111827] rounded overflow-hidden border border-[#243244]">
                  <div
                    className="h-full bg-[#38bdf8]"
                    style={{ width: playbackData.length ? `${Math.min(100, (playbackIndex / playbackData.length) * 100)}%` : '0%' }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, playbackData.length)}
                  value={playbackIndex}
                  disabled={playbackData.length === 0}
                  onChange={(event) => seekPlayback(Number(event.target.value))}
                  className="playback-slider w-full"
                  aria-label="Seek telemetry playback"
                />
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={isPlaying ? pausePlayback : startPlayback}
                    disabled={playbackData.length === 0}
                    className="h-9 bg-[#1d4ed8] hover:bg-[#2563eb] disabled:bg-[#1f2937] disabled:text-[#64748b] rounded text-[12px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={resetPlayback}
                    disabled={playbackData.length === 0}
                    className="h-9 bg-[#111827] hover:bg-[#1f2937] disabled:text-[#64748b] border border-[#243244] rounded text-[12px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </button>
                  <select
                    value={playbackSpeedMs}
                    onChange={(event) => setPlaybackSpeedMs(Number(event.target.value))}
                    className="h-9 bg-[#111827] text-[12px] text-[#f8fafc] border border-[#243244] rounded px-2 outline-none"
                  >
                    <option value={1200}>0.8x</option>
                    <option value={750}>1x</option>
                    <option value={300}>2.5x</option>
                    <option value={120}>Fast</option>
                  </select>
                </div>
                <div className="text-[10px] text-[#64748b] leading-relaxed">
                  Upload JSON, then press Play. Each packet is replayed as a fresh live telemetry frame.
                </div>
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-4"><Navigation size={14} /> Ground Link</h2>
              <div className="bg-[#07090d] border border-[#243244] rounded-md p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="bg-black/20 p-2 rounded border border-[#1f2937]">
                    <div className="text-[#64748b]">Endpoint</div>
                    <div className="text-[#f8fafc]">/api/telemetry</div>
                  </div>
                  <div className="bg-black/20 p-2 rounded border border-[#1f2937]">
                    <div className="text-[#64748b]">Clients</div>
                    <div className="text-[#f8fafc]">{isLive ? 'Browser online' : 'No SSE lock'}</div>
                  </div>
                  <div className="bg-black/20 p-2 rounded border border-[#1f2937]">
                    <div className="text-[#64748b]">Last packet</div>
                    <div className="text-[#f8fafc]">{lastSeenText}</div>
                  </div>
                  <div className="bg-black/20 p-2 rounded border border-[#1f2937]">
                    <div className="text-[#64748b]">Mode</div>
                    <div className="text-[#f8fafc]">{missionPhase}</div>
                  </div>
                </div>
                <div className={`text-[11px] font-mono flex items-center gap-2 ${result.linkStatus === 'LIVE' ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>
                  {result.linkStatus === 'LIVE' ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                  Payload parser armed / SSE broadcast ready
                </div>
              </div>
            </section>

            <section>
              <h2 className="panel-title mb-4">사고 감지 (Accident Detection)</h2>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {result.anomalies.length > 0 ? (
                  result.anomalies.map((a, i) => (
                    <div key={i} className="bg-[#ef4444]/10 border border-[#ef4444]/20 p-3 rounded-lg">
                      <div className="text-[#ef4444] text-[12px] font-bold mb-1 uppercase tracking-wider">Anomaly Detected</div>
                      <p className="text-[11px] leading-relaxed text-[#fafafa]/80">{a}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-[#a1a1aa] italic p-3 border border-[#27272a] border-dashed rounded-lg text-center">
                    No anomalies detected in current stream
                  </div>
                )}
              </div>
            </section>

            <section className="pt-4 border-t border-[#243244]">
              <h2 className="panel-title mb-4"><Database size={14} className="mr-1 inline"/> Telemetry Dictionary</h2>
              <div className="text-[11px] text-[#a1a1aa] space-y-2 font-mono">
                {telemetrySignals.map(sig => (
                  <div key={sig.key} className="flex justify-between items-center border-b border-[#27272a] pb-1">
                    <span className="text-[#fafafa]">{sig.key}</span>
                    <span className="opacity-60">{sig.label.split(' ')[0]}</span>
                  </div>
                ))}
                <div className="pt-2 italic opacity-60">Raspberry Pi Live Data Endpoint: <br/> POST /api/telemetry</div>
              </div>
            </section>
          </div>
        </aside>

        {/* Center Panel: Summary & Charts */}
        <main className="bg-[#111827] p-5 flex flex-col gap-5 overflow-y-auto">
          <div>
            <h2 className="panel-title mb-4">Flight Telemetry Strip</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { label: 'Link Status', value: result.linkStatus, unit: '', color: result.linkStatus === 'LIVE' ? '#22c55e' : '#f59e0b', icon: Radio },
                { label: 'Mission Phase', value: missionPhase, unit: '', color: '#fafafa', icon: Gauge },
                { label: 'Altitude', value: latestData?.altitude || 0, unit: 'm', color: '#fafafa', icon: Gauge },
                { label: 'Battery', value: latestData?.battery || 0, unit: '%', color: (latestData?.battery || 0) > 20 ? '#22c55e' : '#ef4444', icon: Radio },
                { label: 'External Temp', value: latestData?.temperature || 0, unit: '°C', color: '#fafafa', icon: Gauge },
                { label: 'Internal Temp', value: latestData?.internalTemp || 0, unit: '°C', color: (latestData?.internalTemp || 0) < 55 ? '#fafafa' : '#f59e0b', icon: Cpu },
                { label: 'Voltage', value: latestData?.voltage || 0, unit: 'V', color: (latestData?.voltage || 0) >= 6.5 ? '#a1a1aa' : '#ef4444', icon: Radio },
                { label: 'Signal', value: latestData?.signalStrength || 0, unit: ' dBm', color: (latestData?.signalStrength || 0) > -115 ? '#22c55e' : '#ef4444', icon: Radio },
                { label: 'Packet Loss', value: latestData?.packetLoss || 0, unit: '%', color: (latestData?.packetLoss || 0) < 10 ? '#a1a1aa' : '#ef4444', icon: Server }
              ].map((stat, idx) => (
                <div key={idx} className="bg-[#07090d] p-3 rounded-md border border-[#243244] group hover:border-[#38bdf8]/50 transition-colors">
                  <div className="text-[11px] text-[#a1a1aa] mb-1 font-medium flex items-center gap-1.5">
                    <stat.icon size={12} /> {stat.label}
                  </div>
                  <div className="font-mono text-xl lg:text-2xl font-bold tracking-tight" style={{ color: stat.color }}>
                    {typeof stat.value === 'number' ? stat.value.toFixed(1) : stat.value}
                    <span className="text-[10px] lg:text-[12px] font-normal ml-1 opacity-40">{stat.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <section className="min-h-[430px] bg-[#07090d] rounded-md border border-[#243244] p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-[12px] font-medium text-[#fafafa]/80 truncate">Live Playback: {activeSignal?.label}</span>
                  <select 
                    value={selectedSignal} 
                    onChange={(e) => setSelectedSignal(e.target.value as keyof SatelliteDataPoint)}
                    className="bg-[#111827] text-[11px] text-[#fafafa] border border-[#243244] rounded px-2 py-1 outline-none focus:border-[#38bdf8]"
                  >
                    {telemetrySignals.map(sig => (
                      <option key={sig.key} value={sig.key}>{sig.label}</option>
                    ))}
                  </select>
                </div>
                <span className={`text-[10px] font-mono flex items-center gap-2 shrink-0 ${isPlaying ? 'text-[#22c55e] animate-pulse' : 'text-[#a1a1aa]'}`}>
                  <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[#22c55e]' : 'bg-[#a1a1aa]'}`}></div>
                  {isPlaying ? 'PLAYBACK RUNNING' : 'PLAYBACK IDLE'}
                </span>
              </div>
              <div className="flex-1 min-h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAccent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.28}/>
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" />
                    <XAxis dataKey="timestamp" fontSize={10} fontStyle="italic" stroke="#94a3b8" axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontStyle="italic" stroke="#94a3b8" axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #243244', borderRadius: '6px', color: '#fafafa', fontFamily: 'monospace', fontSize: '11px' }}
                      itemStyle={{ color: '#38bdf8' }}
                      cursor={{ stroke: '#38bdf8', strokeWidth: 1 }}
                    />
                    <Area type="monotone" dataKey={selectedSignal} stroke="#38bdf8" fillOpacity={1} fill="url(#colorAccent)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Visible frames</div>
                  <div className="text-[#f8fafc]">{data.length}</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Cursor</div>
                  <div className="text-[#f8fafc]">{playbackIndex}/{playbackData.length}</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Current</div>
                  <div className="text-[#f8fafc]">{latestData && typeof latestData[selectedSignal] === 'number' ? (latestData[selectedSignal] as number).toFixed(2) : '-'}</div>
                </div>
              </div>
            </section>

            <section className="min-h-[430px] bg-[#07090d] rounded-md border border-[#243244] p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="panel-title">Full JSON Dataset</h2>
                <span className="text-[10px] font-mono text-[#94a3b8]">{playbackData.length} TOTAL PACKETS</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Min</div>
                  <div className="text-[#f8fafc]">{fullSignalMin.toFixed(2)}</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Max</div>
                  <div className="text-[#f8fafc]">{fullSignalMax.toFixed(2)}</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Max ALT</div>
                  <div className="text-[#f8fafc]">{fullDatasetResult.maxAltitude.toFixed(0)}m</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-2">
                  <div className="text-[#64748b]">Min BAT</div>
                  <div className="text-[#f8fafc]">{fullDatasetResult.minBattery.toFixed(1)}%</div>
                </div>
              </div>
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={playbackData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorFullDataset" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.22}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis fontSize={10} fontStyle="italic" stroke="#94a3b8" axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #243244', borderRadius: '6px', color: '#fafafa', fontFamily: 'monospace', fontSize: '11px' }}
                      itemStyle={{ color: '#22c55e' }}
                      cursor={{ stroke: '#22c55e', strokeWidth: 1 }}
                    />
                    <Area type="monotone" dataKey={selectedSignal} stroke="#22c55e" fillOpacity={1} fill="url(#colorFullDataset)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-auto max-h-[150px] border border-[#243244] rounded">
                <table className="w-full text-[10px] font-mono">
                  <thead className="sticky top-0 bg-[#111827] text-[#94a3b8]">
                    <tr>
                      <th className="text-left p-2 font-medium">#</th>
                      <th className="text-left p-2 font-medium">ALT</th>
                      <th className="text-left p-2 font-medium">BAT</th>
                      <th className="text-left p-2 font-medium">SIG</th>
                      <th className="text-left p-2 font-medium">CAM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbackData.slice(-24).map((point, index) => (
                      <tr key={`${point.timestamp}-${index}`} className="border-t border-[#1f2937] text-[#cbd5e1]">
                        <td className="p-2">{playbackData.length - Math.min(24, playbackData.length) + index + 1}</td>
                        <td className="p-2">{point.altitude.toFixed(0)}</td>
                        <td className="p-2">{point.battery.toFixed(1)}</td>
                        <td className="p-2">{point.signalStrength.toFixed(1)}</td>
                        <td className="p-2">{point.camera?.mode || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="bg-[#07090d] rounded-md border border-[#243244] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="panel-title"><Camera size={14} /> Body Camera Payload</h2>
              <span className={`text-[10px] font-mono px-2 py-1 rounded border ${latestData?.camera?.mode === 'offline' ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10' : 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10'}`}>
                {latestData?.camera?.mode?.toUpperCase() || 'STANDBY'}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
              <div className="camera-preview aspect-video rounded-md border border-[#243244] overflow-hidden relative bg-[#020617]">
                <div className="absolute inset-0 camera-scanline" />
                <div className="absolute left-3 top-3 font-mono text-[10px] text-[#bae6fd]">CAM-A BODY NADIR</div>
                <div className="absolute right-3 top-3 font-mono text-[10px] text-[#bae6fd]">{latestData?.camera?.frameId || 'NO-FRAME'}</div>
                <div className="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2 font-mono text-[10px] text-[#dbeafe]">
                  <div className="bg-black/45 border border-white/10 rounded px-2 py-1">ALT {(latestData?.altitude || 0).toFixed(0)}m</div>
                  <div className="bg-black/45 border border-white/10 rounded px-2 py-1">EXP {(latestData?.camera?.exposureMs || 0).toFixed(0)}ms</div>
                  <div className="bg-black/45 border border-white/10 rounded px-2 py-1">GAIN {(latestData?.camera?.gain || 0).toFixed(1)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-[#111827] border border-[#243244] rounded p-3">
                  <div className="text-[#64748b] flex items-center gap-1"><HardDrive size={12} /> Storage</div>
                  <div className="text-[#f8fafc] mt-1">{(latestData?.camera?.storageUsed || 0).toFixed(1)}%</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-3">
                  <div className="text-[#64748b] flex items-center gap-1"><Zap size={12} /> Solar</div>
                  <div className="text-[#f8fafc] mt-1">{(latestData?.solarGeneration || 0).toFixed(3)}W</div>
                </div>
                <div className="bg-[#111827] border border-[#243244] rounded p-3 col-span-2">
                  <div className="text-[#64748b]">Last Capture</div>
                  <div className="text-[#f8fafc] mt-1">{latestData?.camera?.lastCapture || '-'}</div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <div className="bg-[#07090d] border border-[#243244] rounded-md p-3">
              <div className="text-[10px] font-mono text-[#64748b] uppercase">Coordinates</div>
              <div className="font-mono text-[13px] text-[#f8fafc] mt-1">
                {latestData && latestData.gps.satellites > 0 ? `${latestData.gps.lat.toFixed(5)}, ${latestData.gps.lng.toFixed(5)}` : 'GPS not present in SE3C log'}
              </div>
            </div>
            <div className="bg-[#07090d] border border-[#243244] rounded-md p-3">
              <div className="text-[10px] font-mono text-[#64748b] uppercase">Acceleration XYZ</div>
              <div className="font-mono text-[13px] text-[#f8fafc] mt-1">
                {latestData ? `${latestData.velocity.toFixed(2)} m/s vertical` : '-'}
              </div>
            </div>
            <div className="bg-[#07090d] border border-[#243244] rounded-md p-3">
              <div className="text-[10px] font-mono text-[#64748b] uppercase">Selected Signal</div>
              <div className="font-mono text-[13px] text-[#f8fafc] mt-1">
                {latestData && typeof latestData[selectedSignal] === 'number' ? (latestData[selectedSignal] as number).toFixed(3) : '-'}
              </div>
            </div>
          </div>
        </main>

        {/* Right Panel: Debug Code Console */}
        <aside className="bg-[#0b1018] p-5 flex flex-col gap-5 overflow-y-auto">
          <section>
            <h2 className="panel-title mb-4"><Server size={14} /> Flight Computer Debug</h2>
            <div className={`status-tag mb-3 ${result.status === 'NORMAL' ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20' : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'}`}>
              System {result.status === 'NORMAL' ? 'Healthy' : 'Compromised'}
            </div>
            <div className="text-[12px] text-[#a1a1aa]">
              Auto-classification: <span className="text-[#fafafa] font-medium">{result.status === 'NORMAL' ? 'Normal Orbit' : 'Anomaly Detected'}</span>
            </div>
            {latestData && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-mono text-[#a1a1aa]">
                <div className="bg-[#09090b] border border-[#27272a] rounded p-2">Pitch <span className="text-[#fafafa]">{latestData.attitude.pitch.toFixed(1)}°</span></div>
                <div className="bg-[#09090b] border border-[#27272a] rounded p-2">Roll <span className="text-[#fafafa]">{latestData.attitude.roll.toFixed(1)}°</span></div>
                <div className="bg-[#09090b] border border-[#27272a] rounded p-2">Yaw <span className="text-[#fafafa]">{latestData.attitude.yaw.toFixed(1)}°</span></div>
                <div className="bg-[#09090b] border border-[#27272a] rounded p-2">CPU <span className="text-[#fafafa]">{latestData.cpuUsage.toFixed(0)}%</span></div>
              </div>
            )}
          </section>

          <section className="flex flex-col min-h-[260px]">
            <h2 className="panel-title mb-4"><Terminal size={14} /> Latest Packet JSON</h2>
            <pre className="debug-code flex-1 min-h-[220px]">{latestPacketJson}</pre>
          </section>

          <section>
            <h2 className="panel-title mb-3"><Terminal size={14} /> Raspberry Pi Sender</h2>
            <pre className="debug-code">{pythonSnippet}</pre>
          </section>

          <section>
            <h2 className="panel-title mb-3"><Terminal size={14} /> Manual POST Test</h2>
            <pre className="debug-code max-h-[160px]">{curlSnippet}</pre>
            <pre className="debug-code mt-2">curl http://localhost:3000/api/health</pre>
          </section>

          <section className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="panel-title">AI Fault Summary</h2>
              {loading && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#3b82f6]"></div>}
            </div>
            <div className="insight-box flex-1 flex flex-col">
              <div className="font-semibold text-[14px] mb-2 text-[#fafafa]">AI Studio Analyzer</div>
              <div className="text-[13px] leading-relaxed text-[#a1a1aa] font-medium prose prose-invert max-w-none">
                {loading ? (
                  <div className="animate-pulse space-y-3 pt-2">
                    <div className="h-2.5 bg-[#27272a] rounded w-full"></div>
                    <div className="h-2.5 bg-[#27272a] rounded w-11/12"></div>
                    <div className="h-2.5 bg-[#27272a] rounded w-4/5"></div>
                  </div>
                ) : (
                  <ReactMarkdown>{result.interpretation || '현재 수신 중인 실시간 텔레메트리 데이터가 정상적으로 표시되고 있습니다. 전체적인 상황 요약이나 문제 진단이 필요할 경우 하단의 "Generate AI Report" 버튼을 눌러 AI 분석을 실행하십시오.'}</ReactMarkdown>
                )}
              </div>
            </div>
          </section>

          <div className="mt-auto pt-4 border-t border-[#27272a]">
            <button 
              onClick={() => fetchInterpretation(data, result)}
              disabled={loading || data.length === 0}
              className="w-full py-3 bg-[#3b82f6] hover:bg-[#3b82f6]/90 disabled:bg-[#3b82f6]/50 disabled:cursor-not-allowed rounded-lg text-[#fafafa] font-semibold text-[14px] transition-all transform active:scale-[0.98] shadow-lg shadow-[#3b82f6]/20 flex items-center justify-center gap-2"
            >
              <Box size={16} /> 
              {loading ? 'Analyzing...' : 'Generate AI Report'}
            </button>
            <div className="text-center mt-4 text-[10px] text-[#a1a1aa] font-mono tracking-widest uppercase opacity-40">
              MOC-OPS-SECURED
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
