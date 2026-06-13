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

# Load OpenCV face detectors
face_cascade = None
profile_cascade = None
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
        
        # Convert PIL Image to OpenCV format (RGB)
        open_cv_image = np.array(image.convert("RGB"))
        
        # Optimize frame size before inference to reduce CPU load
        height, width = open_cv_image.shape[:2]
        if width > 640 or height > 480:
            open_cv_image = cv2.resize(open_cv_image, (640, 480), interpolation=cv2.INTER_AREA)
        
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
                # Set swapRB=False since letterboxed is already RGB
                blob = cv2.dnn.blobFromImage(letterboxed, 1.0/255.0, (640, 640), swapRB=False, crop=False)
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
        
        # 2. Run Face detection (frontal cascade, with profile fallback)
        faces_detected = []
        if face_cascade is not None:
            try:
                gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
                small_gray = cv2.resize(gray, (320, 240))
                faces = face_cascade.detectMultiScale(small_gray, scaleFactor=1.1, minNeighbors=4)
                for f in faces:
                    faces_detected.append(f)
            except Exception as e:
                logger.error(f"Frontal Face detection error: {str(e)}")
 
        # If no frontal faces found, fall back to profile face cascade
        if len(faces_detected) == 0 and profile_cascade is not None:
            try:
                gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
                small_gray = cv2.resize(gray, (320, 240))
                profiles = profile_cascade.detectMultiScale(small_gray, scaleFactor=1.1, minNeighbors=4)
                for p in profiles:
                    faces_detected.append(p)
            except Exception as e:
                logger.error(f"Profile Face detection error: {str(e)}")
                
        face_count = len(faces_detected)
        
        # Fallback 1: If Haar Cascades missed the face(s) but YOLOv8 detects person(s),
        # set face_count to match yolo_persons since they are physically present.
        if face_count == 0 and yolo_persons > 0:
            logger.info(f"Face Cascades detected 0 faces, but YOLOv8 detected {yolo_persons} person(s). Overriding face_count to {yolo_persons}.")
            face_count = yolo_persons
        
        # Fallback 2: If Haar Cascades detect multiple faces but YOLOv8 detects only 1 person,
        # override face_count to 1 to filter out false positive background/shadow faces.
        if face_count > 1 and yolo_persons == 1:
            logger.info(f"Face Cascades detected {face_count} faces, but YOLOv8 detected 1 person. Overriding face_count to 1.")
            face_count = 1
        
        # Evaluate violations
        if face_count == 0:
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
            "objectsDetected": objects_detected,
            "ocrText": None,
            "violations": violations,
            "verified": (face_count == 1 and len(violations) == 0),
            "confidences": detected_confidences
        }
    
    except Exception as e:
        logger.error(f"Error analyzing frame: {str(e)}")
        # Graceful fallback: return safe state to avoid crashing exam flow
        return {
            "faceCount": 1,
            "objectsDetected": [],
            "ocrText": None,
            "violations": [],
            "verified": True,
            "confidences": {}
        }


