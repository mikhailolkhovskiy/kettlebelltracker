# Kettlebell Tracker

An AI-powered real-time kettlebell workout tracker that uses computer vision to count your repetitions, analyze your form, and provide live feedback.

## 🚀 Overview

This application leverages **MediaPipe Pose** to detect body landmarks directly in your browser. It's designed for kettlebell enthusiasts who want to track their performance (snatches, jerks, swings) without manual counting.

## ✨ Key Features

- **AI Pose Detection**: Real-time tracking of 33 body landmarks using MediaPipe.
- **Smart Rep Counting**:
  - Detects when the kettlebell is fully locked out overhead.
  - **Straight Arm Detection**: Analyzes elbow angles (>150°) to ensure proper form.
  - **Dynamic Thresholds**: Automatically adjusts detection based on your distance from the camera.
  - **Double Hand Support**: Correctly counts exercises performed with two kettlebells simultaneously (e.g., double jerks).
- **Live Feedback**:
  - **Voice Count**: Real-time audio counting of your repetitions.
  - **Beep Intervals**: Configurable sound signals (1-30s) for hold-based exercises (e.g., 5s hold at top/bottom).
  - **HUD Overlay**: On-screen display of time, reps, RPM (reps per minute), and hand-specific stats.
- **Workout Analytics**:
  - Minute-by-minute summary of your performance.
  - RPM calculation using a 20-second sliding window.
- **Video Recording**: Record your session with the skeletal overlay and stats directly on the video.
- **Privacy First**: All processing is done locally in your browser. No video data is ever sent to a server.
- **Responsive & Modern UI**: Fully optimized for mobile (portrait/landscape) and desktop with Dark/Light mode support.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Computer Vision**: @mediapipe/pose
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Audio**: Web Audio API & Web Speech API

## 📦 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A webcam or mobile camera

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/kettlebell-tracker.git
   cd kettlebell-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`.

## 📖 How it Works

The app uses the **MediaPipe Pose** model to extract 3D coordinates of your joints. The counting logic specifically monitors:
1. **Wrist Position**: Must be significantly above the head (nose level + dynamic offset).
2. **Elbow Angle**: Must be greater than 150 degrees to count as a "locked out" rep.
3. **Reset Phase**: The rep is only reset when the hand drops below the nose level, preventing double counts.

## 📄 License

This project is licensed under the Apache-2.0 License.
