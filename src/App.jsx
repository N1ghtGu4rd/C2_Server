import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, Database, HardDrive, Thermometer, Target, Signal,
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon,
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle, Info,
  Trash2, RotateCw, Layout, ChevronRight, Users, Radio, Navigation, User, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.getPlatform() !== 'web';

// Importación dinámica de plugins
let UDP;
if (isNative) {
    import('capacitor-udp').then(m => { UDP = m.UDP; }).catch(e => console.log("UDP Plugin not ready"));
}

const MADRID_DEFAULT = { lat: 40.4168, lng: -3.7038 };

const decodeHTMLEntities = (text) => {
  if (!text) return "";
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
};

const App = () => {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('tak_bootstrap_v13_cfg');
    return saved ? JSON.parse(saved) : null;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(!config);
  const [isDeployed, setIsDeployed] = useState(false);
  const [currentPos, setCurrentPos] = useState(MADRID_DEFAULT);
  const [band, setBand] = useState('A');
  const [mobileView, setMobileView] = useState('MAP');
  const [units, setUnits] = useState([]);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: '0%', status: 'STANDBY' });
  const [termLines, setTermLines] = useState(['-- TACTICAL_C2_v7.2_PRO_STABLE --']);
  const [termInput, setTermInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [chatTarget, setChatTarget] = useState({ callsign: 'BROADCAST', uid: 'BROADCAST' });
  const [zuluTime, setZuluTime] = useState('--:--:--Z');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);

  // Inyectar Leaflet si no existe
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Geolocalización
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCurrentPos(MADRID_DEFAULT),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Zulu Time
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener('resize', handleResize);
    const t = setInterval(() => setZuluTime(new Date().toISOString().substring(11, 19) + 'Z'), 1000);
    return () => { clearInterval(t); window.removeEventListener('resize', handleResize); };
  }, []);

  // --- ESCUCHA NATIVA (WiFi Local) ---
  useEffect(() => {
    if (isNative && isDeployed && UDP) {
        UDP.create().then(() => {
            UDP.bind({ port: 17012 });
            UDP.addListener('receive', (data) => {
                try {
                    const xml = atob(data.buffer);
                    processIncomingXML(xml, "[MESH]");
                } catch(e) {}
            });
        });
    }
  }, [isDeployed, isNative]);

  const processIncomingXML = (xml, source) => {
    if (xml.includes('callsign="')) {
        const cs = xml.split('callsign="')[1].split('"')[0];
        const uid = xml.split(' uid="')[1].split('"')[0];
        const lat = parseFloat(xml.split('lat="')[1].split('"')[0]);
        const lng = parseFloat(xml.split('lon="')[1].split('"')[0]);
        if (!isNaN(lat) && !isNaN(lng)) {
            setUnits(prev => {
                const exists = prev.find(u => u.uid === uid);
                if (exists) return prev.map(u => u.uid === uid ? {...u, lat, lng} : u);
                return [...prev, {callsign: cs, uid, lat, lng, last_seen: Date.now()}];
            });
        }
    }
    if (xml.includes('<remarks>') || xml.includes('<__chat')) {
        let text = "";
        if (xml.includes('<remarks>')) text = xml.split('<remarks>')[1].split('</remarks>')[0];
        const sender = xml.includes('senderCallsign="') ? xml.split('senderCallsign="')[1].split('"')[0] : "UNKNOWN";
        if (text && !xml.includes(config?.callsign)) {
            setMessages(prev => [...prev, {sender, text: `${source} ${text}`, time: new Date().toLocaleTimeString()}]);
        }
    }
  };

  // --- POLLING CENTRAL (Híbrido) ---
  const pollAll = async () => {
    if (!config || !isDeployed) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const baseUrl = `http://${config.proxy}:8001`;
    try {
        // Telemetría
        const rStats = await fetch(`${baseUrl}/api/v1/telemetry`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: target, port: parseInt(config.sshPort || 22), user: config.user, password: config.pass })
        });
        const dStats = await rStats.json();
        if (dStats.cpu !== undefined) setStats({ cpu: dStats.cpu, ram: dStats.ram.perc, disk: dStats.disk, status: 'OPERATIONAL' });

        // Comms y Units (Si no estamos en nativo puro, o como backup)
        const rComms = await fetch(`${baseUrl}/api/v1/comms`);
        const dComms = await rComms.json();
        setMessages(prev => {
            const newMsgs = dComms.filter(nm => !prev.some(pm => pm.text === nm.text && pm.time === nm.time));
            return [...prev, ...newMsgs];
        });

        const rUnits = await fetch(`${baseUrl}/api/v1/units`);
        const dUnits = await rUnits.json();
        setUnits(prev => {
            const merged = [...prev];
            dUnits.forEach(du => {
                const idx = merged.findIndex(mu => mu.uid === du.uid);
                if (idx === -1) merged.push(du);
                else merged[idx] = {...merged[idx], ...du};
            });
            return merged;
        });
    } catch (e) {}
  };

  useEffect(() => {
    if (isDeployed) {
        pollAll();
        const itv = setInterval(pollAll, 4000);
        return () => clearInterval(itv);
    }
  }, [isDeployed, config, band]);

  const toggleMission = async () => {
    if (!config) return;
    const baseUrl = `http://${config.proxy}:8001`;
    const action = isDeployed ? 'stop' : 'start';
    const target = band === 'A' ? config.ipA : config.ipB;
    try {
      await fetch(`${baseUrl}/api/v1/control/${action}?host=${target}&callsign=${config.callsign}&lat=${currentPos.lat}&lng=${currentPos.lng}`);
      setIsDeployed(!isDeployed);
    } catch (e) { setIsDeployed(!isDeployed); }
  };

  const sendComm = async () => {
    if (!userInput.trim() || !config || !isDeployed) return;
    const baseUrl = `http://${config.proxy}:8001`;
    const msg = { sender: config.callsign, text: userInput, target: chatTarget.uid, targetCallsign: chatTarget.callsign, lat: currentPos.lat, lng: currentPos.lng };
    setUserInput('');
    try { 
        await fetch(`${baseUrl}/api/v1/comms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
        if (isNative && UDP) {
            const ts = new Date().toISOString();
            const xml = `<?xml version="1.0"?><event version="2.0" uid="C2-${config.callsign}" type="b-t-f" time="${ts}" start="${ts}" stale="${ts}" how="h-e"><point lat="${currentPos.lat}" lon="${currentPos.lng}" hae="0" ce="9" le="9"/><detail><__chat senderCallsign="${config.callsign}"><content>${msg.text}</content></__chat><remarks>${msg.text}</remarks></detail></event>`;
            await UDP.send({ address: '224.10.10.1', port: 17012, buffer: btoa(xml) });
        }
    } catch (e) {}
  };

  const executeTerm = async (specificCmd = null) => {
    if (!config) return;
    const cmd = specificCmd || termInput;
    if (!cmd.trim()) return;
    if (!specificCmd) setTermInput('');
    const target = band === 'A' ? config.ipA : config.ipB;
    const baseUrl = `http://${config.proxy}:8001`;
    setTermLines(prev => [...prev, `> ${cmd}`]);
    try {
      const r = await fetch(`${baseUrl}/api/v1/terminal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort || 22), user: config.user, password: config.pass, command: cmd })
      });
      const d = await r.json(); 
      setTermLines(prev => [...prev, d.output || 'DONE']);
    } catch (e) { setTermLines(prev => [...prev, 'ERROR: REQ_FAILED']); }
  };

  const filteredMessages = messages.filter(m => {
    if (chatTarget.uid === 'BROADCAST') return !m.target || m.target === 'BROADCAST';
    return (m.sender === chatTarget.callsign) || (m.sender === config?.callsign && m.target === chatTarget.uid);
  });

  return (
    <div className="tac-container font-mono">
      <div className="tac-header">
        <div className="d-flex align-items-center gap-2">
          <img src="/assets/logo.png" alt="L" style={{width:24, height:24, borderRadius:4}} onError={(e)=>e.target.style.display='none'} />
          <span className="text-orange fw-bold ms-1">TAK_C2_PRO</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2 bg-dark p-1 px-2 rounded-pill border border-secondary" onClick={toggleMission} style={{cursor:'pointer'}}>
             <span className="small text-white-50" style={{fontSize:'0.6rem'}}>{isDeployed?'DEPLOYED':'STANDBY'}</span>
             <div className={`rounded-circle ${isDeployed?'bg-success':'bg-secondary'}`} style={{width:12, height:12}}></div>
          </div>
          <button className="btn-ops orange p-1" onClick={()=>setIsConfigOpen(true)}><Settings size={18}/></button>
        </div>
      </div>

      <div className="flex-grow-1 overflow-hidden">
        {isMobile ? (
          <div className="h-100 d-flex flex-column">
             <div className="flex-grow-1 position-relative overflow-hidden">
                {mobileView === 'MAP' && <LeafletHUD units={units} currentPos={currentPos} />}
                {mobileView === 'CHAT' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="d-flex align-items-center gap-2 mb-2 p-2 bg-dark border border-secondary rounded">
                        <div className="flex-grow-1 text-orange fw-bold small">{chatTarget.callsign}</div>
                        <Users size={18} className="text-orange" onClick={()=>setChatTarget({callsign:'BROADCAST', uid:'BROADCAST'})}/>
                     </div>
                     <div className="flex-grow-1 overflow-auto mb-2 p-2 d-flex flex-column gap-2">
                        {filteredMessages.map((m, i) => (
                          <div key={i} className={`d-flex flex-column ${m.sender === config?.callsign ? 'align-items-end' : 'align-items-start'}`}>
                            <div className={`p-2 px-3 rounded ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark border border-secondary text-white'}`} style={{fontSize: '0.8rem'}}>{m.text}</div>
                            <div className="text-white-50 mt-1" style={{fontSize: '0.5rem'}}>{m.time} // {m.sender}</div>
                          </div>
                        ))}
                     </div>
                     <div className="d-flex gap-2">
                        <input type="text" className="hud-input flex-grow-1" value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                        <button className="btn-ops orange p-2 px-3" onClick={sendComm}><Send size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'TERM' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 border border-dark rounded p-2 overflow-auto font-mono text-success" style={{fontSize:'0.7rem', backgroundColor:'#000'}}>
                        {termLines.map((l, i) => <pre key={i} className="mb-0">{l}</pre>)}
                     </div>
                     <div className="d-flex gap-2 mt-2">
                        <input type="text" className="hud-input flex-grow-1" value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                        <button className="btn-ops green p-2 px-3" onClick={()=>executeTerm()}><TermIcon size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'SYSTEM' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <div className="row g-2 mb-3">
                        {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'SSD',v:stats.disk},{l:'STATUS',v:stats.status}].map((s,i)=>(
                          <div className="col-6" key={i}><div className="tac-card p-3 text-center"><div className="text-white-50 small">{s.l}</div><div className="fw-bold">{s.v}</div></div></div>
                        ))}
                     </div>
                     <div className="d-grid gap-2">
                        <button className="btn-ops orange p-3 fw-bold" onClick={()=>executeTerm('sudo reboot')}><RefreshCw size={18}/> REBOOT_SERVER</button>
                        <button className="btn-ops red p-3 fw-bold" onClick={()=>executeTerm('sudo shutdown now')}><Power size={18}/> SHUTDOWN_SERVER</button>
                     </div>
                  </div>
                )}
                {mobileView === 'USERS' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <h6 className="text-orange border-bottom border-dark pb-2 mb-3">ORBAT_DETECTED</h6>
                     {units.map((u, i) => (
                        <div key={i} className="tac-card p-3 d-flex justify-content-between align-items-center mb-2" onClick={() => { setChatTarget({callsign: u.callsign, uid: u.uid}); setMobileView('CHAT'); }}>
                           <div className="fw-bold">{u.callsign}</div>
                           <ChevronRight size={16} className="text-white-50"/>
                        </div>
                     ))}
                  </div>
                )}
             </div>
             <div className="mobile-nav">
                {[{id:'MAP', i:<MapIcon/>}, {id:'CHAT', i:<MessageSquare/>}, {id:'USERS', i:<Users/>}, {id:'TERM', i:<TermIcon/>}, {id:'SYSTEM', i:<Layout/>}].map(t => (
                  <div key={t.id} className={`text-center flex-grow-1 ${mobileView===t.id?'text-orange':''}`} onClick={()=>setMobileView(t.id)}>{t.i}</div>
                ))}
             </div>
          </div>
        ) : (
          <div className="h-100 d-flex gap-2 p-2 bg-black">
             <div className="d-flex flex-column gap-2" style={{width:'300px'}}>
                <div className="stats-grid">
                  {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'DISK',v:stats.disk}].map((s,i)=>(
                    <div className="tac-card p-2 d-flex align-items-center gap-3" key={i}>
                       <div className="p-2 bg-black border border-dark rounded text-orange"><Cpu size={14}/></div>
                       <div><div className="text-white-50 small" style={{fontSize:'0.5rem'}}>{s.l}</div><div className="fw-bold text-orange">{s.v}</div></div>
                    </div>
                  ))}
                </div>
                <div className="tac-card flex-grow-1 d-flex flex-column overflow-hidden">
                   <div className="p-2 border-bottom border-dark bg-dark small fw-bold text-orange">TERMINAL</div>
                   <div className="flex-grow-1 p-2 overflow-auto text-success" style={{fontSize:'0.7rem', backgroundColor:'#000'}}>{termLines.map((l, i) => <pre key={i} className="mb-0">{l}</pre>)}</div>
                   <div className="p-2 border-top border-dark d-flex gap-2">
                      <input type="text" className="hud-input flex-grow-1" value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                      <button className="btn-ops green p-1 px-3" onClick={()=>executeTerm()}><ChevronRight size={16}/></button>
                   </div>
                </div>
             </div>
             <div className="flex-grow-1 tac-card position-relative overflow-hidden">
                <LeafletHUD units={units} currentPos={currentPos} />
             </div>
             <div className="d-flex flex-column gap-2" style={{width:'350px'}}>
                <div className="tac-card d-flex flex-column" style={{height:'60%'}}>
                   <div className="p-2 border-bottom border-dark bg-dark d-flex justify-content-between">
                      <span className="small fw-bold text-orange">{chatTarget.callsign}</span>
                      <button className="btn-ops bg-transparent p-0 text-orange" onClick={()=>setChatTarget({callsign:'BROADCAST', uid:'BROADCAST'})}><RefreshCw size={14}/></button>
                   </div>
                   <div className="flex-grow-1 overflow-auto p-2 d-flex flex-column gap-2">
                      {filteredMessages.map((m, i) => (
                        <div key={i} className={`d-flex flex-column ${m.sender === config?.callsign ? 'align-items-end' : 'align-items-start'}`}>
                          <div className={`p-2 px-3 rounded ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark border border-secondary text-white'}`} style={{fontSize:'0.7rem'}}>{m.text}</div>
                        </div>
                      ))}
                   </div>
                   <div className="p-2 border-top border-dark d-flex gap-2">
                      <input type="text" className="hud-input flex-grow-1" value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                      <button className="btn-ops orange p-1 px-3" onClick={sendComm}><Send size={16}/></button>
                   </div>
                </div>
                <div className="tac-card flex-grow-1 overflow-auto">
                   <div className="p-2 border-bottom border-dark bg-dark small fw-bold text-orange">ORBAT</div>
                   <div className="p-2">{units.map((u, i) => (<div key={i} className="mb-2 p-2 bg-dark rounded border border-secondary" onClick={()=>setChatTarget({callsign:u.callsign, uid:u.uid})}>{u.callsign}</div>))}</div>
                </div>
             </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isConfigOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-black bg-opacity-95" style={{zIndex:2000}}>
             <div className="tac-card p-4 rounded shadow-lg m-2 text-center" style={{maxWidth:'500px', width:'100%'}}>
                 <img src="/assets/logo.png" alt="L" style={{width:80, height:80, marginBottom:20, borderRadius:16}} onError={(e)=>e.target.style.display='none'} />
                 <h6 className="text-orange border-bottom border-dark pb-2 mb-4">TACTICAL_INIT_v7.2</h6>
                 <div className="row g-2 text-start">
                    <div className="col-12"><label className="small text-white-50">TAK_SERVER_IP</label><input type="text" className="hud-input w-100" value={tempCfg.ipA} onChange={e=>setTempCfg({...tempCfg, ipA: e.target.value})} /></div>
                    <div className="col-12"><label className="small text-white-50">C2_PROXY_IP</label><input type="text" className="hud-input w-100" value={tempCfg.proxy} onChange={e=>setTempCfg({...tempCfg, proxy: e.target.value})} /></div>
                    <div className="col-12"><label className="small text-white-50">CALLSIGN</label><input type="text" className="hud-input w-100" value={tempCfg.callsign} onChange={e=>setTempCfg({...tempCfg, callsign: e.target.value})} /></div>
                 </div>
                 <button className="btn-ops orange w-100 mt-4 py-3 fw-bold" onClick={() => { localStorage.setItem('tak_bootstrap_v13_cfg', JSON.stringify(tempCfg)); setConfig(tempCfg); setIsConfigOpen(false); }}>SAVE_&_RESTART</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LeafletHUD = ({ units, currentPos }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    if (!mapRef.current || !window.L || mapInstance.current) return;
    const lMap = window.L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([currentPos.lat, currentPos.lng], 15);
    window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(lMap);
    mapInstance.current = lMap;
    // Forzar redimensionado para evitar que el mapa se vea gris
    setTimeout(() => lMap.invalidateSize(), 500);
  }, []); // Solo al montar

  useEffect(() => {
    if (!mapInstance.current || !window.L) return;
    const L = window.L;
    if (!markersRef.current['ME']) {
      markersRef.current['ME'] = L.circleMarker([currentPos.lat, currentPos.lng], { radius: 8, fillColor: "#00ff41", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(mapInstance.current).bindTooltip("ME", { permanent: true, direction: 'top', className: 'milspec-tooltip' });
    } else { markersRef.current['ME'].setLatLng([currentPos.lat, currentPos.lng]); }

    units.forEach(u => {
      if (markersRef.current[u.uid]) { markersRef.current[u.uid].setLatLng([u.lat, u.lng]); } 
      else { markersRef.current[u.uid] = L.circleMarker([u.lat, u.lng], { radius: 6, fillColor: "#ff9d00", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(mapInstance.current).bindTooltip(u.callsign, { permanent: true, direction: 'top', className: 'milspec-tooltip' }); }
    });
  }, [units, currentPos]);

  return <div ref={mapRef} className="h-100 w-100 bg-dark" style={{zIndex:1}} />;
};

export default App;
