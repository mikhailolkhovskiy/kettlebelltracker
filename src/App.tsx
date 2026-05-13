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
    cameraDisabled: "Camera Disabled",
    defaultCamera: "Default Camera",
    cameraError: "Camera Access Denied",
    workoutSummary: "Workout Summary",
    close: "Close",
    fontSize: "Font Size",
    autoStart: "Auto-start"
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
    cameraDisabled: "Камера отключена",
    defaultCamera: "Камера по умолчанию",
    cameraError: "Доступ к камере запрещен",
    workoutSummary: "Итоги тренировки",
    close: "Закрыть",
    fontSize: "Размер шрифта",
    autoStart: "Автостарт"
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
  
  // Settings state with persistence
  const [lang, setLang] = useState<'en' | 'ru'>(() => {
    const saved = localStorage.getItem('kettlebell-lang');
    if (saved) return saved as 'en' | 'ru';
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.split('-')[0];
      return browserLang === 'ru' ? 'ru' : 'en';
    }
    return 'en';
  });
  const [theme, setTheme] = useState<keyof typeof themes>(() => {
    return (localStorage.getItem('kettlebell-theme') as keyof typeof themes) || 'emerald';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('kettlebell-darkmode');
    return saved !== null ? saved === 'true' : true;
  });
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem('kettlebell-voice');
    return saved !== null ? saved === 'true' : true;
  });
  const [beepInterval, setBeepInterval] = useState(() => {
    return parseInt(localStorage.getItem('kettlebell-beep') || '0', 10);
  });
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(() => {
    const saved = localStorage.getItem('kettlebell-record');
    return saved !== null ? saved === 'true' : true; // Default to true as requested
  });
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('kettlebell-camera') || '';
  });
  const [hudScale, setHudScale] = useState<number>(() => {
    return parseFloat(localStorage.getItem('kettlebell-hud-scale') || '1');
  });
  const [isAutoStartEnabled, setIsAutoStartEnabled] = useState(() => {
    return localStorage.getItem('kettlebell-autostart') === 'true';
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Persistence effects
  useEffect(() => localStorage.setItem('kettlebell-lang', lang), [lang]);
  useEffect(() => localStorage.setItem('kettlebell-theme', theme), [theme]);
  useEffect(() => localStorage.setItem('kettlebell-darkmode', isDarkMode.toString()), [isDarkMode]);
  useEffect(() => localStorage.setItem('kettlebell-voice', isVoiceEnabled.toString()), [isVoiceEnabled]);
  useEffect(() => localStorage.setItem('kettlebell-beep', beepInterval.toString()), [beepInterval]);
  useEffect(() => localStorage.setItem('kettlebell-record', isRecordingEnabled.toString()), [isRecordingEnabled]);
  useEffect(() => localStorage.setItem('kettlebell-camera', selectedCameraId), [selectedCameraId]);
  useEffect(() => localStorage.setItem('kettlebell-hud-scale', hudScale.toString()), [hudScale]);
  useEffect(() => localStorage.setItem('kettlebell-autostart', isAutoStartEnabled.toString()), [isAutoStartEnabled]);

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
  const isCameraEnabled = selectedCameraId !== 'off';
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  // Refs for MediaPipe objects to prevent re-initialization
  const poseRef = useRef<Pose | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const isComponentMounted = useRef(true);
  const lastRepTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Use a ref for state values

  // Use a ref for state values needed in the callback to avoid re-creating the callback
  const stateRef = useRef({ isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, primaryColor: currentTheme.primary, isAutoStartEnabled, countdown });
  useEffect(() => {
    stateRef.current = { isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, primaryColor: currentTheme.primary, isAutoStartEnabled, countdown };
  }, [isActive, isHandUp, seconds, reps, speed, leftReps, rightReps, currentTheme.primary, isAutoStartEnabled, countdown]);

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
        playBeep(440, 0.3, 'triangle', 0.4); // Sharper and louder for periodic beep
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

    // Calculate dimensions to maintain aspect ratio (letterboxing/contain)
    const imgWidth = results.image.width;
    const imgHeight = results.image.height;
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    const imgRatio = imgWidth / imgHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imgRatio > canvasRatio) {
      // Image is wider than canvas relative to its height
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else {
      // Image is taller than canvas relative to its width
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgRatio;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = 0;
    }

    // 1. Draw to Recording Canvas (Clean video + HUD, no skeleton)
    recordingCtx.save();
    recordingCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    recordingCtx.drawImage(results.image, offsetX, offsetY, drawWidth, drawHeight);

    // 2. Draw to Main Canvas (Video + Skeleton + HUD)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    canvasCtx.drawImage(results.image, offsetX, offsetY, drawWidth, drawHeight);

    if (results.poseLandmarks) {
      // We need to transform the landmarks to match the drawn image position and size
      // since drawing_utils draw landmarks relative to canvas size
      canvasCtx.save();
      // Adjust landmarks drawing to the letterboxed area
      // However, MediaPipe's drawing_utils expect to draw on the whole canvas.
      // So we translate and scale the context so that 0-1 matches our image area.
      canvasCtx.translate(offsetX, offsetY);
      canvasCtx.scale(drawWidth / canvasWidth, drawHeight / canvasHeight);
      
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
        { color: '#00FF00', lineWidth: 4 });
      drawLandmarks(canvasCtx, results.poseLandmarks,
        { color: '#FF0000', lineWidth: 2 });
      canvasCtx.restore();

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

      const { 
        isActive: currentIsActive, 
        isHandUp: currentIsHandUp, 
        seconds: currentSeconds, 
        reps: currentReps, 
        speed: currentSpeed, 
        leftReps: currentLeftReps, 
        rightReps: currentRightReps, 
        primaryColor,
        isAutoStartEnabled: currentAutoStart,
        countdown: currentCountdown
      } = stateRef.current;

      // Auto-start logic: If enabled and not active, start workout on first hand raise
      if (currentAutoStart && !currentIsActive && currentCountdown === null && handIsAboveHead) {
        handleStart(true);
        return; // Don't process further in this frame to avoid double triggering
      }

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

      // Draw HUD only on Recording Canvas, not on Main Canvas (to avoid redundancy with React UI)
      if (currentIsActive) {
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        const drawHUD = (ctx: CanvasRenderingContext2D) => {
          const padding = 40;
          
          const drawRoundedRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            if (c.roundRect) {
              c.roundRect(x, y, w, h, r);
            } else {
              c.rect(x, y, w, h);
            }
            c.fill();
          };

          ctx.save();
          
          // Boxes for Recording HUD
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          drawRoundedRect(ctx, padding, padding, 220, 100, 24); // Timer
          drawRoundedRect(ctx, width - 220 - padding, padding, 220, 100, 24); // Reps
          drawRoundedRect(ctx, width - 220 - padding, height - 100 - padding, 220, 100, 24); // RPM

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Timer
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = 'bold 18px Inter, sans-serif';
          ctx.fillText(t.time.toUpperCase(), padding + 110, padding + 30);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 44px monospace';
          ctx.fillText(formatTime(currentSeconds), padding + 110, padding + 70);

          // Reps
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = 'bold 18px Inter, sans-serif';
          ctx.fillText(t.totalReps.toUpperCase(), width - 110 - padding, padding + 30);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 54px Inter, sans-serif';
          ctx.fillText(currentReps.toString(), width - 110 - padding, padding + 70);

          // RPM
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = 'bold 18px Inter, sans-serif';
          ctx.fillText(t.rpm.toUpperCase(), width - 110 - padding, height - 70 - padding);
          ctx.fillStyle = primaryColor;
          ctx.font = 'bold 44px Inter, sans-serif';
          ctx.fillText(currentSpeed.toString(), width - 110 - padding, height - 30 - padding);
          
          ctx.restore();
        };

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

  const handleStart = (immediate: boolean | React.MouseEvent = false) => {
    const isImmediate = immediate === true;
    
    // Prime speech synthesis to unlock it on mobile/Safari
    if (isVoiceEnabled && window.speechSynthesis) {
      const prime = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(prime);
    }
    
    if (isImmediate) {
      setCountdown(0);
    } else {
      setCountdown(5);
      playBeep(); // Start beep
    }
  };

  const stopWorkout = useCallback(() => {
    setIsActive(false);
    
    // Add the final partial minute to the log if workout was ongoing
    if (seconds > 0) {
      setWorkoutLog(prev => {
        const totalRepsSoFar = reps;
        const leftRepsSoFar = leftReps;
        const rightRepsSoFar = rightReps;
        
        const prevTotal = prev.reduce((acc, curr) => acc + curr.total, 0);
        const prevLeft = prev.reduce((acc, curr) => acc + curr.left, 0);
        const prevRight = prev.reduce((acc, curr) => acc + curr.right, 0);

        const currentMinute = parseFloat((seconds / 60).toFixed(2));
        
        // Only add if there's any work in this last period OR it's been more than a minute since last log
        const diffTotal = totalRepsSoFar - prevTotal;
        if (diffTotal > 0 || currentMinute > lastLoggedMinute.current) {
          return [...prev, {
            minute: currentMinute,
            left: leftRepsSoFar - prevLeft,
            right: rightRepsSoFar - prevRight,
            total: diffTotal
          }];
        }
        return prev;
      });
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setShowSummary(true);
  }, [seconds, reps, leftReps, rightReps]);

  return (
    <div className={`fixed inset-0 ${isDarkMode ? 'bg-black text-neutral-100' : 'bg-neutral-50 text-neutral-900'} font-sans selection:bg-emerald-500/30 overflow-hidden`}>
      {/* Background: Camera View */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {cameraError ? (
          <div className="flex flex-col items-center gap-4 text-center p-8 max-w-sm z-10">
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
          <div className="flex flex-col items-center gap-4 text-neutral-500 z-10">
            <CameraOff size={64} strokeWidth={1.5} />
            <p className="text-lg font-medium">Camera is disabled</p>
          </div>
        )}
      </div>

      {/* UI Overlay Layers */}
      
      {/* 1. Header: Title and Settings - Hide during training for a cleaner look */}
      <AnimatePresence>
        {!isActive && countdown === null && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 p-4 md:p-6 flex items-start justify-between z-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
          >
            <div className="flex flex-col pointer-events-auto min-w-0">
              <h1 className="text-[clamp(1rem,4.5vw,1.5rem)] md:text-3xl font-black tracking-tight text-white flex items-center gap-2 drop-shadow-lg whitespace-nowrap overflow-hidden">
                <Activity className={`shrink-0 ${currentTheme.text}`} size={20} />
                <span className="truncate">{t.title}</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-neutral-500" />
                <span className="text-white/60 text-[9px] font-bold uppercase tracking-widest drop-shadow-sm whitespace-nowrap">
                  Ready
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 pointer-events-auto shrink-0 ml-4">
              {availableCameras.length > 0 && (
                <div className="relative">
                  <div className={`p-2.5 rounded-2xl border backdrop-blur-md transition-all ${isDarkMode ? 'bg-black/60 border-white/20 text-white hover:bg-black/80' : 'bg-white/80 border-black/10 text-neutral-900 hover:bg-white'}`}>
                    {isCameraEnabled ? <CameraIcon size={18} /> : <CameraOff size={18} />}
                  </div>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title={t.selectCamera}
                  >
                    <option value="off">{t.cameraDisabled}</option>
                    {availableCameras.map((camera, idx) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `${t.camera} ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button 
                onClick={() => setShowSettings(true)}
                className={`p-2.5 rounded-2xl backdrop-blur-md border transition-all ${isDarkMode ? 'bg-black/60 border-white/20 text-white hover:bg-black/80' : 'bg-white/80 border-black/10 text-neutral-900 hover:bg-white'}`}
              >
                <SettingsIcon size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. HUD: Stats (Time, Reps, RPM) */}
      <div className="absolute inset-x-0 top-1/4 flex flex-col items-center justify-center pointer-events-none z-20">
        <div 
          className="flex flex-col items-center gap-2 transition-transform duration-300 ease-out"
          style={{ transform: `scale(${hudScale})` }}
        >
          {/* Large Timer */}
          <div className="flex flex-col items-center">
            <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] mb-1 drop-shadow-sm">{t.time}</span>
            <div className={`text-6xl md:text-9xl font-black tabular-nums transition-all ${isActive ? 'text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]' : 'text-white/30'}`}>
              {formatTime(seconds)}
            </div>
          </div>
          
          {/* Stats Row */}
          <div className="flex items-center gap-12 md:gap-24 mt-4">
            <div className="flex flex-col items-center">
              <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] mb-1 drop-shadow-sm">{t.reps}</span>
              <div className="text-5xl md:text-7xl font-black text-white drop-shadow-xl">
                {reps}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] mb-1 drop-shadow-sm">{t.rpm}</span>
              <div className={`text-5xl md:text-7xl font-black ${currentTheme.text} drop-shadow-xl`}>
                {speed}
              </div>
            </div>
          </div>
        </div>

        {/* HUD Font Size Slider - Vertical on the right side */}
        <AnimatePresence>
          {!isActive && countdown === null && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center gap-4 bg-black/40 backdrop-blur-xl p-3 md:p-4 rounded-full border border-white/10 z-30"
            >
              <div className="flex flex-col items-center gap-4 h-48 md:h-64 py-2">
                <button onClick={() => setHudScale(prev => Math.min(2, prev + 0.1))} className="text-white/40 hover:text-white transition-colors">
                  <Plus size={16} />
                </button>
                
                <div className="relative flex-1 w-8 flex items-center justify-center">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={hudScale}
                    onChange={(e) => setHudScale(parseFloat(e.target.value))}
                    className={`absolute w-32 md:w-48 h-1.5 appearance-none bg-white/20 rounded-full cursor-pointer -rotate-90`}
                    style={{ accentColor: currentTheme.primary }}
                  />
                </div>

                <button onClick={() => setHudScale(prev => Math.max(0.5, prev - 0.1))} className="text-white/40 hover:text-white transition-colors">
                  <Minus size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Bottom Controls: Start/Stop */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        {!isActive && countdown === null ? (
          <button
            onClick={handleStart}
            className={`group flex items-center justify-center gap-3 md:gap-4 ${currentTheme.bg} hover:scale-105 active:scale-95 text-neutral-950 px-8 md:px-12 py-4 md:py-6 rounded-[2rem] font-black text-[clamp(1rem,4vw,1.5rem)] md:text-2xl transition-all shadow-2xl ${currentTheme.shadow} whitespace-nowrap`}
          >
            <Play className="fill-current shrink-0" size={20} />
            {t.start}
          </button>
        ) : isActive ? (
          <button
            onClick={stopWorkout}
            className="group flex items-center justify-center gap-3 md:gap-4 bg-red-600 hover:bg-red-500 hover:scale-105 active:scale-95 text-white px-8 md:px-12 py-4 md:py-6 rounded-[2rem] font-black text-[clamp(1rem,4vw,1.5rem)] md:text-2xl transition-all shadow-2xl shadow-red-500/40 whitespace-nowrap"
          >
            <Square className="fill-current shrink-0" size={20} />
            {t.stop}
          </button>
        ) : (
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xl text-white/50 px-8 py-4 rounded-[2rem] font-black text-lg md:text-xl border border-white/10 whitespace-nowrap">
            <Timer size={20} className="animate-spin-slow shrink-0" />
            {t.preparing}
          </div>
        )}
      </div>

      {/* 4. Feedback & Countdowns */}
      <AnimatePresence>
        {isHandUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40"
          >
            <div className="bg-emerald-500/20 backdrop-blur-3xl border border-emerald-500/30 p-12 md:p-16 rounded-full drop-shadow-[0_0_50px_rgba(16,185,129,0.4)]">
              <Zap className="w-20 h-20 md:w-32 md:h-32 text-emerald-400 fill-emerald-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[60]"
          >
            <div className="flex flex-col items-center gap-8">
              <span className="text-white/40 text-xl font-black uppercase tracking-[1em] motion-safe:animate-pulse">
                {t.getReady}
              </span>
              <motion.span 
                key={countdown}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`text-[240px] md:text-[320px] font-black ${currentTheme.text} leading-none tabular-nums drop-shadow-2xl`}
              >
                {countdown}
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

                {/* Camera Selection */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                    <CameraIcon size={14} />
                    {t.selectCamera}
                  </div>
                  <div className="relative">
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className={`w-full py-3 px-4 rounded-xl font-bold appearance-none outline-none border-2 transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-emerald-500' : 'bg-neutral-100 border-neutral-200 text-neutral-900 focus:border-emerald-500'}`}
                    >
                      <option value="off">{t.cameraDisabled}</option>
                      {availableCameras.map((camera, idx) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label || `${t.camera} ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
                  </div>
                </div>

                {/* Recording Toggle */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                      <Video size={14} />
                      {t.record}
                    </div>
                    <button
                      onClick={() => setIsRecordingEnabled(!isRecordingEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isRecordingEnabled ? currentTheme.bg : 'bg-neutral-700'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRecordingEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Auto-start Toggle */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                      <Zap size={14} />
                      {t.autoStart}
                    </div>
                    <button
                      onClick={() => setIsAutoStartEnabled(!isAutoStartEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isAutoStartEnabled ? currentTheme.bg : 'bg-neutral-700'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoStartEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Voice Toggle */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                      <Volume2 size={14} />
                      {t.voice}
                    </div>
                    <button
                      onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isVoiceEnabled ? currentTheme.bg : 'bg-neutral-700'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVoiceEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                      />
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

                {/* Theme and Mode Moved */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Workout Summary Modal */}
      <AnimatePresence>
        {showSummary && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSummary(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className={`relative w-full max-w-lg max-h-[90vh] flex flex-col ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} border rounded-[2rem] shadow-2xl overflow-hidden`}
            >
              <div className="p-6 flex items-center justify-between border-b border-neutral-800/10">
                <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-tight">
                  <Activity size={20} className={currentTheme.text} />
                  {t.workoutSummary}
                </h2>
                <button 
                  onClick={() => setShowSummary(false)}
                  className={`p-2 ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-600'} rounded-xl transition-colors`}
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className={`p-5 rounded-2xl ${isDarkMode ? 'bg-neutral-800/50' : 'bg-neutral-100'} border ${isDarkMode ? 'border-white/5' : 'border-black/5'} text-center`}>
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">{t.totalReps}</div>
                    <div className="text-4xl font-black tabular-nums">{reps}</div>
                  </div>
                  <div className={`p-5 rounded-2xl ${isDarkMode ? 'bg-neutral-800/50' : 'bg-neutral-100'} border ${isDarkMode ? 'border-white/5' : 'border-black/5'} text-center`}>
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">{t.time}</div>
                    <div className="text-4xl font-black tabular-nums">{formatTime(seconds)}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase tracking-widest px-4 group">
                    <span className="flex items-center gap-2"><History size={14} /> {t.workoutLog}</span>
                    <div className="flex">
                      <span className={`w-16 text-center ${currentTheme.text}`}>{t.left}</span>
                      <span className="w-16 text-center text-blue-500">{t.right}</span>
                    </div>
                  </div>
                  
                  {workoutLog.slice().reverse().map((log, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-center justify-between p-4 rounded-2xl ${isDarkMode ? 'bg-neutral-800/30 hover:bg-neutral-800/50' : 'bg-neutral-50 hover:bg-neutral-100'} border ${isDarkMode ? 'border-white/5' : 'border-black/5'} transition-colors`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-lg ${isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-white text-neutral-600 shadow-sm'}`}>
                          {Math.floor(log.minute)}'
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{log.total} <span className="text-[10px] font-normal opacity-50 uppercase tracking-widest">{t.reps}</span></span>
                          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Minute {log.minute}</span>
                        </div>
                      </div>
                      <div className="flex font-black">
                        <span className={`w-16 text-center text-2xl ${currentTheme.text}`}>{log.left}</span>
                        <span className="w-16 text-center text-2xl text-blue-500">{log.right}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="p-6">
                <button
                  onClick={() => setShowSummary(false)}
                  className={`w-full py-4 rounded-2xl font-bold text-neutral-950 shadow-lg ${currentTheme.bg} ${currentTheme.shadow} hover:opacity-90 active:scale-[0.98] transition-all`}
                >
                  {t.close}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
