# ai-service.py
from fastapi import FastAPI, File, UploadFile
import shutil
import os

# --- Local YOLO imports ---
from ultralytics import YOLO

# --- Roboflow API imports ---
from roboflow import Roboflow

# --------------------------
# FastAPI app
# --------------------------
app = FastAPI()

# --------------------------
# Local YOLO setup
# --------------------------
LOCAL_MODEL_PATH = "yolov8n.pt"
yolo_model = YOLO(LOCAL_MODEL_PATH)

UPLOAD_FOLDER = "uploads"
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --------------------------
# Roboflow API setup
# --------------------------
# Replace these with your actual Roboflow info
ROBOFLOW_API_KEY = "MlKh3JvZM3arQi4x3bb5"
WORKSPACE = "aanubhavs-workspace"
PROJECT = "pothole-detection-yolo-v8-icnrt"
VERSION = 1  # Roboflow model version

rf = Roboflow(api_key=ROBOFLOW_API_KEY)
rf_project = rf.workspace(WORKSPACE).project(PROJECT)
rf_model = rf_project.version(VERSION).model

# --------------------------
# Routes
# --------------------------
@app.get("/")
def home():
    return {"message": "AI pothole detection server running"}


@app.post("/detect-local")
async def detect_local(file: UploadFile = File(...)):
    """
    Detect potholes using local YOLO model
    """
    file_path = f"{UPLOAD_FOLDER}/{file.filename}"

    # Save uploaded image
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Run YOLO detection
    results = yolo_model(file_path, imgsz=640)

    detected_objects = []
    for r in results:
        for box in r.boxes:
            cls = int(box.cls)
            name = yolo_model.names[cls]
            detected_objects.append(name)

    return {
        "detected_objects": detected_objects,
        "message": "Local YOLO detection complete"
    }


@app.post("/detect-roboflow")
async def detect_roboflow(file: UploadFile = File(...)):
    """
    Detect potholes using Roboflow hosted model
    """
    file_path = f"{UPLOAD_FOLDER}/{file.filename}"

    # Save uploaded image
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Run Roboflow detection
    predictions = rf_model.predict(file_path, confidence=30, overlap=50).json()

    return {
        "predictions": predictions,
        "message": "Roboflow API detection complete"
    }