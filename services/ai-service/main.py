import os
from dotenv import load_dotenv
load_dotenv()

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
        try:
            yolo_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
            yolo_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
            logger.info("Successfully set YOLOv8 backend to CUDA.")
        except Exception as cuda_err:
            logger.info(f"CUDA backend not available, defaulting to CPU: {cuda_err}")
        logger.info("YOLOv8 ONNX model loaded successfully via OpenCV DNN.")
    else:
        logger.error("yolov8n.onnx not found!")
except Exception as e:
    logger.error(f"Error loading YOLOv8 ONNX: {e}")

import urllib.request

# Load OpenCV face detectors
face_cascade = None
profile_cascade = None

def download_cascade_if_missing(filename: str, url: str):
    if not os.path.exists(filename):
        try:
            logger.info(f"Downloading {filename} from Github OpenCV repo...")
            urllib.request.urlretrieve(url, filename)
            logger.info(f"Successfully downloaded {filename}.")
        except Exception as e:
            logger.error(f"Failed to download {filename}: {e}")

download_cascade_if_missing(
    "haarcascade_frontalface_default.xml",
    "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml"
)
download_cascade_if_missing(
    "haarcascade_profileface.xml",
    "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_profileface.xml"
)

try:
    if os.path.exists("haarcascade_frontalface_default.xml"):
        face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
        logger.info("Frontal Face Cascade loaded successfully.")
    else:
        logger.error("haarcascade_frontalface_default.xml not found!")
        
    if os.path.exists("haarcascade_profileface.xml"):
        profile_cascade = cv2.CascadeClassifier('haarcascade_profileface.xml')
        logger.info("Profile Face Cascade loaded successfully.")
    else:
        logger.error("haarcascade_profileface.xml not found!")
except Exception as e:
    logger.error(f"Error loading Face Cascades: {e}")

import time
from insightface.app import FaceAnalysis

# Initialize InsightFace
insight_face_app = None
try:
    insight_face_app = FaceAnalysis(name='buffalo_s', providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
    insight_face_app.prepare(ctx_id=-1, det_size=(640, 640))
    logger.info("InsightFace FaceAnalysis initialized successfully.")
except Exception as e:
    logger.error(f"Error initializing InsightFace: {e}")

# Persistent Face Tracking state
attempt_trackers = {}

class AttemptTracker:
    def __init__(self, attempt_id: str):
        self.attempt_id = attempt_id
        self.state = "Face Present"  # "Face Present", "Temporary Detection Loss", "Face Lost", "Face Recovered"
        self.first_lost_time = None
        self.last_seen_time = time.time()
        self.last_transition_log = ""
        self.consecutive_absent_frames = 0
        self.consecutive_present_frames = 0

    def update(self, face_present: bool, face_confidence: float):
        now = time.time()
        old_state = self.state

        if face_present:
            self.consecutive_absent_frames = 0
            self.consecutive_present_frames += 1
            
            # Reset the lost timer immediately on the first frame of face presence
            self.first_lost_time = None
            self.last_seen_time = now
            
            if self.state in ["Temporary Detection Loss", "Face Lost"]:
                self.state = "Face Recovered"
            elif self.state == "Face Recovered":
                if self.consecutive_present_frames >= 2:
                    self.state = "Face Present"
            else:
                self.state = "Face Present"
        else:
            self.consecutive_present_frames = 0
            self.consecutive_absent_frames += 1
            
            if self.state in ["Face Present", "Face Recovered"]:
                self.state = "Temporary Detection Loss"
                self.first_lost_time = now
            elif self.state == "Temporary Detection Loss":
                # If loss persists for more than 3 seconds (approx 3 frames/seconds), confirm lost state
                elapsed_lost = now - self.first_lost_time
                if elapsed_lost >= 3.0:
                    self.state = "Face Lost"

        if self.state != old_state:
            log_msg = f"[STATE TRANSITION] Attempt: {self.attempt_id} | {old_state} -> {self.state} | Confidence: {face_confidence:.2f} | Time: {now:.1f}"
            logger.info(log_msg)
            self.last_transition_log = log_msg

        return self.state

def letterbox_image(img, target_size=(640, 640)):
    """Resize image to target_size with padding to preserve aspect ratio."""
    h, w = img.shape[:2]
    tw, th = target_size
    scale = min(tw / w, th / h)
    nw, nh = int(w * scale), int(h * scale)
    
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    
    # Create gray canvas (standard YOLO background pad color is 114)
    canvas = np.full((th, tw, 3), 114, dtype=np.uint8)
    
    # Paste resized image in the center
    dx = (tw - nw) // 2
    dy = (th - nh) // 2
    canvas[dy:dy+nh, dx:dx+nw] = resized
    return canvas, scale, dx, dy

app = FastAPI(title="Clahan Academy AI Service", version="2.0.0")
# Health check endpoints for Kubernetes liveness and readiness probes
@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "ai-service"}

@app.get("/ready")
def ready():
    return {"status": "ready", "service": "ai-service"}


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
    mcqCorrect: Optional[int] = 0
    mcqTotal: Optional[int] = 0
    codingPassedCases: Optional[int] = 0
    codingTotalCases: Optional[int] = 0

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
    )
    if req.examType in ["mcq", "both"] and req.mcqTotal > 0:
        prompt += f"They scored {req.mcqCorrect} correct out of {req.mcqTotal} MCQs. "
    if req.examType in ["coding", "both"] and req.codingTotalCases > 0:
        prompt += f"They passed {req.codingPassedCases} out of {req.codingTotalCases} coding test cases. "
    prompt += "Provide brief constructive encouragement and custom advice based on these numbers. Keep it under 25 words. Do not prefix with quotes or introductory phrases."
    
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
        else:
            raise Exception(f"Ollama returned status code {response.status_code}")
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
            timeout=50.0
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
        else:
            raise Exception(f"Ollama returned status code {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to generate question via Ollama: {str(e)}")
        
    # Local fallback if Ollama call fails or JSON fails to parse
    lang = req.language or "Python"
    topic_clean = req.topic.strip()
    
    # Generate dynamic starter code template based on language
    starter = ""
    clean_fn_name = "".join([c if c.isalnum() else "_" for c in topic_clean.lower()]).strip("_")
    if not clean_fn_name:
        clean_fn_name = "solve"
        
    if lang.lower() == "python":
        starter = f"def {clean_fn_name}(input_val):\n    # Write your solution here\n    # read input or process input_val\n    pass\n"
    elif lang.lower() == "java":
        starter = (
            f"import java.util.*;\n\n"
            f"public class Solution {{\n"
            f"    public static void main(String[] args) {{\n"
            f"        Scanner sc = new Scanner(System.in);\n"
            f"        // Write your logic here\n"
            f"    }}\n"
            f"}}\n"
        )
    elif lang.lower() in ["cpp", "c++"]:
        starter = (
            f"#include <iostream>\n"
            f"using namespace std;\n\n"
            f"int main() {{\n"
            f"    // Write your logic here\n"
            f"    return 0;\n"
            f"}}\n"
        )
    else:  # javascript
        starter = (
            f"const fs = require('fs');\n\n"
            f"function solve() {{\n"
            f"    const input = fs.readFileSync('/dev/stdin', 'utf-8');\n"
            f"    // Write your logic here\n"
            f"}}\n"
            f"solve();\n"
        )

    # Dynamic templates matching common topics
    templates = {
        "prime": {
            "title": "Prime Number Checker",
            "description": "Write a program that takes an integer `N` and prints `PRIME` if the number is prime, otherwise prints `NOT PRIME`.\n\n### Input Format\nA single line containing the integer `N`.\n\n### Output Format\nPrint `PRIME` or `NOT PRIME`.",
            "test_cases": [
                {"input": "5\n", "expected_output": "PRIME\n", "is_hidden": False},
                {"input": "4\n", "expected_output": "NOT PRIME\n", "is_hidden": False},
                {"input": "13\n", "expected_output": "PRIME\n", "is_hidden": True},
                {"input": "1\n", "expected_output": "NOT PRIME\n", "is_hidden": True}
            ]
        },
        "fibonacci": {
            "title": "N-th Fibonacci Number",
            "description": "Write a program to compute the `N`-th Fibonacci number. The Fibonacci sequence is defined as `F(0) = 0`, `F(1) = 1`, and `F(i) = F(i-1) + F(i-2)`.\n\n### Input Format\nA single line containing the integer `N`.\n\n### Output Format\nPrint the N-th Fibonacci number.",
            "test_cases": [
                {"input": "5\n", "expected_output": "5\n", "is_hidden": False},
                {"input": "8\n", "expected_output": "21\n", "is_hidden": False},
                {"input": "10\n", "expected_output": "55\n", "is_hidden": True},
                {"input": "0\n", "expected_output": "0\n", "is_hidden": True}
            ]
        },
        "palindrome": {
            "title": "String Palindrome Checker",
            "description": "Write a program that checks if a given string is a palindrome (reads the same forwards and backwards). Print `YES` if it is, otherwise print `NO`.\n\n### Input Format\nA single line containing string `S`.\n\n### Output Format\nPrint `YES` or `NO`.",
            "test_cases": [
                {"input": "racecar\n", "expected_output": "YES\n", "is_hidden": False},
                {"input": "hello\n", "expected_output": "NO\n", "is_hidden": False},
                {"input": "madam\n", "expected_output": "YES\n", "is_hidden": True},
                {"input": "step on no pets\n", "expected_output": "YES\n", "is_hidden": True}
            ]
        },
        "reverse": {
            "title": "Reverse a String Challenge",
            "description": "Write a program that takes a string and prints its reversed representation.\n\n### Input Format\nA single line containing string `S`.\n\n### Output Format\nPrint the reversed string.",
            "test_cases": [
                {"input": "abc\n", "expected_output": "cba\n", "is_hidden": False},
                {"input": "Clahan\n", "expected_output": "nahalC\n", "is_hidden": False},
                {"input": "a\n", "expected_output": "a\n", "is_hidden": True},
                {"input": "12345\n", "expected_output": "54321\n", "is_hidden": True}
            ]
        },
        "even": {
            "title": "Even or Odd Classifier",
            "description": "Write a program that checks if an integer is even or odd. Print `EVEN` if it is even, otherwise print `ODD`.\n\n### Input Format\nA single integer `N`.\n\n### Output Format\nPrint `EVEN` or `ODD`.",
            "test_cases": [
                {"input": "4\n", "expected_output": "EVEN\n", "is_hidden": False},
                {"input": "7\n", "expected_output": "ODD\n", "is_hidden": False},
                {"input": "0\n", "expected_output": "EVEN\n", "is_hidden": True},
                {"input": "-5\n", "expected_output": "ODD\n", "is_hidden": True}
            ]
        }
    }

    matched = None
    for kw, templ in templates.items():
        if kw in topic_clean.lower():
            matched = templ
            break

    if matched:
        return {
            "title": matched["title"],
            "description": matched["description"],
            "starter_code": starter,
            "test_cases": matched["test_cases"]
        }
    else:
        return {
            "title": f"Algorithm Challenge: {topic_clean.title()}",
            "description": (
                f"Write an efficient program to solve problem scenarios for **{topic_clean}**.\n\n"
                f"### Input Format\n"
                f"Read input parameters from standard input (stdin).\n\n"
                f"### Output Format\n"
                f"Print output solution results to standard output (stdout).\n\n"
                f"### Sample Case 1\n"
                f"**Input:**\n"
                f"```\n"
                f"5\n"
                f"```\n"
                f"**Expected Output:**\n"
                f"```\n"
                f"10\n"
                f"```\n\n"
                f"### Sample Case 2\n"
                f"**Input:**\n"
                f"```\n"
                f"3\n"
                f"```\n"
                f"**Expected Output:**\n"
                f"```\n"
                f"6\n"
                f"```"
            ),
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
        
        # Convert PIL Image to OpenCV BGR format (OpenCV and InsightFace expect BGR)
        rgb_image = np.array(image.convert("RGB"))
        open_cv_image = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2BGR)
        
        # Optimize frame size before inference to reduce CPU load
        height, width = open_cv_image.shape[:2]
        if width > 640 or height > 480:
            open_cv_image = cv2.resize(open_cv_image, (640, 480), interpolation=cv2.INTER_AREA)
        
        # Calculate diagnostics
        img_width, img_height = image.size
        frame_size_bytes = len(img_bytes)
        gray_diag = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
        avg_brightness = float(np.mean(gray_diag))
        blur_score = float(cv2.Laplacian(gray_diag, cv2.CV_64F).var())

        # Initialize default response
        face_count = 1
        yolo_persons = 0
        objects_detected = []
        violations = []
        detected_confidences = {}
        
        # 1. Run YOLOv8 Object Detection (using OpenCV DNN ONNX)
        if yolo_net is not None:
            try:
                # Preprocess image preserving aspect ratio to avoid distortion of phones/books
                letterboxed, scale, dx, dy = letterbox_image(open_cv_image, (640, 640))
                
                # YOLOv8 input is 640x640, scale factor is 1/255.0
                # Set swapRB=True since letterboxed is in BGR format
                blob = cv2.dnn.blobFromImage(letterboxed, 1.0/255.0, (640, 640), swapRB=True, crop=False)
                yolo_net.setInput(blob)
                outputs = yolo_net.forward() # shape: (1, 84, 8400)
                
                output = outputs[0] # (84, 8400)
                output = np.transpose(output) # (8400, 84)
                
                # Check confidence for specific classes
                boxes = []
                confidences = []
                class_ids = []
                for row in output:
                    classes_scores = row[4:]
                    class_id = np.argmax(classes_scores)
                    confidence = classes_scores[class_id]
                    
                    # Keep confidence threshold low for detection to ensure we capture objects
                    if confidence > 0.15:
                        class_name = CLASSES[class_id]
                        if class_name in ["person", "cell phone", "book"]:
                            cx, cy, w, h = row[0], row[1], row[2], row[3]
                            left = int(cx - w/2)
                            top = int(cy - h/2)
                            boxes.append([left, top, int(w), int(h)])
                            confidences.append(float(confidence))
                            class_ids.append(int(class_id))
                
                if len(boxes) > 0:
                    indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.15, 0.4)
                    flat_indices = []
                    if len(indices) > 0:
                        for idx in indices:
                            if isinstance(idx, (list, np.ndarray)):
                                flat_indices.append(idx[0])
                            else:
                                flat_indices.append(idx)
                    
                    for i in flat_indices:
                        c_name = CLASSES[class_ids[i]]
                        conf = confidences[i]
                        
                        # Store maximum confidence per class detected in this frame
                        if c_name not in detected_confidences or conf > detected_confidences[c_name]:
                            detected_confidences[c_name] = conf
                        
                        if c_name == "person":
                            yolo_persons += 1
                            objects_detected.append("person")
                        elif c_name in ["cell phone", "book"]:
                            objects_detected.append(c_name)
                            
                objects_detected = list(set(objects_detected))
            except Exception as e:
                logger.error(f"YOLO ONNX detection error: {str(e)}")
                # Auto-healing fallback if CUDA is set but fails at runtime
                if "CUDA" in str(e) or "preferableBackend" in str(e):
                    logger.warning("CUDA DNN forward failed. Switching YOLO backend to CPU...")
                    try:
                        yolo_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                        yolo_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                    except Exception as fallback_err:
                        logger.error(f"Failed to reset YOLO to CPU: {fallback_err}")
        
        # 2. Run InsightFace Face Detection
        insight_faces = []
        face_confidence = 0.0
        if insight_face_app is not None:
            try:
                insight_faces = insight_face_app.get(open_cv_image)
                if len(insight_faces) > 0:
                    face_confidence = float(max(face.det_score for face in insight_faces))
                    logger.info(f"InsightFace detected {len(insight_faces)} face(s) with max confidence {face_confidence:.4f}")
            except Exception as e:
                logger.error(f"InsightFace detection error: {str(e)}")

        # 3. Run Face detection cascades (frontal cascade, with profile fallback) as secondary fallback
        faces_detected = []
        if face_cascade is not None:
            try:
                # Running directly on original resolution (optimized 640x480 max) to prevent distortion
                faces = face_cascade.detectMultiScale(gray_diag, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
                for f in faces:
                    faces_detected.append(f)
            except Exception as e:
                logger.error(f"Frontal Face detection error: {str(e)}")
 
        # If no frontal faces found, fall back to profile face cascade
        if len(faces_detected) == 0 and profile_cascade is not None:
            try:
                profiles = profile_cascade.detectMultiScale(gray_diag, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
                for p in profiles:
                    faces_detected.append(p)
            except Exception as e:
                logger.error(f"Profile Face detection error: {str(e)}")

        # Resolve primary face count and detection source
        detection_source = "None"
        if len(insight_faces) > 0:
            face_count = len(insight_faces)
            detection_source = "InsightFace"
        else:
            face_count = len(faces_detected)
            if face_count > 0:
                face_confidence = 0.85  # Confidence fallback for Haar Cascade detection
                detection_source = "OpenCV Haar Cascade"
        
        # Fallback 1: If both detectors missed the face but YOLOv8 detects a person,
        # set face_count to match yolo_persons since they are physically present.
        if face_count == 0 and yolo_persons > 0:
            logger.info(f"InsightFace and Cascades detected 0 faces, but YOLOv8 detected {yolo_persons} person(s). Overriding face_count to {yolo_persons}.")
            face_count = yolo_persons
            face_confidence = max(0.50, detected_confidences.get("person", 0.50))
            detection_source = "YOLO (OpenCV DNN)"
        
        # Fallback 2: If detectors find multiple faces but YOLOv8 detects only 1 person,
        # override face_count to 1 to filter out background/shadow faces.
        if face_count > 1 and yolo_persons == 1:
            logger.info(f"Face detectors found {face_count} faces, but YOLOv8 detected 1 person. Overriding face_count to 1.")
            face_count = 1

        # Save frames for diagnosis to disk
        if face_count > 0:
            try:
                cv2.imwrite("successful_frame.jpg", open_cv_image)
            except Exception as save_err:
                logger.error(f"Failed to save successful frame: {save_err}")
        else:
            try:
                cv2.imwrite("failing_frame.jpg", open_cv_image)
            except Exception as save_err:
                logger.error(f"Failed to save failing frame: {save_err}")

        # Determine if a face/person is actually present in this frame
        face_present_flag = (face_count > 0)

        # Update persistent face tracking state machine
        tracker = attempt_trackers.get(attemptId)
        if tracker is None:
            tracker = AttemptTracker(attemptId)
            attempt_trackers[attemptId] = tracker
        
        # Calculate pre-update elapsed lost time
        temp_elapsed = 0.0
        if tracker.first_lost_time is not None:
            temp_elapsed = time.time() - tracker.first_lost_time

        logger.info(
            f"[FRAME]\n"
            f"Attempt={attemptId}\n"
            f"face_count={face_count}\n"
            f"face_confidence={face_confidence:.4f}\n"
            f"yolo_persons={yolo_persons}\n"
            f"detection_source={detection_source}\n"
            f"face_present_flag={face_present_flag}\n"
            f"tracker_state={tracker.state}\n"
            f"tracker_first_lost_time={tracker.first_lost_time}\n"
            f"elapsed_lost={temp_elapsed:.1f}\n"
            f"image_width={img_width}\n"
            f"image_height={img_height}\n"
            f"payload_size_bytes={frame_size_bytes}\n"
            f"avg_brightness={avg_brightness:.2f}\n"
            f"blur_score={blur_score:.2f}"
        )

        tracking_status = tracker.update(face_present_flag, face_confidence)
        
        # Calculate time elapsed since first lost frame
        elapsed_lost = 0.0
        if tracker.first_lost_time is not None:
            elapsed_lost = time.time() - tracker.first_lost_time

        # Evaluate violations
        # We only flag NO_FACE_DETECTED violation if the tracking state has transitioned to 'Face Lost'
        # or if the temporary loss has persisted for at least 2 seconds (to match requirements).
        if tracking_status == "Face Lost" or (tracking_status == "Temporary Detection Loss" and elapsed_lost >= 2.0):
            violations.append("NO_FACE_DETECTED")
        elif face_count > 1:
            violations.append("MULTIPLE_FACES_DETECTED")
        
        # Only trigger MOBILE_PHONE_DETECTED if confidence >= 0.80
        if "cell phone" in detected_confidences:
            phone_conf = detected_confidences["cell phone"]
            if phone_conf >= 0.80:
                violations.append("MOBILE_PHONE_DETECTED")
                logger.info(f"Cell phone violation triggered with confidence: {phone_conf:.4f}")
            else:
                logger.info(f"Cell phone detected but ignored (low confidence: {phone_conf:.4f})")
                
        # Only trigger BOOK_DETECTED if confidence > 0.40
        if "book" in detected_confidences:
            book_conf = detected_confidences["book"]
            if book_conf > 0.40:
                violations.append("BOOK_DETECTED")
                logger.info(f"Book violation triggered with confidence: {book_conf:.4f}")
            else:
                logger.info(f"Book detected but ignored (low confidence: {book_conf:.4f})")
        
        return {
            "faceCount": face_count,
            "faceConfidence": face_confidence,
            "trackingStatus": tracking_status,
            "facePresent": (tracking_status in ["Face Present", "Face Recovered"]),
            "faceLost": (tracking_status == "Face Lost"),
            "faceRecovered": (tracking_status == "Face Recovered"),
            "elapsedLost": elapsed_lost,
            "objectsDetected": objects_detected,
            "ocrText": None,
            "violations": violations,
            "verified": (face_count == 1 and len(violations) == 0),
            "confidences": detected_confidences,
            "detectionSource": detection_source
        }
    
    except Exception as e:
        logger.error(f"Error analyzing frame: {str(e)}")
        # Graceful fallback: return safe state to avoid crashing exam flow
        return {
            "faceCount": 1,
            "faceConfidence": 1.0,
            "trackingStatus": "Face Present",
            "facePresent": True,
            "faceLost": False,
            "faceRecovered": False,
            "elapsedLost": 0.0,
            "objectsDetected": [],
            "ocrText": None,
            "violations": [],
            "verified": True,
            "confidences": {}
        }


