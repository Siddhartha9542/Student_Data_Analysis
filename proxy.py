from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
import concurrent.futures
import requests
import urllib3
import time
import os

# --- CONFIGURATION ---
app = Flask(__name__, static_folder='.') # Serve files from current folder
CORS(app)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.sbtet.telangana.gov.in/",
    "Accept": "application/json"
}

EXAM_CONFIG = {
    "23": {"scheme": "9", "sems": {"1": "75", "2": "78", "3": "85", "4": "91"}},
    "22": {"scheme": "9", "sems": {"1": "66", "2": "71", "3": "75", "4": "78", "5": "85", "6": "91"}},
    "24": {"scheme": "11", "sems": {"1": "85", "2": "91"}}
}
TRAINING_SWAPS = {"5": ["85", "91"], "6": ["91", "85"]}

# --- 1. SERVE FRONTEND (THE "ONE LINK" MAGIC) ---
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# --- 2. API FUNCTIONS (SAME AS BEFORE) ---
def fetch_raw(pin, sem_id, exam_id, scheme):
    url = f"https://www.sbtet.telangana.gov.in/api/api/Results/GetStudentWiseReport?ExamMonthYearId={exam_id}&ExamTypeId=5&Pin={pin}&SchemeId={scheme}&SemYearId={sem_id}&StudentTypeId=1"
    try:
        r = requests.get(url, headers=HEADERS, timeout=4, verify=False)
        return r.json() if r.status_code == 200 else None
    except: return None

def fetch_student_smart(pin):
    batch = pin[:2]
    if batch not in EXAM_CONFIG: return None
    config = EXAM_CONFIG[batch]
    
    available_sems = sorted(config["sems"].keys(), key=lambda x: int(x), reverse=True)
    
    for sem_id in available_sems[:2]:
        exam_id = config["sems"][sem_id]
        ids = [exam_id]
        if sem_id in TRAINING_SWAPS: ids = TRAINING_SWAPS[sem_id]
        
        for eid in ids:
            data = fetch_raw(pin, sem_id, eid, config["scheme"])
            if data and isinstance(data, list) and len(data)>0 and data[0].get("studentInfo"):
                raw = data[0]
                info = raw["studentInfo"][0]
                
                sgpa = 0.0
                credits = 0.0
                if raw.get("studentSGPACGPAInfo"):
                    curr = raw["studentSGPACGPAInfo"][0]
                    sgpa = float(curr.get("SGPA", 0) or curr.get("sgpa", 0))
                    credits = float(curr.get("TotalCreditsEarned") or curr.get("CgpaTotalCredits") or 0)

                return {
                    "pin": pin,
                    "name": info["StudentName"],
                    "sgpa": sgpa,
                    "credits": int(credits),
                    "raw_report": raw.get("studentWiseReport", [])
                }
    return None

def fetch_user_history_deep(pin):
    batch = pin[:2]
    if batch not in EXAM_CONFIG: return []
    config = EXAM_CONFIG[batch]
    full_history = []
    
    for sem_id in sorted(config["sems"].keys(), key=lambda x: int(x)):
        exam_id = config["sems"][sem_id]
        ids = [exam_id]
        if sem_id in TRAINING_SWAPS: ids = TRAINING_SWAPS[sem_id]
        
        found = False
        for eid in ids:
            data = fetch_raw(pin, sem_id, eid, config["scheme"])
            if data and isinstance(data, list) and len(data)>0:
                raw = data[0]
                sem_sgpa = 0.0
                if raw.get("studentSGPACGPAInfo"):
                    sem_sgpa = float(raw["studentSGPACGPAInfo"][0].get("SGPA", 0))
                full_history.append({"sem": sem_id, "sgpa": sem_sgpa, "report": raw.get("studentWiseReport", [])})
                found = True
                break
        if not found: full_history.append({"sem": sem_id, "sgpa": 0, "report": []})

    return full_history

@app.route('/api/analyze', methods=['POST'])
def analyze_class():
    try:
        req = request.json
        user_pin = req.get('pin', '').strip().upper()
        print(f"Analyzing: {user_pin}")

        user_history = fetch_user_history_deep(user_pin)
        
        pin_parts = user_pin.split('-')
        if len(pin_parts) < 2: return jsonify({"status": "error", "message": "Invalid PIN format"})
        
        prefix = f"{pin_parts[0]}-{pin_parts[1]}-"
        class_pins = [f"{prefix}{str(i).zfill(3)}" for i in range(1, 71)]
        
        class_results = []
        for i in range(0, len(class_pins), 8): # Batch of 8
            batch = class_pins[i:i+8]
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(fetch_student_smart, batch))
            for res in results:
                if res: class_results.append(res)
            time.sleep(0.1)

        user_smart = next((s for s in class_results if s['pin'] == user_pin), None)
        if not user_smart:
            user_smart = fetch_student_smart(user_pin)
            if user_smart: class_results.append(user_smart)

        class_results.sort(key=lambda x: x['sgpa'], reverse=True)

        return jsonify({
            "status": "success",
            "data": {
                "me_smart": user_smart,
                "me_history_detailed": user_history,
                "leaderboard": class_results
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Run on 0.0.0.0 so Cloudflare can see it
    app.run(host='0.0.0.0', port=5000)

