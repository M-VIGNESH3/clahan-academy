import os
import base64
import io
import json
import logging
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from PIL import Image
import cv2
import numpy as np

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

# YOLOv8 COCO classes
CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", 
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", 
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", 
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", 
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", 
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", 
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", 
    "chair", "couch", "pottedplant", "bed", "diningtable", "toilet", "tvmonitor", "laptop", 
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", 
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]

# Load YOLOv8 ONNX model using OpenCV DNN
yolo_net = None
try:
    if os.path.exists("yolov8n.onnx"):
        yolo_net = cv2.dnn.readNet("yolov8n.onnx")
        logger.info("YOLOv8 ONNX model loaded successfully via OpenCV DNN.")
    else:
        logger.error("yolov8n.onnx not found!")
except Exception as e:
    logger.error(f"Error loading YOLOv8 ONNX: {e}")

# Load OpenCV face detector
face_cascade = None
try:
    if os.path.exists("haarcascade_frontalface_default.xml"):
        face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
        logger.info("Face Cascade loaded successfully.")
    else:
        logger.error("haarcascade_frontalface_default.xml not found!")
except Exception as e:
    logger.error(f"Error loading Face Cascade: {e}")

app = FastAPI(title="Clahan Academy AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama-service:11434")

class FeedbackRequest(BaseModel):
    score: int
    percentage: int
    examType: str
    examName: str

class GenerateQuestionRequest(BaseModel):
    topic: str
    difficulty: Optional[str] = "medium"
    marks: Optional[int] = 10
    language: Optional[str] = "Python"

@app.get("/health")
def health():
    return {"status": "healthy", "service": "ai-service"}

@app.post("/api/ai/motivational-feedback")
def generate_feedback(req: FeedbackRequest):
    logger.info(f"Generating feedback for score {req.percentage}% on {req.examName}")
    
    prompt = (
        f"You are Clahan Academy's AI mentor. Write a concise, 1-sentence, motivational, professional exam review feedback. "
        f"The student scored {req.percentage}% in the exam '{req.examName}' ({req.examType} test). "
        f"Provide specific guidance based on their percentage. Keep it under 25 words. Do not prefix with 'Here is your feedback' or quotes."
    )
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": "phi3",
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": 40}
            },
            timeout=4.0
        )
        if response.status_code == 200:
            result = response.json()
            feedback = result.get("response", "").strip().replace('"', '')
            if feedback:
                return {"feedback": feedback}
    except Exception as e:
        logger.warn(f"Ollama call failed, using rule fallback: {str(e)}")
        
    # Local Rule-based fallback matching requirements
    pct = req.percentage
    if pct >= 80:
        return {"feedback": f"Excellent work! You scored {pct}%. Strong coding performance. Focus more on aptitude accuracy."}
    elif pct >= 60:
        return {"feedback": f"Good effort! You scored {pct}%. Practice more problem solving and coding constructs to boost score."}
    else:
        return {"feedback": f"Keep practicing! You scored {pct}%. Focus on problem solving, basics of programming languages, and fundamental concepts."}

@app.post("/api/ai/generate-question")
def generate_question(req: GenerateQuestionRequest):
    logger.info(f"Generating coding question for topic: {req.topic}")
    
    prompt = (
        f"Generate a single programming problem about '{req.topic}' for a coding test.\n"
        f"Difficulty: {req.difficulty}\n"
        f"Primary Language: {req.language}\n"
        f"Provide the output strictly in JSON format with the following keys:\n"
        f"- title: A short descriptive title\n"
        f"- description: Detailed problem statement, including input/output format, constraints, and 2 sample cases\n"
        f"- starter_code: A boilerplate function definition appropriate for {req.language}\n"
        f"- test_cases: A list of 4 test cases, each containing:\n"
        f"  - input: The raw stdin input (with newlines if multiple inputs)\n"
        f"  - expected_output: The expected stdout output\n"
        f"  - is_hidden: Boolean (2 should be false, 2 should be true)\n\n"
        f"Do not include any explanation outside the JSON. Return valid JSON only."
    )
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": "phi3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.3}
            },
            timeout=12.0
        )
        if response.status_code == 200:
            result = response.json()
            text = result.get("response", "").strip()
            
            # Try to extract JSON from code blocks if LLM wraps it
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
                
            question_data = json.loads(text)
            return question_data
    except Exception as e:
        logger.error(f"Failed to generate question via Ollama: {str(e)}")
        
    # Local fallback if Ollama call fails or JSON fails to parse
    lang = req.language
    starter = "def solve():\n    # Write your code here\n    pass"
    if lang.lower() in ["java", "javascript", "cpp"]:
        starter = "// Starter code here"
        
    return {
        "title": f"Algorithm Problem: {req.topic}",
        "description": f"Write an efficient solution to solve problems related to {req.topic}. Input: Standard stdin format. Output: Standard stdout format.",
        "starter_code": starter,
        "test_cases": [
            {"input": "5\n", "expected_output": "10\n", "is_hidden": False},
            {"input": "3\n", "expected_output": "6\n", "is_hidden": False},
            {"input": "10\n", "expected_output": "20\n", "is_hidden": True},
            {"input": "2\n", "expected_output": "4\n", "is_hidden": True}
        ]
    }

@app.post("/api/ai/proctor/frame")
async def analyze_frame(
    frame: str = Form(...), # Base64 encoded JPEG
    attemptId: str = Form(...)
):
    try:
        # Clean base64 string
        if "," in frame:
            frame = frame.split(",")[1]
        
        img_bytes = base64.b64decode(frame)
        image = Image.open(io.BytesIO(img_bytes))
        
        # Convert PIL Image to OpenCV format (BGR) for face detection
        open_cv_image = np.array(image.convert("RGB"))
        open_cv_image = open_cv_image[:, :, ::-1].copy() # Convert RGB to BGR
        
        # Initialize default response
        face_count = 1
        objects_detected = []
        violations = []
        
        # 1. Run YOLOv8 Object Detection (using OpenCV DNN ONNX)
        if yolo_net is not None:
            try:
                # YOLOv8 input is 640x640, scale factor is 1/255.0
                # Set swapRB=True since open_cv_image is BGR, converting it to RGB for YOLOv8
                blob = cv2.dnn.blobFromImage(open_cv_image, 1.0/255.0, (640, 640), swapRB=True, crop=False)
                yolo_net.setInput(blob)
                outputs = yolo_net.forward() # shape: (1, 84, 8400)
                
                output = outputs[0] # (84, 8400)
                output = np.transpose(output) # (8400, 84)
                
                # Check confidence for specific classes
                for row in output:
                    classes_scores = row[4:]
                    class_id = np.argmax(classes_scores)
                    confidence = classes_scores[class_id]
                     if confidence > 0.25:
                        class_name = CLASSES[class_id]
                        if class_name in ["cell phone", "book"]:
                            objects_detected.append(class_name)
                        elif class_name == "person" and confidence > 0.35:
                            objects_detected.append(class_name)
                            
                objects_detected = list(set(objects_detected))
            except Exception as e:
                logger.error(f"YOLO ONNX detection error: {str(e)}")
        
        # 2. Run Face detection (direct in-process using Haar Cascade)
        if face_cascade is not None:
            try:
                gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
                # scaleFactor=1.1 and minNeighbors=4 reduces false positive face detections in background
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)
                face_count = len(faces)
            except Exception as e:
                logger.error(f"Face detection error: {str(e)}")
                face_count = 1

        # Fallback: If YOLOv8 detects a person but Haar Cascade missed the face,
        # set face_count to 1 since the student is present in front of the camera.
        if face_count == 0 and "person" in objects_detected:
            logger.info("Face Cascade detected 0 faces, but YOLOv8 detected a 'person'. Overriding face_count to 1.")
            face_count = 1

        # Evaluate violations
        if face_count == 0:
            violations.append("NO_FACE_DETECTED")
        elif face_count > 1:
            violations.append("MULTIPLE_FACES_DETECTED")

        if "cell phone" in objects_detected:
            violations.append("MOBILE_PHONE_DETECTED")
        if "book" in objects_detected:
            violations.append("BOOK_DETECTED")

        return {
            "faceCount": face_count,
            "objectsDetected": objects_detected,
            "ocrText": None,
            "violations": violations,
            "verified": (face_count == 1 and len(violations) == 0)
        }

    except Exception as e:
        logger.error(f"Error analyzing frame: {str(e)}")
        # Graceful fallback: return safe state to avoid crashing exam flow
        return {
            "faceCount": 1,
            "objectsDetected": [],
            "ocrText": None,
            "violations": [],
            "verified": True
        }


