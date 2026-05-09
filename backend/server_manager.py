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

app = FastAPI(title="TAK_C2_BRIDGE_V14_PERSISTENT")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=200, content={"status": "error", "detail": str(exc)})

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

def parse_num(v):
    try:
        clean = "".join(c for c in v if c.isdigit() or c in ".,")
        return float(clean.replace(',', '.'))
    except: return 0.0

# --- CoT LOGIC ---
def cot_worker(host, callsign):
    global SHARED_SOCKET, UNITS_VAULT, COMMS_VAULT
    while True:
        try:
            with SOCKET_LOCK:
                SHARED_SOCKET = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                SHARED_SOCKET.settimeout(20)
                SHARED_SOCKET.connect((host, 8087))
            
            while True:
                raw_data = SHARED_SOCKET.recv(10240)
                if not raw_data: break
                try:
                    data = raw_data.decode('utf-8')
                except:
                    data = raw_data.decode('latin-1', errors='replace')
                
                if '<event' in data:
                    try:
                        if 'callsign="' in data and ' uid="' in data:
                            uid_val = data.split(' uid="')[1].split('"')[0]
                            cs = data.split('callsign="')[1].split('"')[0]
                            lat = data.split('lat="')[1].split('"')[0]
                            lon = data.split('lon="')[1].split('"')[0]
                            with UNITS_LOCK:
                                UNITS_VAULT[cs] = {"callsign": cs, "uid": uid_val, "lat": float(lat), "lng": float(lon), "status": "ONLINE", "last_seen": time.time()}
                        
                        if '<remarks>' in data and 'senderCallsign="' in data:
                            msg_text = data.split('<remarks>')[1].split('</remarks>')[0]
                            sender = data.split('senderCallsign="')[1].split('"')[0]
                            COMMS_VAULT.append({"sender": sender, "text": msg_text, "time": time.strftime("%H:%M:%S"), "recipient": "ALL"})
                            if len(COMMS_VAULT) > 50: COMMS_VAULT.pop(0)
                    except: pass
        except:
            with SOCKET_LOCK: SHARED_SOCKET = None
            time.sleep(5)

def send_cot_persistent(xml_content):
    global SHARED_SOCKET
    with SOCKET_LOCK:
        if SHARED_SOCKET:
            try:
                SHARED_SOCKET.sendall(xml_content.encode('utf-8'))
                return True
            except: return False
    return False

def presence_beacon(host, callsign, lat, lng):
    while True:
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 300))
        uid = f"C2-BRIDGE-{callsign}".replace(" ", "_")
        xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><event version="2.0" uid="{uid}" type="a-f-G-U-C-I" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o"><point lat="{lat}" lon="{lng}" hae="0.0" ce="999" le="999"/><detail><contact callsign="{callsign}"/><remarks>BRIDGE_C2_ACTIVE</remarks></detail></event>'
        send_cot_persistent(xml)
        time.sleep(30)

# --- ENDPOINTS ---
@app.get("/api/v1/units")
async def get_units(host: str = "127.0.0.1", callsign: str = "HQ", lat: float = 40.4168, lng: float = -3.7038):
    global LISTENER_STARTED
    if not LISTENER_STARTED and host != "127.0.0.1":
        threading.Thread(target=cot_worker, args=(host, callsign), name="COT_WORKER", daemon=True).start()
        threading.Thread(target=presence_beacon, args=(host, callsign, lat, lng), name="BEACON", daemon=True).start()
        LISTENER_STARTED = True
    now = time.time()
    with UNITS_LOCK:
        active = [u for u in list(UNITS_VAULT.values()) if now - u['last_seen'] < 120]
    return active if active else [{"callsign": "SCANNING_FTS...", "lat": 0, "lng": 0, "status": "SCANNING"}]

@app.get("/api/v1/comms")
async def get_comms(): return COMMS_VAULT

@app.post("/api/v1/comms")
async def send_comm(msg: dict):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sender = msg.get('sender', 'OP')
    text = saxutils.escape(msg.get('text', ''))
    recipient = msg.get('recipient_uid') or msg.get('recipient', 'ALL')
    uid = f"GeoChat.{sender}.{recipient}.{int(time.time())}"
    xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><event version="2.0" uid="{uid}" type="b-t-f" time="{ts}" start="{ts}" stale="{ts}" how="h-g-i-g-o"><point lat="0.0" lon="0.0" hae="0.0" ce="999" le="999"/><detail><__chat parent="{recipient}" group="NONE" senderCallsign="{sender}" messageId="{uid}"><content>{text}</content></__chat><remarks>{text}</remarks><marti><dest callsign="{recipient}"/></marti></detail></event>'
    if send_cot_persistent(xml):
        COMMS_VAULT.append(msg)
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/v1/telemetry")
async def get_telemetry(p: MissionPayload):
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=5)
        cmd = "top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'; free -m | grep Mem: | awk '{printf \"%d|%d|%.1f\", $3, $2, $3*100/$2}'; df -h / | tail -1 | awk '{print $5}'; if [ -f /usr/bin/vcgencmd ]; then vcgencmd measure_temp | cut -d'=' -f2 | cut -d\"'\" -f1; else echo 'N/A'; fi; ss -tuln | grep :8087 | wc -l"
        stdin, stdout, stderr = ssh.exec_command(cmd)
        lines = [l.strip() for l in stdout.read().decode().split('\n') if l.strip()]
        ssh.close()
        ram = lines[1].split('|') if '|' in lines[1] else ["0","0","0"]
        return {"status": "success", "cpu": parse_num(lines[0]), "ram": {"perc": parse_num(ram[2])}, "disk": lines[2], "temp": lines[3], "fts": int(lines[4])>0}
    except Exception as e: return {"status": "error", "detail": str(e)}
