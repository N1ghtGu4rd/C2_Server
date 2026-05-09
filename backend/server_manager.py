from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import paramiko
import os
import time
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="TAK_C2_BRIDGE_BOOTSTRAP")

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

COMMS_VAULT = []
ASYNC_STATUS = {"last_action": "NONE", "is_running": False}

def parse_num(v):
    try:
        clean = "".join(c for c in v if c.isdigit() or c in ".,")
        return float(clean.replace(',', '.'))
    except:
        return 0.0

def run_async_task(host, port, user, password, command, action_name):
    global ASYNC_STATUS
    ASYNC_STATUS["is_running"] = True
    ssh = paramiko.SSHClient()
    try:
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(host, port=port, username=user, password=password, timeout=10)
        ssh.exec_command(command)
        time.sleep(2)
        ssh.close()
    except: pass
    finally: ASYNC_STATUS["is_running"] = False

@app.post("/api/v1/telemetry")
async def get_telemetry(p: MissionPayload):
    ssh = paramiko.SSHClient()
    try:
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=5)
        
        cmd = """
        top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'
        free -m | grep Mem: | awk '{printf "%d|%d|%.1f", $3, $2, $3*100/$2}'
        df -h / | tail -1 | awk '{print $5}'
        if [ -f /usr/bin/vcgencmd ]; then vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1; else sensors | grep 'Core 0' | awk '{print $3}' | tr -d '+°C' || echo 'N/A'; fi
        ss -tuln | grep :8087 | wc -l
        """
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = [l.strip() for l in stdout.read().decode().split('\n') if l.strip()]
        ssh.close()

        if len(out) < 3: raise Exception("MALFORMED_OUTPUT")

        ram_data = out[1].split('|') if '|' in out[1] else ["0", "0", "0"]
        
        return {
            "status": "success",
            "cpu": parse_num(out[0]),
            "ram": {"used": ram_data[0], "total": ram_data[1], "perc": parse_num(ram_data[2]) if len(ram_data)>2 else 0},
            "disk": out[2],
            "temp": out[3] if len(out) > 3 else "N/A",
            "fts": int(out[4]) > 0 if len(out) > 4 else False,
            "busy": ASYNC_STATUS["is_running"]
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.post("/api/v1/terminal")
async def execute_terminal(p: MissionPayload):
    if not p.command: return {"status": "error", "detail": "Empty command"}
    ssh = paramiko.SSHClient()
    try:
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(p.host, port=p.port, username=p.user, password=p.password, timeout=8)
        stdin, stdout, stderr = ssh.exec_command(p.command)
        res = stdout.read().decode() + stderr.read().decode()
        ssh.close()
        return {"status": "success", "output": res if res else "Command executed."}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.post("/api/v1/action")
async def trigger_action(p: MissionPayload, action: str, bg: BackgroundTasks):
    actions = {"update": "sudo apt update && sudo apt full-upgrade -y", "reboot": "sudo reboot", "shutdown": "sudo shutdown -h now"}
    if action not in actions: return {"status": "error", "detail": "Invalid action"}
    bg.add_task(run_async_task, p.host, p.port, p.user, p.password, actions[action], action)
    return {"status": "success", "detail": f"Action {action} dispatched."}

@app.get("/api/v1/comms")
async def get_comms(): return COMMS_VAULT[-40:]

@app.post("/api/v1/comms")
async def send_comm(msg: dict):
    COMMS_VAULT.append(msg)
    return {"status": "success"}
