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

app = FastAPI(title="Clahan Academy AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama-service:11434")
YOLO_URL = os.getenv("YOLO_URL", "http://yolo-service:8081")
FACE_URL = os.getenv("FACE_URL", "http://face-service:8082")
OCR_URL = os.getenv("OCR_URL", "http://ocr-service:8083")

class FeedbackRequest(BaseModel):
    score: int
    percentage: int
    examType: str
    examName: str

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
        
        # Initialize default response
        face_count = 1
        objects_detected = []
        violations = []
        notes_text = None
        
        # 1. Query YOLO Container for objects (mobile phone, book, notes)
        try:
            files = {'file': ('frame.jpg', io.BytesIO(img_bytes), 'image/jpeg')}
            yolo_res = requests.post(f"{YOLO_URL}/detect", files=files, timeout=2.0)
            if yolo_res.status_code == 200:
                objects_detected = yolo_res.json().get("objects", [])
        except Exception:
            # Fallback simulator: detect based on specific test tags in image metadata if any, or default to safe
            pass

        # 2. Query Face Recognition Container
        try:
            files = {'file': ('frame.jpg', io.BytesIO(img_bytes), 'image/jpeg')}
            face_res = requests.post(f"{FACE_URL}/face-count", files=files, timeout=2.0)
            if face_res.status_code == 200:
                face_count = face_res.json().get("face_count", 1)
        except Exception:
            pass

        # 3. Query Tesseract OCR Service if book/notes are detected
        if "book" in objects_detected or "cell phone" in objects_detected:
            try:
                files = {'file': ('frame.jpg', io.BytesIO(img_bytes), 'image/jpeg')}
                ocr_res = requests.post(f"{OCR_URL}/ocr", files=files, timeout=2.0)
                if ocr_res.status_code == 200:
                    notes_text = ocr_res.json().get("text", "")
            except Exception:
                pass

        # Evaluate violations
        if face_count == 0:
            violations.append("NO_FACE_DETECTED")
        elif face_count > 1:
            violations.append("MULTIPLE_FACES_DETECTED")

        if "cell phone" in objects_detected:
            violations.append("MOBILE_PHONE_DETECTED")
        if "book" in objects_detected:
            violations.append("BOOK_DETECTED")
        if "notes" in objects_detected or (notes_text and len(notes_text.strip()) > 15):
            violations.append("NOTES_DETECTED")

        return {
            "faceCount": face_count,
            "objectsDetected": objects_detected,
            "ocrText": notes_text,
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
