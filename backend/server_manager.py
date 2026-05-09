from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import paramiko
import os
import time
import socket
import threading
import xml.sax.saxutils as saxutils
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="TAK_C2_BRIDGE_V18_STABLE")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MissionPayload(BaseModel):
    host: str
    port: int = 22
    user: str
    password: str
    command: Optional[str] = None

# --- GLOBAL STATE ---
UNITS_VAULT = {}
UNITS_LOCK = threading.Lock()
COMMS_VAULT = []
LISTENER_STARTED = False
SHARED_SOCKET = None
SOCKET_LOCK = threading.Lock()
TARGET_HOST = ""

def clean_text(text):
    if not text: return ""
    rep = {"Del BrÃo": "Del Brío", "BrÃo": "Brío", "Del Br\xado": "Del Brío"}
    for k, v in rep.items(): text = text.replace(k, v)
    return text

def parse_num(v):
    try:
        if not v or str(v).lower() == "undefined": return 0.0
        clean = "".join(c for c in str(v) if c.isdigit() or c in ".,-")
        return float(clean.replace(',', '.'))
    except: return 0.0

# --- CoT LOGIC ---
def cot_worker(host, callsign):
    global SHARED_SOCKET, UNITS_VAULT, COMMS_VAULT, TARGET_HOST
    TARGET_HOST = host
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(20)
            s.connect((host, 8087))
            with SOCKET_LOCK: SHARED_SOCKET = s
            while True:
                raw_data = s.recv(10240)
                if not raw_data: break
                try: data = raw_data.decode('utf-8')
                except: data = raw_data.decode('latin-1', errors='replace')
                if '<event' in data:
                    try:
                        if 'callsign="' in data:
                            cs = clean_text(data.split('callsign="')[1].split('"')[0])
                            uid = data.split(' uid="')[1].split('"')[0]
                            lat = data.split('lat="')[1].split('"')[0]
                            lon = data.split('lon="')[1].split('"')[0]
                            with UNITS_LOCK:
                                UNITS_VAULT[cs] = {"callsign": cs, "uid": uid, "lat": float(lat), "lng": float(lon), "status": "ONLINE", "last_seen": time.time()}
                        if '<remarks>' in data and 'senderCallsign="' in data:
                            msg_text = clean_text(data.split('<remarks>')[1].split('</remarks>')[0])
                            sender = clean_text(data.split('senderCallsign="')[1].split('"')[0])
                            COMMS_VAULT.append({"sender": sender, "text": msg_text, "time": time.strftime("%H:%M:%S"), "recipient": "ALL"})
                            if len(COMMS_VAULT) > 50: COMMS_VAULT.pop(0)
                    except: pass
        except:
            with SOCKET_LOCK: SHARED_SOCKET = None
            time.sleep(5)

def send_cot_persistent(xml_content):
    global SHARED_SOCKET, TARGET_HOST
    try:
        with SOCKET_LOCK:
            if not SHARED_SOCKET:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5)
                s.connect((TARGET_HOST, 8087))
                SHARED_SOCKET = s
            SHARED_SOCKET.sendall(xml_content.encode('utf-8'))
            return True
    except:
        with SOCKET_LOCK: SHARED_SOCKET = None
        return False

def presence_beacon(host, callsign, lat, lng):
    while True:
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 300))
        xml = f'<?xml version="1.0" encoding="UTF-8"?><event version="2.0" uid="C2-BRIDGE-{callsign}" type="a-f-G-U-C-I" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o"><point lat="{lat}" lon="{lng}" hae="0.0" ce="999" le="999"/><detail><contact callsign="{callsign}"/><remarks>BRIDGE_C2_ACTIVE</remarks></detail></event>'
        send_cot_persistent(xml)
        time.sleep(30)

# --- ENDPOINTS ---
@app.get("/api/v1/units")
async def get_units(host: str = "127.0.0.1", callsign: str = "HQ", lat: str = "40.4168", lng: str = "-3.7038"):
    global LISTENER_STARTED
    # Conversión segura a float
    try:
        f_lat = float(lat) if lat != "undefined" else 40.4168
        f_lng = float(lng) if lng != "undefined" else -3.7038
    except:
        f_lat, f_lng = 40.4168, -3.7038
        
    if not LISTENER_STARTED and host != "127.0.0.1":
        threading.Thread(target=cot_worker, args=(host, callsign), name="COT_WORKER", daemon=True).start()
        threading.Thread(target=presence_beacon, args=(host, callsign, f_lat, f_lng), name="BEACON", daemon=True).start()
        LISTENER_STARTED = True
    
    now = time.time()
    with UNITS_LOCK:
        active = [u for u in list(UNITS_VAULT.values()) if now - u['last_seen'] < 120]
    return active

@app.get("/api/v1/comms")
async def get_comms(): return COMMS_VAULT

@app.post("/api/v1/comms")
async def send_comm(msg: dict):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 600))
    sender = msg.get('sender', 'OP')
    text = saxutils.escape(msg.get('text', ''))
    recipient = msg.get('recipient_uid') or msg.get('recipient', 'ALL')
    lat = msg.get('lat', '0.0')
    lng = msg.get('lng', '0.0')
    my_uid = f"C2-BRIDGE-{sender}"
    msg_id = f"GeoChat.{sender}.ALL.{int(time.time())}"
    
    # XML Profesional con Vínculo de Identidad
    xml = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           f'<event version="2.0" uid="{msg_id}" type="b-t-f" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o">'
           f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="9.9" le="9.9"/>'
           f'<detail>'
           f'<__chat parent="ALL" group="NONE" senderCallsign="{sender}" messageId="{msg_id}">'
           f'<content>{text}</content>'
           f'</__chat>'
           f'<link uid="{my_uid}" type="a-f-G-U-C-I" relation="p-p"/>'
           f'<remarks>{text}</remarks>'
           f'<marti><dest callsign="ALL"/></marti>'
           f'</detail>'
           f'</event>')
    if send_cot_persistent(xml):
        COMMS_VAULT.append(msg)
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/v1/terminal")
async def run_terminal(p: MissionPayload):
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=10)
        _, out, err = ssh.exec_command(p.command)
        response = out.read().decode() + err.read().decode()
        ssh.close()
        return {"status": "success", "output": response or "Command executed (no output)"}
    except Exception as e:
        return {"status": "error", "output": str(e)}

@app.post("/api/v1/telemetry")
async def get_telemetry(p: MissionPayload):
    res = {"cpu": 0, "ram": {"perc": 0}, "disk": "N/A", "temp": "0", "fts": False}
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=5)
        _, out, _ = ssh.exec_command("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'; free -m | grep Mem: | awk '{print $3*100/$2}'; df -h / | tail -1 | awk '{print $5}'; ss -tuln | grep :8087 | wc -l")
        lines = [l.strip() for l in out.read().decode().split('\n') if l.strip()]
        ssh.close()
        res.update({"cpu": parse_num(lines[0]), "ram": {"perc": parse_num(lines[1])}, "disk": lines[2], "fts": parse_num(lines[3]) > 0})
        return {"status": "success", **res}
    except: return {"status": "partial", **res}
