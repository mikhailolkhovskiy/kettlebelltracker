/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pose, Results, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Play, Square, Timer, Activity, Zap, Info, Plus, Minus, Camera as CameraIcon, CameraOff, History, ChevronDown, ChevronUp, Video, VideoOff, Download, Settings as SettingsIcon, Moon, Sun, Languages, Palette, X, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWakeLock } from './hooks/useWakeLock';
import { playBeep } from './lib/audio';

// Constants for rep detection
const REP_THRESHOLD_UP = 0.3; // Relative Y coordinate (lower is higher on screen)
const REP_THRESHOLD_DOWN = 0.5;

const translations = {
  en: {
    title: "KETTLEBELL TRACKER",
    start: "START WORKOUT",
    stop: "STOP WORKOUT",
    preparing: "PREPARING...",
    getReady: "Get Ready",
    time: "TIME",
    reps: "REPS",
    totalReps: "TOTAL REPS",
    rpm: "RPM",
    left: "LEFT",
    right: "RIGHT",
    workoutLog: "Workout Log",
    noSummaries: "No minute summaries yet...",
    min: "Min",
    camera: "Camera",
    record: "Record",
    settings: "Settings",
    language: "Language",
    theme: "Theme",
    mode: "Mode",
    dark: "Dark",
    light: "Light",
    emerald: "Emerald",
    blue: "Blue",
    rose: "Rose",
    amber: "Amber",
    voice: "Voice Feedback",
    voiceEnabled: "Voice Enabled",
    voiceDisabled: "Voice Disabled",
    beepInterval: "Beep Interval",
    beepNone: "None",
    beepSeconds: "sec",
    selectCamera: "Select Camera",
    defaultCamera: "Default Camera",
    cameraError: "Camera Access Denied",
    cameraErrorHint: "Please allow camera access in your browser settings and refresh the page."
  },
  ru: {
    title: "ТРЕКЕР ГИРИ",
    start: "НАЧАТЬ ТРЕНИРОВКУ",
    stop: "ОСТАНОВИТЬ",
    preparing: "ПОДГОТОВКА...",
    getReady: "Приготовьтесь",
    time: "ВРЕМЯ",
    reps: "ПОВТОРЫ",
    totalReps: "ВСЕГО ПОВТОРОВ",
    rpm: "ТЕМП",
    left: "ЛЕВАЯ",
    right: "ПРАВАЯ",
    workoutLog: "История тренировки",
    noSummaries: "Пока нет данных по минутам...",
    min: "Мин",
    camera: "Камера",
    record: "Запись",
    settings: "Настройки",
    language: "Язык",
    theme: "Цвет",
    mode: "Режим",
    dark: "Темный",
    light: "Светлый",
    emerald: "Изумруд",
    blue: "Синий",
    rose: "Роза",
    amber: "Янтарь",
    voice: "Голосовой счет",
    voiceEnabled: "Включен",
    voiceDisabled: "Выключен",
    beepInterval: "Звуковой сигнал",
    beepNone: "Нет",
    beepSeconds: "сек",
    selectCamera: "Выбор камеры",
    defaultCamera: "Камера по умолчанию",
    cameraError: "Доступ к камере запрещен",
    cameraErrorHint: "Пожалуйста, разрешите доступ к камере в настройках браузера и обновите страницу."
  }
};

const themes = {
  emerald: { primary: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500', shadow: 'shadow-emerald-500/20' },
  blue: { primary: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500', shadow: 'shadow-blue-500/20' },
  rose: { primary: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500', shadow: 'shadow-rose-500/20' },
  amber: { primary: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500', shadow: 'shadow-amber-500/20' },
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Settings state
  const [lang, setLang] = useState<'en' | 'ru'>(() => {
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.split('-')[0];
      return browserLang === 'ru' ? 'ru' : 'en';
    }
    return 'en';
  });
  const [theme, setTheme] = useState<keyof typeof themes>('emerald');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [beepInterval, setBeepInterval] = useState(0); // 0 means disabled
  const [showSettings, setShowSettings] = useState(false);

  const t = translations[lang];
  const currentTheme = themes[theme];

  const speak = useCallback((text: string) => {
    if (!isVoiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    
    // Cancel any ongoing speech to avoid queueing
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = lang === 'ru' ? 'ru-RU' : 'en-US';
    utterance.lang = targetLang;
    
    // Try to find a voice that matches the language explicitly
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(lang)) || voices.find(v => v.lang.includes(targetLang));
    if (voice) {
      utterance.voice = voice;
    }
    
    utterance.rate = 1.2;
    window.speechSynthesis.speak(utterance);
  }, [isVoiceEnabled, lang]);

  const [isActive, setIsActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [reps, setReps] = useState(0);
  const [leftReps, setLeftReps] = useState(0);
  const [rightReps, setRightReps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isHandUp, setIsHandUp] = useState(false);
  const [lastHand, setLastHand] = useState<'left' | 'right' | null>(null);
  const [speed, setSpeed] = useState(0);
  const [repTimestamps, setRepTimestamps] = useState<number[]>([]);
  
  // Workout log
  const [workoutLog, setWorkoutLog] = useState<{ minute: number; left: number; right: number; total: number }[]>([]);
  const lastLoggedMinute = useRef(0);
  
  // Camera state
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLogCollapsed, setIsLogCollapsed] = useState(false);

  // Pre-load voices for speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        window.speechSynthesis.getVoices();
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // Handle window resize for responsiveness
  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        if (videoDevices.length > 0 && !selectedCameraId) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error getting cameras:", err);
      }
    };

    getCameras();
    
    // Also listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getCameras);
  }, []);

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsLargeScreen(width >= 1024);
      setIsLandscape(width > height && width < 1024);
      // Constrain sidebar width if window gets too small
      setSidebarWidth(prev => Math.min(prev, width * 0.6));
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Dynamic font sizes based on sidebar width or screen width
  const effectiveWidth = isLargeScreen ? sidebarWidth : (isLandscape ? 320 : (typeof window !== 'undefined' ? window.innerWidth : 400));
  const baseScale = (isLargeScreen || isLandscape) ? 1 : 0.7; // Scale down only on portrait mobile
  const timerFontSize = Math.min(280, Math.max(48, (effectiveWidth / 400) * 110 * baseScale));
  const statsFontSize = Math.min(220, Math.max(40, (effectiveWidth / 400) * 120 * baseScale));

  // Refs for MediaPipe objects to prevent re-initialization
  const poseRef = useRef<Pose | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const isComponentMounted = useRef(true);
  const lastRepTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Resize handler
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = Math.min(800, window.innerWidth * 0.7);
      if (newWidth > 300 && newWidth < maxWidth) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // Use a ref for state values needed in the callback to avoid re-creating the callback
  const stateRef = useRef({ isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, primaryColor: currentTheme.primary });
  useEffect(() => {
    stateRef.current = { isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, primaryColor: currentTheme.primary };
  }, [isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, currentTheme.primary]);

  // Wake lock to prevent screen sleep
  useWakeLock(isActive);

  // Countdown logic
  useEffect(() => {
    let timer: number | undefined;
    if (countdown !== null && countdown > 0) {
      timer = window.setInterval(() => {
        setCountdown((c) => (c !== null ? c - 1 : null));
        playBeep();
      }, 1000);
    } else if (countdown === 0) {
      setCountdown(null);
      setIsActive(true);
      startTimeRef.current = Date.now();
      setReps(0);
      setLeftReps(0);
      setRightReps(0);
      setSeconds(0);
      setRepTimestamps([]);
      setWorkoutLog([]);
      lastLoggedMinute.current = 0;
      lastRepTimeRef.current = 0;
      
      // Start recording if enabled
      if (isRecordingEnabled && recordingCanvasRef.current) {
        try {
          const stream = recordingCanvasRef.current.captureStream(30);
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
          recordedChunksRef.current = [];
          
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          
          recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workout-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
          };
          
          recorder.start();
          mediaRecorderRef.current = recorder;
        } catch (err) {
          console.error("Failed to start recording:", err);
        }
      }
    }
    return () => window.clearInterval(timer);
  }, [countdown]);

  // Timer logic
  useEffect(() => {
    let interval: number | undefined;
    if (isActive && startTimeRef.current) {
      interval = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current!) / 1000);
        setSeconds(elapsed);
      }, 200); // Check frequently to ensure accuracy
    } else {
      window.clearInterval(interval);
    }
    return () => window.clearInterval(interval);
  }, [isActive]);

  // Minute logging logic
  useEffect(() => {
    if (isActive && seconds > 0 && seconds % 60 === 0) {
      const currentMinute = seconds / 60;
      if (currentMinute > lastLoggedMinute.current) {
        setWorkoutLog(prev => {
          // Calculate reps for THIS minute
          const totalRepsSoFar = reps;
          const leftRepsSoFar = leftReps;
          const rightRepsSoFar = rightReps;
          
          const prevTotal = prev.reduce((acc, curr) => acc + curr.total, 0);
          const prevLeft = prev.reduce((acc, curr) => acc + curr.left, 0);
          const prevRight = prev.reduce((acc, curr) => acc + curr.right, 0);

          return [...prev, {
            minute: currentMinute,
            left: leftRepsSoFar - prevLeft,
            right: rightRepsSoFar - prevRight,
            total: totalRepsSoFar - prevTotal
          }];
        });
        lastLoggedMinute.current = currentMinute;
        playBeep();
      }
    }
  }, [isActive, seconds, reps, leftReps, rightReps]);

  // Periodic beep logic
  const lastBeepSecond = useRef<number>(-1);
  useEffect(() => {
    if (isActive && beepInterval > 0 && seconds > 0 && seconds % beepInterval === 0) {
      if (seconds !== lastBeepSecond.current) {
        playBeep(440, 0.3); // Lower frequency and shorter duration for periodic beep
        lastBeepSecond.current = seconds;
      }
    }
    if (!isActive) {
      lastBeepSecond.current = -1;
    }
  }, [isActive, seconds, beepInterval]);

  // Speed calculation (20-second sliding window)
  useEffect(() => {
    if (seconds > 0) {
      const windowSize = Math.min(seconds, 20);
      const startTime = seconds - windowSize;
      const recentReps = repTimestamps.filter(t => t > startTime);
      const rpm = (recentReps.length / windowSize) * 60;
      setSpeed(Math.round(rpm));
    } else {
      setSpeed(0);
    }
  }, [seconds, repTimestamps]);

  const onResults = useCallback((results: Results) => {
    if (!canvasRef.current || !recordingCanvasRef.current || !videoRef.current || !isComponentMounted.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    const recordingCtx = recordingCanvasRef.current.getContext('2d');
    if (!canvasCtx || !recordingCtx) return;

    // 1. Draw to Recording Canvas (Clean video + HUD, no skeleton)
    recordingCtx.save();
    recordingCtx.clearRect(0, 0, recordingCanvasRef.current.width, recordingCanvasRef.current.height);
    recordingCtx.drawImage(
      results.image, 0, 0, recordingCanvasRef.current.width, recordingCanvasRef.current.height
    );

    // 2. Draw to Main Canvas (Video + Skeleton + HUD)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(
      results.image, 0, 0, canvasRef.current.width, canvasRef.current.height
    );

    if (results.poseLandmarks) {
      // Draw landmarks ONLY on main canvas
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
        { color: '#00FF00', lineWidth: 4 });
      drawLandmarks(canvasCtx, results.poseLandmarks,
        { color: '#FF0000', lineWidth: 2 });

      // Landmarks: 15 is left wrist, 16 is right wrist, 0 is nose, 11/12 are shoulders, 13/14 are elbows, 23/24 are hips
      const landmarks = results.poseLandmarks;
      if (!landmarks || landmarks.length < 25) return;

      const leftWrist = landmarks[15];
      const rightWrist = landmarks[16];
      const nose = landmarks[0];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftElbow = landmarks[13];
      const rightElbow = landmarks[14];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      // Helper to calculate angle between three points
      const calculateAngle = (a: any, b: any, c: any) => {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
      };

      const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

      // Calculate a dynamic threshold based on the user's distance (nose to shoulder distance)
      const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const headScale = Math.max(0.05, shoulderY - nose.y); // Distance from nose to shoulders
      const threshold = nose.y - (headScale * 1.8); // Hand must be significantly above the head (increased from 1.5)

      // Check visibility to ensure landmarks are reliable
      const isVisible = nose.visibility > 0.5 && leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5;

      // Helper to check if points are roughly on a vertical line and correctly ordered
      const isAlignedAndOrdered = (wrist: any, elbow: any, shoulder: any, hip: any) => {
        const xCoords = [wrist.x, elbow.x, shoulder.x, hip.x];
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        
        // 1. Horizontal alignment: points should be vertically stacked
        // Tolerance is proportional to headScale (distance from camera)
        const horizontalAlignment = (maxX - minX) < (headScale * 1.2);
        
        // 2. Vertical ordering: wrist must be highest, then elbow, then shoulder, then hip
        const verticalOrdering = wrist.y < elbow.y && elbow.y < shoulder.y && shoulder.y < hip.y;

        // 3. Proportional vertical distance check:
        // In a straight arm lockout, the vertical distance between joints should be significant.
        // During a backswing, even if the wrist is high, the vertical distance between 
        // shoulder and elbow/wrist often shrinks in the 2D projection.
        const vDistWristElbow = elbow.y - wrist.y;
        const vDistElbowShoulder = shoulder.y - elbow.y;
        const vDistShoulderHip = hip.y - shoulder.y;
        
        // Each segment must have a minimum vertical length relative to headScale
        // This ensures the arm is actually reaching UP, not just being held high while leaning
        const minSegmentLength = headScale * 0.5;
        const significantVerticality = vDistWristElbow > minSegmentLength && 
                                       vDistElbowShoulder > minSegmentLength &&
                                       vDistShoulderHip > headScale; // Torso should be upright
        
        return horizontalAlignment && verticalOrdering && significantVerticality;
      };

      // Condition: Wrist significantly above threshold AND arm almost straight (angle > 150) AND vertical alignment/ordering
      // AND shoulder must be below nose level (prevent counting when bent over too much)
      const leftIsUp = isVisible && 
                       leftWrist.y < threshold && 
                       leftWrist.visibility > 0.5 && 
                       leftElbowAngle > 150 && 
                       leftHip.visibility > 0.5 &&
                       leftShoulder.y > nose.y &&
                       isAlignedAndOrdered(leftWrist, leftElbow, leftShoulder, leftHip);

      const rightIsUp = isVisible && 
                        rightWrist.y < threshold && 
                        rightWrist.visibility > 0.5 && 
                        rightElbowAngle > 150 && 
                        rightHip.visibility > 0.5 &&
                        rightShoulder.y > nose.y &&
                        isAlignedAndOrdered(rightWrist, rightElbow, rightShoulder, rightHip);
      const handIsAboveHead = leftIsUp || rightIsUp;

      const { isActive: currentIsActive, isHandUp: currentIsHandUp, seconds: currentSeconds, reps: currentReps, speed: currentSpeed, leftReps: currentLeftReps, rightReps: currentRightReps, primaryColor } = stateRef.current;

      if (currentIsActive) {
        if (handIsAboveHead && !currentIsHandUp) {
          const now = Date.now();
          if (now - lastRepTimeRef.current > 1000) {
            setIsHandUp(true);
            const nextReps = currentReps + 1;
            setReps(nextReps);
            speak(nextReps.toString());
            setRepTimestamps(prev => [...prev, stateRef.current.seconds]);
            
            // Logic for individual hand stats: 
            // If both are up, we don't count them separately for the total (already incremented by 1),
            // but we can still track which hands were involved if needed.
            // User asked "don't count separately for each hand" when both are up.
            if (leftIsUp && rightIsUp) {
              // Double hand rep - just increment total (already done)
              // We could potentially have a 'double' counter, but for now we just follow "don't count separately"
            } else if (leftIsUp) {
              setLeftReps(prev => prev + 1);
            } else if (rightIsUp) {
              setRightReps(prev => prev + 1);
            }
            
            lastRepTimeRef.current = now;
          }
        } else if (!handIsAboveHead && currentIsHandUp) {
          // Add a bit of hysteresis to prevent jitter - hand must drop below nose level to reset
          if (leftWrist.y > nose.y && rightWrist.y > nose.y) {
            setIsHandUp(false);
          }
        }
      }

      // Draw HUD on both Canvases
      if (currentIsActive) {
        const padding = 40;
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        const drawHUD = (ctx: CanvasRenderingContext2D) => {
          // Background for stats
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          
          // Helper for rounded rectangles (polyfill for older browsers)
          const drawRoundedRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            if (c.roundRect) {
              c.roundRect(x, y, w, h, r);
            } else {
              c.beginPath();
              c.moveTo(x + r, y);
              c.lineTo(x + w - r, y);
              c.quadraticCurveTo(x + w, y, x + w, y + r);
              c.lineTo(x + w, y + h - r);
              c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
              c.lineTo(x + r, y + h);
              c.quadraticCurveTo(x, y + h, x, y + h - r);
              c.lineTo(x, y + r);
              c.quadraticCurveTo(x, y, x + r, y);
              c.closePath();
            }
          };

          // Timer Box (Top Left)
          ctx.beginPath();
          drawRoundedRect(ctx, padding, padding, 220, 100, 20);
          ctx.fill();
          
          // Reps Box (Top Right)
          ctx.beginPath();
          drawRoundedRect(ctx, width - 220 - padding, padding, 220, 100, 20);
          ctx.fill();

          // Hand Counters Box (Bottom Left)
          ctx.beginPath();
          drawRoundedRect(ctx, padding, height - 100 - padding, 280, 100, 20);
          ctx.fill();

          // RPM Box (Bottom Right)
          ctx.beginPath();
          drawRoundedRect(ctx, width - 220 - padding, height - 100 - padding, 220, 100, 20);
          ctx.fill();

          // Text Styles
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textAlign = 'center';

          // Timer Text
          ctx.fillText(t.time, padding + 110, padding + 35);
          ctx.font = 'bold 48px JetBrains Mono, monospace';
          ctx.fillStyle = primaryColor;
          ctx.fillText(formatTime(currentSeconds), padding + 110, padding + 85);

          // Reps Text
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.fillText(t.totalReps, width - 110 - padding, padding + 35);
          ctx.font = 'bold 56px Inter, sans-serif';
          ctx.fillText(currentReps.toString(), width - 110 - padding, padding + 85);

          // Hand Counters Text
          ctx.font = 'bold 20px Inter, sans-serif';
          ctx.fillStyle = primaryColor;
          ctx.fillText(t.left, padding + 70, height - 65 - padding);
          ctx.fillStyle = '#3b82f6'; // blue-500
          ctx.fillText(t.right, padding + 210, height - 65 - padding);
          
          ctx.font = 'bold 48px Inter, sans-serif';
          ctx.fillStyle = 'white';
          ctx.fillText(currentLeftReps.toString(), padding + 70, height - 25 - padding);
          ctx.fillText(currentRightReps.toString(), padding + 210, height - 25 - padding);

          // RPM Text
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.fillText(t.rpm, width - 110 - padding, height - 65 - padding);
          ctx.font = 'bold 48px Inter, sans-serif';
          ctx.fillStyle = primaryColor;
          ctx.fillText(currentSpeed.toString(), width - 110 - padding, height - 25 - padding);
        };

        drawHUD(canvasCtx);
        drawHUD(recordingCtx);
      }
    }
    canvasCtx.restore();
    recordingCtx.restore();
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    
    const pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);
    poseRef.current = pose;

    let isProcessing = false;
    let animationFrameId: number;

    if (videoRef.current && isCameraEnabled) {
      // Create a native constraints object if we have a selected camera
      const constraints = selectedCameraId 
        ? { video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { width: { ideal: 1280 }, height: { ideal: 720 } } };

      const startCamera = async () => {
        setCameraError(null);
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.error("Video play error:", e));
              
              // Refresh camera list to get labels
              navigator.mediaDevices.enumerateDevices().then(devices => {
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                setAvailableCameras(videoDevices);
              });

              const processFrame = async () => {
                if (videoRef.current && poseRef.current && isComponentMounted.current && isCameraEnabled) {
                  // Ensure video is ready and not already processing
                  if (videoRef.current.readyState >= 2 && !isProcessing) {
                    isProcessing = true;
                    try {
                      await poseRef.current.send({ image: videoRef.current });
                    } catch (error) {
                      console.error("MediaPipe send error:", error);
                    } finally {
                      isProcessing = false;
                    }
                  }
                  animationFrameId = requestAnimationFrame(processFrame);
                }
              };
              animationFrameId = requestAnimationFrame(processFrame);
            };
          }
        } catch (err) {
          console.error("Error starting camera with constraints:", err);
          if (err instanceof Error) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              setCameraError('permission');
            } else {
              setCameraError('other');
            }
          }
        }
      };

      startCamera();
    }

    return () => {
      isComponentMounted.current = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
    };
  }, [onResults, isCameraEnabled, selectedCameraId]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    // Prime speech synthesis to unlock it on mobile/Safari
    if (isVoiceEnabled && window.speechSynthesis) {
      const prime = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(prime);
    }
    setCountdown(5);
    playBeep(); // Start beep
  };

  const handleStop = () => {
    setIsActive(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'} font-sans selection:bg-emerald-500/30 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      <div className="flex flex-col landscape:flex-row lg:flex-row h-screen overflow-hidden">
        
        {/* Left Side: Camera View & Log */}
        <div className={`relative flex-[1.2] landscape:flex-1 lg:flex-1 ${isDarkMode ? 'bg-black' : 'bg-neutral-200'} flex flex-col overflow-hidden min-w-0 lg:min-w-[400px]`}>
          {/* Camera Container */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-0">
            {cameraError ? (
              <div className="flex flex-col items-center gap-4 text-center p-8 max-w-sm">
                <div className="bg-rose-500/10 p-4 rounded-full">
                  <CameraOff size={48} className="text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-white">{t.cameraError}</h3>
                <p className="text-neutral-400 text-sm">{t.cameraErrorHint}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className={`mt-4 px-6 py-2 ${currentTheme.bg} text-neutral-950 font-bold rounded-xl hover:opacity-90 transition-all`}
                >
                  {lang === 'ru' ? 'Обновить страницу' : 'Refresh Page'}
                </button>
              </div>
            ) : isCameraEnabled ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute opacity-0 pointer-events-none"
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
                  width={1280}
                  height={720}
                />
                <canvas
                  ref={recordingCanvasRef}
                  className="hidden"
                  width={1280}
                  height={720}
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 text-neutral-500">
                <CameraOff size={64} strokeWidth={1.5} />
                <p className="text-lg font-medium">Camera is disabled</p>
              </div>
            )}
            
            <div className={`absolute top-6 left-6 flex items-center gap-2`}>
              {isCameraEnabled && availableCameras.length > 0 && (
                <div className="relative group">
                  <div className={`p-2 rounded-full border backdrop-blur-md transition-all ${isDarkMode ? 'bg-black/40 border-white/10 text-white hover:bg-black/60' : 'bg-white/60 border-black/5 text-neutral-900 hover:bg-white/80'}`}>
                    <CameraIcon size={18} />
                  </div>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title={t.selectCamera}
                  >
                    {availableCameras.map((camera, idx) => (
                      <option key={camera.deviceId} value={camera.deviceId} className={isDarkMode ? 'bg-neutral-900' : 'bg-white'}>
                        {camera.label || `${t.camera} ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className={`w-3 h-3 rounded-full border ${isDarkMode ? 'border-white/20' : 'border-black/10'} ${isActive && isCameraEnabled ? currentTheme.bg + ' animate-pulse' : 'bg-neutral-500'}`} />
            </div>

            <AnimatePresence>
              {isHandUp && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <div className="bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/50 p-8 rounded-full">
                    <Zap className="w-16 h-16 text-emerald-400 fill-emerald-400" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {countdown !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 2 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50"
                >
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-neutral-400 text-sm font-bold uppercase tracking-[0.4em]">{t.getReady}</span>
                    <motion.span 
                      key={countdown}
                      initial={{ scale: 1.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`text-[180px] font-black ${currentTheme.text} leading-none tabular-nums`}
                    >
                      {countdown}
                    </motion.span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Workout Log Section */}
          <motion.div 
            animate={{ height: isLogCollapsed ? '48px' : (isLargeScreen ? 200 : 140) }}
            className={`${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} border-t flex flex-col overflow-hidden shrink-0`}
          >
            <div 
              onClick={() => setIsLogCollapsed(!isLogCollapsed)}
              className={`px-6 h-[48px] border-b ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'} flex items-center justify-between cursor-pointer transition-colors shrink-0`}
            >
              <div className="flex items-center gap-2 text-neutral-400">
                <History size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">{t.workoutLog}</span>
                {isLogCollapsed ? <ChevronUp size={14} className="text-neutral-600" /> : <ChevronDown size={14} className="text-neutral-600" />}
              </div>
              {!isLogCollapsed && (
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  <span className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${currentTheme.bg}`} /> {t.left}</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {t.right}</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {workoutLog.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-600 text-sm italic">
                  {t.noSummaries}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {workoutLog.map((log) => (
                    <motion.div 
                      key={log.minute}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/30' : 'bg-neutral-100 border-neutral-200'} rounded-xl p-3 border flex flex-col gap-2`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">{t.min} {log.minute}</span>
                        <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{log.total} {t.reps.toLowerCase()}</span>
                      </div>
                      <div className={`flex gap-2 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
                        <div 
                          style={{ width: `${(log.left / Math.max(1, log.total)) * 100}%` }}
                          className={`${currentTheme.bg} transition-all duration-500`}
                        />
                        <div 
                          style={{ width: `${(log.right / Math.max(1, log.total)) * 100}%` }}
                          className="bg-blue-500 transition-all duration-500"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span className={currentTheme.text}>{t.left.charAt(0)}: {log.left}</span>
                        <span className="text-blue-400">{t.right.charAt(0)}: {log.right}</span>
                      </div>
                    </motion.div>
                  )).reverse()}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Resize Handle */}
        <div 
          className={`hidden lg:flex w-1.5 bg-neutral-800 hover:bg-emerald-500 cursor-col-resize transition-all items-center justify-center group ${isResizing ? 'bg-emerald-500' : ''}`}
          onMouseDown={startResizing}
        >
          <div className={`w-0.5 h-12 bg-neutral-700 group-hover:bg-emerald-300 rounded-full transition-all ${isResizing ? 'bg-emerald-300 h-24' : ''}`} />
        </div>

        {/* Right Side: Stats & Controls */}
        <div 
          style={{ width: isLargeScreen ? `${sidebarWidth}px` : (isLandscape ? '320px' : '100%') }}
          className={`${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} p-4 lg:p-8 flex flex-col gap-6 lg:gap-8 overflow-y-auto shrink-0 border-t landscape:border-t-0 landscape:border-l lg:border-t-0 lg:border-l flex-1 landscape:flex-none lg:flex-none`}
        >
          <header className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-neutral-900'} flex items-center gap-2`}>
                <Activity className={currentTheme.text} />
                {t.title}
              </h1>
              <p className="text-neutral-400 text-[10px] uppercase font-bold tracking-[0.2em] mt-1 opacity-60">AI-powered tracking</p>
            </div>
            <button 
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-600'} transition-colors`}
            >
              <SettingsIcon size={20} />
            </button>
          </header>

          <div className="space-y-8">
            {/* Timer Display */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1 flex items-center gap-2 opacity-60">
                <Timer size={12} />
                {t.time}
              </div>
              <div 
                style={{ fontSize: `${timerFontSize}px` }}
                className={`font-mono font-bold tracking-tighter ${currentTheme.text} tabular-nums leading-none`}
              >
                {formatTime(seconds)}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Reps */}
              <div className="flex flex-col items-center justify-center">
                <div className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1 opacity-60">{t.reps}</div>
                <div 
                  style={{ fontSize: `${statsFontSize}px` }}
                  className={`font-bold ${isDarkMode ? 'text-white' : 'text-neutral-900'} leading-none`}
                >
                  {reps}
                </div>
              </div>

              {/* RPM */}
              <div className="flex flex-col items-center justify-center">
                <div className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1 opacity-60">{t.rpm}</div>
                <div 
                  style={{ fontSize: `${statsFontSize}px` }}
                  className={`font-bold ${currentTheme.text} leading-none`}
                >
                  {speed}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="grid grid-cols-2 gap-3 mb-2">
                {/* Camera Toggle */}
                <div className={`flex flex-col gap-2 p-4 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-neutral-100 border-neutral-200'} rounded-2xl border`}>
                  <div className="flex items-center justify-between">
                    {isCameraEnabled ? <CameraIcon size={18} className={currentTheme.text} /> : <CameraOff size={18} className="text-neutral-500" />}
                    <button
                      onClick={() => setIsCameraEnabled(!isCameraEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isCameraEnabled ? currentTheme.bg : 'bg-neutral-700'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isCameraEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.camera}</span>
                </div>

                {/* Recording Toggle */}
                <div className={`flex flex-col gap-2 p-4 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-neutral-100 border-neutral-200'} rounded-2xl border`}>
                  <div className="flex items-center justify-between">
                    {isRecordingEnabled ? <Video size={18} className="text-red-500 animate-pulse" /> : <VideoOff size={18} className="text-neutral-500" />}
                    <button
                      onClick={() => setIsRecordingEnabled(!isRecordingEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isRecordingEnabled ? 'bg-red-500' : 'bg-neutral-700'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRecordingEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.record}</span>
                </div>
              </div>

              {!isActive && countdown === null ? (
                <button
                  onClick={handleStart}
                  className={`group relative flex items-center justify-center gap-3 ${currentTheme.bg} hover:opacity-90 text-neutral-950 font-bold py-5 rounded-2xl transition-all active:scale-95 shadow-lg ${currentTheme.shadow}`}
                >
                  <Play className="fill-current" size={20} />
                  {t.start}
                </button>
              ) : isActive ? (
                <button
                  onClick={handleStop}
                  className="flex items-center justify-center gap-3 bg-red-500 hover:bg-red-400 text-white font-bold py-5 rounded-2xl transition-all active:scale-95 shadow-lg shadow-red-500/20"
                >
                  <Square className="fill-current" size={20} />
                  {t.stop}
                </button>
              ) : (
                <div className={`flex items-center justify-center gap-3 ${isDarkMode ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-200 text-neutral-400'} font-bold py-5 rounded-2xl cursor-not-allowed`}>
                  <Timer size={20} />
                  {t.preparing}
                </div>
              )}
            </div>
          </div>

          <div className={`mt-auto pt-8 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
            <div className={`flex items-start gap-3 p-4 ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/30' : 'bg-neutral-100 border-neutral-200'} rounded-xl border`}>
              <Info className={currentTheme.text} size={18} />
              <p className="text-[10px] text-neutral-500 leading-relaxed uppercase font-bold tracking-wider">
                {lang === 'ru' 
                  ? 'Встаньте так, чтобы все тело было видно. Поднимите руку выше головы для счета. Каждую минуту будет звучать сигнал.' 
                  : 'Position yourself so your full body is visible. Raise your hand above your head to count a rep. A beep will sound every minute.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-md max-h-[85vh] flex flex-col ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} border rounded-3xl shadow-2xl overflow-hidden`}
            >
              <div className="p-5 flex items-center justify-between border-b border-neutral-800/10 flex-shrink-0">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <SettingsIcon size={18} className={currentTheme.text} />
                  {t.settings}
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className={`p-2 ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-600'} rounded-xl transition-colors`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
                {/* Language */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    <Languages size={14} />
                    {t.language}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['en', 'ru'] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLang(l)}
                        className={`py-3 rounded-xl font-bold transition-all ${lang === l ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                      >
                        {l === 'en' ? 'English' : 'Русский'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    <Palette size={14} />
                    {t.theme}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(themes) as Array<keyof typeof themes>).map((th) => (
                      <button
                        key={th}
                        onClick={() => setTheme(th)}
                        className={`py-3 px-4 rounded-xl font-bold flex items-center gap-2 transition-all ${theme === th ? `${themes[th].bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                      >
                        <div className={`w-3 h-3 rounded-full ${theme === th ? 'bg-neutral-950' : themes[th].bg}`} />
                        {t[th]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                    {t.mode}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsDarkMode(false)}
                      className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${!isDarkMode ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                    >
                      <Sun size={16} />
                      {t.light}
                    </button>
                    <button
                      onClick={() => setIsDarkMode(true)}
                      className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isDarkMode ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                    >
                      <Moon size={16} />
                      {t.dark}
                    </button>
                  </div>
                </div>

                {/* Voice */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    {isVoiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {t.voice}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsVoiceEnabled(true)}
                      className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isVoiceEnabled ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                    >
                      <Volume2 size={16} />
                      {t.voiceEnabled}
                    </button>
                    <button
                      onClick={() => setIsVoiceEnabled(false)}
                      className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${!isVoiceEnabled ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                    >
                      <VolumeX size={16} />
                      {t.voiceDisabled}
                    </button>
                  </div>
                </div>

                {/* Beep Interval */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    <Timer size={14} />
                    {t.beepInterval}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBeepInterval(prev => Math.max(0, prev - 1))}
                      className={`p-3 rounded-xl transition-all ${isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    >
                      <Minus size={20} />
                    </button>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        value={beepInterval === 0 ? '' : beepInterval}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                          setBeepInterval(isNaN(val) ? 0 : val);
                        }}
                        placeholder={t.beepNone}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-center transition-all outline-none border-2 ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-emerald-500' : 'bg-neutral-100 border-neutral-200 text-neutral-900 focus:border-emerald-500'} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                      />
                      {beepInterval > 0 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-bold">
                          {t.beepSeconds}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setBeepInterval(prev => Math.min(3600, prev + 1))}
                      className={`p-3 rounded-xl transition-all ${isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      onClick={() => setBeepInterval(0)}
                      className={`py-3 px-4 rounded-xl font-bold transition-all ${beepInterval === 0 ? `${currentTheme.bg} text-neutral-950` : (isDarkMode ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}`}
                    >
                      {t.beepNone}
                    </button>
                  </div>
                </div>

                {/* Mode */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
