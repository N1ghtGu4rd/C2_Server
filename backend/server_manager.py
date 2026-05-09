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
import uuid
import logging
import struct
from pydantic import BaseModel
from typing import List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TAK-C2")

app = FastAPI(title="TAK_C2_BRIDGE_V4.6_DROID_SYNC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
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
SHARED_SOCKET = None
SOCKET_LOCK = threading.Lock()
TARGET_HOST = ""
MISSION_ACTIVE = threading.Event()
MY_REAL_UID = "ANDROID-C2-BRIDGE"

def universal_clean(text):
    if not text: return ""
    try:
        res = html.unescape(html.unescape(text))
        rep = {"Ão": "ío", "Ã­": "í", "Ã¡": "á", "Ã©": "é", "Ã³": "ó", "Ãº": "ú", "Ã±": "ñ"}
        for k, v in rep.items(): res = res.replace(k, v)
        return res.strip()
    except: return text

def safe_float(v, default=0.0):
    try:
        if v is None or str(v).lower() == "undefined" or str(v).strip() == "": return default
        return float(str(v).replace(',', '.'))
    except: return default

def get_tak_timestamp(offset=0):
    t = time.time() + offset
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + f".{int((t % 1) * 1000):03d}Z"

def send_raw_cot(xml_content):
    global SHARED_SOCKET
    try:
        with SOCKET_LOCK:
            if SHARED_SOCKET:
                packet = xml_content.strip() + "\n\0"
                SHARED_SOCKET.sendall(packet.encode('utf-8'))
    except:
        with SOCKET_LOCK: SHARED_SOCKET = None

def send_chat_packet(sender, text, lat, lng, target_uid="BROADCAST"):
    ts = get_tak_timestamp()
    stale = get_tak_timestamp(3600)
    msg_guid = str(uuid.uuid4())
    conv_id = "All Chat" if target_uid == "BROADCAST" else target_uid
    
    # 1. Mensaje Moderno (b-t-f)
    msg_id_1 = f"GeoChat.{MY_REAL_UID}.{conv_id.replace(' ', '_')}.{msg_guid}"
    xml_1 = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             f'<event version="2.0" uid="{msg_id_1}" type="b-t-f" time="{ts}" start="{ts}" stale="{stale}" how="h-g-i-g-o">'
             f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="9.9" le="9.9"/>'
             f'<detail>'
             f'<__chat parent="Root" group="NONE" senderCallsign="{sender}" messageId="{msg_guid}" conversationId="{conv_id}">'
             f'<content>{saxutils.escape(text)}</content></__chat>'
             f'<link uid="{MY_REAL_UID}" type="a-f-G-U-C" relation="p-p"/>'
             f'<contact endpoint="*:-1:stcp" callsign="{sender}"/>'
             f'<remarks>{saxutils.escape(text)}</remarks></detail></event>')
    send_raw_cot(xml_1)
    
    # 2. Mensaje Legado (t-x-c-t)
    xml_2 = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             f'<event version="2.0" uid="{msg_guid}" type="t-x-c-t" time="{ts}" start="{ts}" stale="{stale}" how="h-e">'
             f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="9.9" le="9.9"/>'
             f'<detail><remarks>{saxutils.escape(text)}</remarks></detail></event>')
    send_raw_cot(xml_2)

def cot_listener(host, port):
    global SHARED_SOCKET, TARGET_HOST
    buffer = ""
    while MISSION_ACTIVE.is_set():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5.0)
            s.connect((host, port))
            if port == 8087:
                with SOCKET_LOCK: SHARED_SOCKET = s
            while MISSION_ACTIVE.is_set():
                try:
                    raw = s.recv(10240)
                    if not raw: break
                    chunk = raw.decode('utf-8', errors='replace')
                    buffer += chunk
                    while "</event>" in buffer:
                        event_end = buffer.find("</event>") + 8
                        data = buffer[:event_end]
                        buffer = buffer[event_end:]
                        try:
                            if 'callsign="' in data:
                                cs = universal_clean(data.split('callsign="')[1].split('"')[0])
                                uid = data.split(' uid="')[1].split('"')[0]
                                lat = data.split('lat="')[1].split('"')[0]
                                lon = data.split('lon="')[1].split('"')[0]
                                with UNITS_LOCK:
                                    UNITS_VAULT[cs] = {"callsign": cs, "uid": uid, "lat": safe_float(lat), "lng": safe_float(lon), "last_seen": time.time()}
                            
                            # Captura selectiva de mensajes de chat
                            if '<__chat' in data or '<remarks>' in data:
                                msg_text = ""
                                if '<remarks>' in data: msg_text = universal_clean(data.split('<remarks>')[1].split('</remarks>')[0])
                                elif '<content>' in data: msg_text = universal_clean(data.split('<content>')[1].split('</content>')[0])
                                sender = "UNKNOWN"
                                if 'senderCallsign="' in data: sender = universal_clean(data.split('senderCallsign="')[1].split('"')[0])
                                elif 'callsign="' in data: sender = universal_clean(data.split('callsign="')[1].split('"')[0])
                                
                                if msg_text and sender != "UNKNOWN" and MY_REAL_UID not in data:
                                    logger.info(f"[CHAT_IN] {sender}: {msg_text}")
                                    COMMS_VAULT.append({"sender": sender, "text": msg_text, "time": time.strftime("%H:%M:%S")})
                        except: pass
                except socket.timeout: continue
                except: break
        except:
            if port == 8087:
                with SOCKET_LOCK: SHARED_SOCKET = None
            time.sleep(5)

def presence_beacon(host, callsign, lat, lng):
    while MISSION_ACTIVE.is_set():
        ts = get_tak_timestamp()
        stale = get_tak_timestamp(300)
        pretty_cs = universal_clean(callsign)
        # Identidad Droid completa
        xml = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               f'<event version="2.0" uid="{MY_REAL_UID}" type="a-f-G-U-C" time="{ts}" start="{ts}" stale="{stale}" how="m-g">'
               f'<point lat="{lat}" lon="{lng}" hae="0.0" ce="999" le="999"/>'
               f'<detail>'
               f'<contact endpoint="*:-1:stcp" callsign="{pretty_cs}"/>'
               f'<uid nett="XX" Droid="{pretty_cs}"/>'
               f'<__group role="Team Member" name="Green"/>'
               f'<status battery="100"/>'
               f'<takv os="android" version="5.6.0.CIV" platform="ATAK-CIV"/>'
               f'<__chat chatgrp_id="All Chat"/>'
               f'<remarks>C2_ACTIVE</remarks>'
               f'</detail></event>')
        send_raw_cot(xml)
        time.sleep(30)

@app.get("/api/v1/control/{action}")
async def mission_control(action: str, host: str = None, callsign: str = "HQ", lat: str = "40", lng: str = "0"):
    global MISSION_ACTIVE, TARGET_HOST
    if action == "start":
        TARGET_HOST = host
        if not MISSION_ACTIVE.is_set():
            MISSION_ACTIVE.set()
            threading.Thread(target=cot_listener, args=(host, 8087), daemon=True).start()
            threading.Thread(target=cot_listener, args=(host, 8088), daemon=True).start()
            threading.Thread(target=cot_listener, args=(host, 8089), daemon=True).start()
            threading.Thread(target=presence_beacon, args=(host, callsign, safe_float(lat, 40.41), safe_float(lng, -3.70)), daemon=True).start()
        return {"status": "MISSION_DEPLOYED"}
    else:
        MISSION_ACTIVE.clear()
        with SOCKET_LOCK:
            global SHARED_SOCKET
            if SHARED_SOCKET: SHARED_SOCKET.close(); SHARED_SOCKET = None
        return {"status": "MISSION_STANDBY"}

@app.get("/api/v1/units")
async def get_units():
    now = time.time()
    with UNITS_LOCK:
        active = [u for u in list(UNITS_VAULT.values()) if now - u['last_seen'] < 120]
    return active

@app.get("/api/v1/comms")
async def get_comms(): return COMMS_VAULT

@app.post("/api/v1/comms")
async def send_comm(msg: dict):
    sender = universal_clean(msg.get('sender', 'OP'))
    text = msg.get('text', '')
    target = msg.get('target', 'BROADCAST')
    lat = safe_float(msg.get('lat'), 40.41)
    lng = safe_float(msg.get('lng'), -3.70)
    send_chat_packet(sender, text, lat, lng, target)
    COMMS_VAULT.append(msg)
    return {"status": "success"}

@app.post("/api/v1/terminal")
async def run_terminal(p: MissionPayload):
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=10)
        _, out, err = ssh.exec_command(p.command)
        return {"status": "success", "output": out.read().decode() + err.read().decode()}
    except Exception as e: return {"status": "error", "output": str(e)}

@app.post("/api/v1/telemetry")
async def get_telemetry(p: MissionPayload):
    res = {"cpu": 0, "ram": {"perc": 0}, "disk": "N/A", "fts": False}
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=5)
        _, out, _ = ssh.exec_command("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'; free -m | grep Mem: | awk '{print $3*100/$2}'; df -h / | tail -1 | awk '{print $5}'; ss -tuln | grep :8087 | wc -l")
        lines = [l.strip() for l in out.read().decode().split('\n') if l.strip()]
        ssh.close()
        res.update({"cpu": safe_float(lines[0]), "ram": {"perc": safe_float(lines[1])}, "disk": lines[2], "fts": safe_float(lines[3]) > 0})
        return {"status": "success", **res}
    except: return {"status": "partial", **res}
