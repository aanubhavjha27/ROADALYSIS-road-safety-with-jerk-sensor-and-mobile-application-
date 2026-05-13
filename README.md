# ROADALYSIS


<div align="center">

![Road Safety Banner](screenshots/banner.png)

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![PlatformIO](https://img.shields.io/badge/PlatformIO-FF7F00?style=for-the-badge&logo=platformio&logoColor=white)](https://platformio.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

**A smart road safety system that automatically detects potholes using an MPU6050 sensor and allows users to report potholes using an AI/ML model.**

[View Demo](#demo) • [Report Bug](issues) • [Request Feature](issues)

</div>

---

## 📋 Table of Contents

- [About The Project](#about-the-project)
- [Demo](#demo)
- [Screenshots](#screenshots)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Hardware Setup](#hardware-setup)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [ML Model](#ml-model)
- [Contributing](#contributing)
- [License](#license)

---

## 📖 About The Project

**Road Safety Monitor** is an end-to-end road safety solution that combines **IoT hardware**, a **mobile application**, and a **machine learning model** to detect and report potholes in real time.

When a vehicle experiences a sudden jerk (pothole), the **MPU6050 accelerometer/gyroscope** sensor detects it and automatically logs the GPS coordinates (latitude & longitude) to the database. The data is then displayed on a live map in the mobile app.

Users can also **manually report potholes** by clicking a photo inside the app. An ML model powered by **Roboflow** analyzes the image and confirms whether it is a pothole or not.

---

## 🎬 Demo

<div align="center">

### 📱 App Demo Video
https://github.com/user-attachments/assets/1186ee7a-83a7-43ac-9dc4-9b9c0d5be455

</div>

---

## 📸 Screenshots

<div align="center">

### Home Screen (with a test path)
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/2e5c7f41-383f-4dfc-badd-b55d53dfe8ba" />
 
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/5bbf95fd-5872-4aee-9ca4-58ce474a7936" />

### Pothole Detection
<div flex="row">
<div >
  <div>
    
 Before detection
  </div>
  <div>
 <img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/ad9b2a14-98ba-400e-8cd7-bc10c76ae9b4" />
  </div>
</div>
</div>

-------------------------------
<div> 
  <div>
    
After detection
  </div>
  <div>
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/ccc21fc4-e308-4ded-982a-aa0601bc3290" />
  </div>
</div>

</div>

---

## ✨ Features

### 🔧 Automatic Detection (Hardware)
- ✅ Detects road jerks using **MPU6050** accelerometer/gyroscope sensor
- ✅ Calculates jerk value in real time using **PlatformIO**
- ✅ Captures **GPS coordinates (lat/long)** at the moment of jerk
- ✅ Automatically sends data to the backend over WiFi

### 📱 Mobile App (React Native)
- ✅ Live **map view** of all detected potholes
- ✅ View pothole **history and jerk values**
- ✅ **Manual pothole reporting** by clicking a photo
- ✅ Real-time updates from the backend

### 🤖 ML Model (Pothole Detection)
- ✅ Users can click a photo of a suspected pothole
- ✅ Image is analyzed by an **AI/ML model (Roboflow)**
- ✅ Model confirms whether it is a **pothole or not**
- ✅ Confirmed potholes are saved to the database with location

### 🖥️ Backend (Node.js + Express)
- ✅ REST API for hardware and mobile app communication
- ✅ **MongoDB** database for storing pothole records
- ✅ ML model bridge service for image analysis
  -------------
## SCREENSHOTS OF THE APPLICATION
------
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/beec2653-7eee-47e3-817e-9e61e5a0e2e3" />
|
|
|
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/54de94ab-9011-4e91-9da8-2a359b13f65c" />
|
|
|
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/588b3b00-2737-4b0c-95f2-8dc321cc1c17" />
|
|
|
<img width="180" height="400" alt="Image" src="https://github.com/user-attachments/assets/4b3b4fc1-4334-4118-aa9d-4c004e35a348" />


