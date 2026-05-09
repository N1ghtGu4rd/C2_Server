from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import paramiko
import os
import time
import socket
import threading
import xml.sax.saxutils as saxutils
import re
import unicodedata
import html
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="TAK_C2_BRIDGE_V23_ULTIMATE_CLEAN")

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
RAW_DEBUG_DATA = "" # Para ver qué llega de TAKy

def universal_clean(text):
    """Limpia CUALQUIER rastro de codificación HTML o caracteres raros"""
    if not text: return ""
    try:
        # Decodificar recursivamente (hasta 3 niveles)
        res = text
        for _ in range(3):
            res = html.unescape(res)
        
        # Eliminar cualquier residuo de entidades HTML mal formadas
        res = re.sub(r'&#?\w+;', '', res)
        res = re.sub(r'&amp;', '&', res)
        
        # Arreglar fallos comunes de UTF-8/Latin-1
        rep = {
            "Ão": "ío", "Ã­": "í", "Ã¡": "á", "Ã©": "é", "Ã³": "ó", "Ãº": "ú", "Ã±": "ñ",
            "\xad": "í", "Del BrÃo": "Del Brío", "BrÃo": "Brío"
        }
        for k, v in rep.items(): res = res.replace(k, v)
        return res.strip()
    except: return text

def clean_uid(text):
    clean = universal_clean(text)
    clean = clean.replace(" ", "_")
    clean = "".join(c for c in unicodedata.normalize('NFD', clean) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-zA-Z0-9_]', '', clean)

def cot_worker(host, callsign):
    global SHARED_SOCKET, UNITS_VAULT, COMMS_VAULT, TARGET_HOST, RAW_DEBUG_DATA
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
                RAW_DEBUG_DATA = raw_data.decode('latin-1', errors='ignore')[:500]
                try: data = raw_data.decode('utf-8')
                except: data = raw_data.decode('latin-1', errors='replace')
                
                if '<event' in data:
                    try:
                        if 'callsign="' in data:
                            cs_raw = data.split('callsign="')[1].split('"')[0]
                            cs = universal_clean(cs_raw)
                            uid = data.split(' uid="')[1].split('"')[0]
                            lat = data.split('lat="')[1].split('"')[0]
                            lon = data.split('lon="')[1].split('"')[0]
                            with UNITS_LOCK:
                                UNITS_VAULT[cs] = {"callsign": cs, "uid": uid, "lat": float(lat), "lng": float(lon), "status": "ONLINE", "last_seen": time.time()}
                        
                        if '<remarks>' in data and 'senderCallsign="' in data:
                            msg_text = universal_clean(data.split('<remarks>')[1].split('</remarks>')[0])
                            sender = universal_clean(data.split('senderCallsign="')[1].split('"')[0])
                            COMMS_VAULT.append({"sender": sender, "text": msg_text, "time": time.strftime("%H:%M:%S")})
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
            SHARED_SOCKET.sendall((xml_content.strip() + "\n").encode('utf-8'))
            return True
    except:
        with SOCKET_LOCK: SHARED_SOCKET = None
        return False

def presence_beacon(host, callsign, lat, lng):
    while True:
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 300))
        pretty_cs = universal_clean(callsign)
        uid = f"C2_{clean_uid(pretty_cs)}"
        xml = (f'<event version="2.0" uid="{uid}" type="a-f-G-U-C-I" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o">'
               f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="999" le="999"/>'
               f'<detail><contact callsign="{pretty_cs}"/><__group role="Team" name="Cyan"/><remarks>C2_ACTIVE</remarks></detail></event>')
        send_cot_persistent(xml)
        time.sleep(30)

@app.get("/api/v1/units")
async def get_units(host: str = "127.0.0.1", callsign: str = "HQ", lat: str = "40.4168", lng: str = "-3.7038"):
    global LISTENER_STARTED
    if not LISTENER_STARTED and host != "127.0.0.1":
        threading.Thread(target=cot_worker, args=(host, callsign), name="COT_WORKER", daemon=True).start()
        threading.Thread(target=presence_beacon, args=(host, callsign, lat, lng), name="BEACON", daemon=True).start()
        LISTENER_STARTED = True
    now = time.time()
    with UNITS_LOCK:
        active = [u for u in list(UNITS_VAULT.values()) if now - u['last_seen'] < 60]
    return active

@app.get("/api/v1/comms")
async def get_comms(): return COMMS_VAULT

@app.post("/api/v1/comms")
async def send_comm(msg: dict):
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 600))
    sender = universal_clean(msg.get('sender', 'OP'))
    text = saxutils.escape(msg.get('text', ''))
    lat = msg.get('lat', '0.0')
    lng = msg.get('lng', '0.0')
    my_uid = f"C2_{clean_uid(sender)}"
    msg_id = f"GeoChat.{my_uid}.All_Chat.{int(time.time())}"
    
    xml = (f'<event version="2.0" uid="{msg_id}" type="b-t-f" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o">'
           f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="9.9" le="9.9"/>'
           f'<detail><__chat parent="ALL" group="NONE" senderCallsign="{sender}" messageId="{msg_id}" conversationId="All Chat">'
           f'<content>{text}</content></__chat><remarks>{text}</remarks><contact callsign="{sender}"/></detail></event>')
    
    if send_cot_persistent(xml):
        COMMS_VAULT.append(msg)
        return {"status": "success"}
    return {"status": "error"}

@app.get("/api/v1/debug")
async def get_debug(): return {"raw": RAW_DEBUG_DATA}

@app.post("/api/v1/terminal")
async def run_terminal(p: MissionPayload):
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=10)
        _, out, err = ssh.exec_command(p.command)
        response = out.read().decode() + err.read().decode()
        ssh.close()
        return {"status": "success", "output": response or "Command executed"}
    except Exception as e: return {"status": "error", "output": str(e)}

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
