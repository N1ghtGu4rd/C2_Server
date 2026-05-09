import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, Database, HardDrive, Thermometer, Target, Signal,
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon,
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle, Info,
  Trash2, RotateCw, Layout, ChevronRight, Users, Radio, Navigation, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const decodeHTMLEntities = (text) => {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  let decoded = textArea.value;
  textArea.innerHTML = decoded;
  return textArea.value;
};

const App = () => {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('tak_bootstrap_v13_cfg');
    return saved ? JSON.parse(saved) : null;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(!config);
  const [isDeployed, setIsDeployed] = useState(false);
  const [currentPos, setCurrentPos] = useState({ lat: 40.4168, lng: -3.7038 });
  
  const [tempCfg, setTempCfg] = useState(config || {
    ipA: '', ipB: '', user: 'server-tak', pass: 'C3rv3rus', proxy: window.location.hostname, callsign: 'HQ-OPERATOR', sshPort: '22', lat: '40.4168', lng: '-3.7038'
  });

  const [band, setBand] = useState('A');
  const [mobileView, setMobileView] = useState('MAP');
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: '0%', status: 'STANDBY' });
  
  const [termLines, setTermLines] = useState(['-- TACTICAL_C2_v2.8_FULL_RESTORATION --']);
  const [termInput, setTermInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [zuluTime, setZuluTime] = useState('--:--:--Z');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
  const [chatTarget, setChatTarget] = useState({ callsign: 'ALL_UNITS', uid: 'BROADCAST' });

  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentPos(newPos);
          if (isDeployed && config) {
             const baseUrl = `http://${config.proxy}:8001`;
             fetch(`${baseUrl}/api/v1/control/start?host=${band==='A'?config.ipA:config.ipB}&callsign=${config.callsign}&lat=${newPos.lat}&lng=${newPos.lng}`);
          }
        },
        (err) => console.error("GPS_ERROR", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isDeployed, config, band]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener('resize', handleResize);
    const t = setInterval(() => setZuluTime(new Date().toISOString().substring(11, 19) + 'Z'), 1000);
    return () => { clearInterval(t); window.removeEventListener('resize', handleResize); };
  }, []);

  const toggleMission = async () => {
    if (!config) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const baseUrl = `http://${config.proxy}:8001`;
    const action = isDeployed ? 'stop' : 'start';
    const lat = currentPos.lat || config.lat || '40.4168';
    const lng = currentPos.lng || config.lng || '-3.7038';
    try {
      await fetch(`${baseUrl}/api/v1/control/${action}?host=${target}&callsign=${config.callsign}&lat=${lat}&lng=${lng}`);
      setIsDeployed(!isDeployed);
      setStats(prev => ({ ...prev, status: isDeployed ? 'STANDBY' : 'DEPLOYED' }));
    } catch (e) { setIsDeployed(!isDeployed); }
  };

  const pollTelemetry = async () => {
    if (!config || !isDeployed) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const baseUrl = `http://${config.proxy}:8001`;
    try {
      const r = await fetch(`${baseUrl}/api/v1/telemetry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass })
      });
      const d = await r.json();
      if (d.cpu !== undefined) setStats({ cpu: d.cpu, ram: d.ram.perc, disk: d.disk, status: 'OPERATIONAL' });
    } catch (e) {}
  };

  useEffect(() => {
    if (isDeployed) {
       pollTelemetry();
       const itv = setInterval(pollTelemetry, 10000);
       return () => clearInterval(itv);
    }
  }, [config, band, isDeployed]);

  useEffect(() => {
    if (!config || !isDeployed) return;
    const pollComms = async () => {
      const baseUrl = `http://${config.proxy}:8001`;
      try {
        const r1 = await fetch(`${baseUrl}/api/v1/comms`);
        const d1 = await r1.json();
        setMessages(d1.map(m => ({...m, sender: decodeHTMLEntities(m.sender), text: decodeHTMLEntities(m.text)})));
        const r2 = await fetch(`${baseUrl}/api/v1/units`);
        const d2 = await r2.json();
        setUnits(d2.map(u => ({...u, callsign: decodeHTMLEntities(u.callsign)})));
      } catch (e) {}
    };
    pollComms();
    const itv = setInterval(pollComms, 3000);
    return () => clearInterval(itv);
  }, [config, band, isDeployed]);

  const sendComm = async () => {
    if (!userInput.trim() || !config || !isDeployed) return;
    const baseUrl = `http://${config.proxy}:8001`;
    const msg = { sender: config.callsign, text: userInput, target: chatTarget.uid, targetCallsign: chatTarget.callsign, lat: currentPos.lat, lng: currentPos.lng };
    setUserInput('');
    try { await fetch(`${baseUrl}/api/v1/comms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch (e) {}
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
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass, command: cmd })
      });
      const d = await r.json(); setTermLines(prev => [...prev, d.output]);
    } catch (e) { setTermLines(prev => [...prev, 'ERROR: REQ_FAILED']); }
  };

  return (
    <div className="tac-container font-mono">
      <div className="tac-header">
        <div className="d-flex align-items-center gap-2">
          <div className={`p-1 rounded-circle ${isDeployed?'bg-success shadow-glow':'bg-danger'}`} style={{width:8, height:8}}></div>
          <span className="text-orange fw-bold">TAK_C2_v2.8</span>
          <span className="text-white-50 ms-2 small d-none d-md-inline">{zuluTime}</span>
        </div>
        
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2 bg-dark p-1 px-2 rounded-pill border border-secondary" onClick={toggleMission} style={{cursor:'pointer'}}>
             <span className="small text-white-50" style={{fontSize:'0.6rem'}}>{isDeployed?'DEPLOYED':'STANDBY'}</span>
             <div className={`rounded-circle ${isDeployed?'bg-success':'bg-secondary'}`} style={{width:12, height:12, transition:'all 0.3s'}}></div>
          </div>
          <button className="btn-ops orange p-1" onClick={()=>setIsConfigOpen(true)}><Settings size={18}/></button>
        </div>
      </div>

      <div className="flex-grow-1 overflow-hidden">
        {isMobile ? (
          <div className="h-100 d-flex flex-column">
             <div className="flex-grow-1 position-relative overflow-hidden">
                {!isDeployed && mobileView === 'MAP' && (
                  <div className="h-100 w-100 d-flex flex-column align-items-center justify-content-center bg-black p-4 text-center">
                     <Radio size={48} className="text-white-50 mb-3 opacity-25"/>
                     <div className="text-white-50 mb-3 small">COMMUNICATION_LINK_OFFLINE</div>
                     <button className="btn-ops green p-3 px-5 fw-bold" onClick={toggleMission}>DEPLOY_MISSION</button>
                  </div>
                )}
                {isDeployed && mobileView === 'MAP' && (
                  <div className="h-100 w-100 position-relative">
                    <GoogleMapHUD config={config} units={units} currentPos={currentPos} />
                    <div className="position-absolute top-0 start-0 m-2 p-2 bg-black bg-opacity-75 border border-dark rounded" style={{zIndex:10}}>
                       <div className="small text-orange mb-1 fw-bold">GPS_FIX: {currentPos.lat.toFixed(4)}, {currentPos.lng.toFixed(4)}</div>
                       <div className="d-flex gap-1">
                          <button className={`btn-ops p-1 px-3 ${band==='A'?'green':'bg-dark'}`} onClick={()=>setBand('A')}>A</button>
                          <button className={`btn-ops p-1 px-3 ${band==='B'?'orange':'bg-dark'}`} onClick={()=>setBand('B')}>B</button>
                       </div>
                    </div>
                  </div>
                )}
                {mobileView === 'CHAT' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="d-flex align-items-center gap-2 mb-2 p-2 bg-dark border border-secondary rounded">
                        <Users size={14} className="text-orange"/>
                        <select className="bg-transparent border-0 text-orange small fw-bold flex-grow-1" value={chatTarget.uid} onChange={(e) => {
                            const u = units.find(u => u.uid === e.target.value);
                            setChatTarget(u ? { callsign: u.callsign, uid: u.uid } : { callsign: 'ALL_UNITS', uid: 'BROADCAST' });
                          }}>
                          <option value="BROADCAST">ALL_UNITS (BROADCAST)</option>
                          {units.map((u, i) => <option key={i} value={u.uid}>{u.callsign}</option>)}
                        </select>
                     </div>
                     <div className="flex-grow-1 overflow-auto mb-2 p-2">
                        {messages.map((m, i) => (
                          <div key={i} className={`mb-2 ${m.sender === config?.callsign ? 'text-end' : ''}`}>
                            <div className={`d-inline-block p-2 rounded-1 ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark border border-secondary text-white'}`} style={{fontSize: '0.85rem'}}>{m.text}</div>
                            <div className="text-white-50" style={{fontSize: '0.5rem'}}>{m.time} // {m.sender} {m.targetCallsign && m.targetCallsign !== 'ALL_UNITS' ? `-> ${m.targetCallsign}` : ''}</div>
                          </div>
                        ))}
                     </div>
                     <div className="d-flex gap-2">
                        <input type="text" className="hud-input flex-grow-1" placeholder={`MESSAGE TO ${chatTarget.callsign}...`} value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} disabled={!isDeployed} />
                        <button className="btn-ops orange p-2 px-3" onClick={sendComm} disabled={!isDeployed}><Send size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'TERM' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 border border-dark rounded p-2 overflow-auto font-mono" style={{fontSize:'0.7rem', backgroundColor:'#000', color:'#00ff41'}}>
                        {termLines.map((l, i) => <pre key={i} className="mb-0">{l}</pre>)}
                     </div>
                     <div className="d-flex gap-2 mt-2">
                        <input type="text" className="hud-input flex-grow-1" placeholder="SSH_CMD..." value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                        <button className="btn-ops green p-2 px-3" onClick={()=>executeTerm()}><TermIcon size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'SYSTEM' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <div className="row g-2 mb-3">
                        {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'SSD',v:stats.disk},{l:'MISSION',v:isDeployed?'DEPLOYED':'STANDBY'}].map((s,i)=>(
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
                     <h6 className="text-orange border-bottom border-dark pb-2 mb-3">ORBAT_LIST</h6>
                     {units.map((u, i) => (
                        <div key={i} className="tac-card p-3 d-flex justify-content-between align-items-center mb-2" onClick={() => { setChatTarget({callsign: u.callsign, uid: u.uid}); setMobileView('CHAT'); }}>
                           <div className="d-flex align-items-center gap-3"><User size={16} className="text-orange"/><div className="fw-bold">{u.callsign}</div></div>
                           <ChevronRight size={16} className="text-white-50"/>
                        </div>
                     ))}
                  </div>
                )}
             </div>
             <div className="mobile-nav" style={{height:'60px'}}>
                {[
                  {id:'MAP', i:<MapIcon size={20}/>}, {id:'CHAT', i:<MessageSquare size={20}/>},
                  {id:'TERM', i:<TermIcon size={20}/>}, {id:'USERS', i:<Users size={20}/>}, {id:'SYSTEM', i:<Layout size={20}/>}
                ].map(t => (
                  <div key={t.id} className={`text-center flex-grow-1 ${mobileView===t.id?'text-orange':''}`} onClick={()=>setMobileView(t.id)}>
                    {t.i}<div style={{fontSize:'0.45rem'}}>{t.id}</div>
                  </div>
                ))}
             </div>
          </div>
        ) : (
          /* DESKTOP UI COMPLETO */
          <div className="h-100 d-flex flex-column gap-2 p-2 bg-black">
             {isDeployed && (
                <div className="h-100 d-flex gap-2">
                   {/* Columna Izquierda: Estadisticas y Terminal */}
                   <div className="d-flex flex-column gap-2" style={{width:'350px'}}>
                      <div className="stats-grid">
                        {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'DISK',v:stats.disk},{l:'BAND',v:band}].map((s,i)=>(
                          <div className="tac-card p-2 d-flex align-items-center gap-3" key={i}>
                             <div className="p-2 bg-black border border-dark rounded text-orange"><Cpu size={14}/></div>
                             <div><div className="text-white-50 small" style={{fontSize:'0.5rem'}}>{s.l}</div><div className="fw-bold text-orange">{s.v}</div></div>
                          </div>
                        ))}
                      </div>
                      <div className="tac-card flex-grow-1 d-flex flex-column overflow-hidden">
                         <div className="p-2 border-bottom border-dark bg-dark small fw-bold text-orange d-flex justify-content-between">
                            <span>TERMINAL_ACCESS</span>
                            <TermIcon size={14}/>
                         </div>
                         <div className="flex-grow-1 p-2 overflow-auto text-success" style={{fontSize:'0.7rem', backgroundColor:'#000'}}>
                            {termLines.map((l, i) => <pre key={i} className="mb-0">{l}</pre>)}
                         </div>
                         <div className="p-2 border-top border-dark d-flex gap-2">
                            <input type="text" className="hud-input flex-grow-1" value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                            <button className="btn-ops green p-1 px-3" onClick={()=>executeTerm()}><ChevronRight size={16}/></button>
                         </div>
                      </div>
                      <div className="d-flex gap-2">
                         <button className="btn-ops orange flex-grow-1 p-2" onClick={()=>executeTerm('sudo reboot')}><RefreshCw size={14}/> REBOOT</button>
                         <button className="btn-ops red flex-grow-1 p-2" onClick={()=>executeTerm('sudo shutdown now')}><Power size={14}/> SHUTDOWN</button>
                      </div>
                   </div>

                   {/* Centro: Mapa HUD */}
                   <div className="tac-card shadow position-relative flex-grow-1">
                      <GoogleMapHUD config={config} units={units} currentPos={currentPos} />
                      <div className="position-absolute top-0 start-0 m-3 p-2 bg-black bg-opacity-75 border border-dark rounded" style={{zIndex:10}}>
                         <div className="small fw-bold text-orange mb-1">GPS_FIX: {currentPos.lat.toFixed(4)}, {currentPos.lng.toFixed(4)}</div>
                         <div className="d-flex gap-1">
                            <button className={`btn-ops p-1 px-3 ${band==='A'?'green':'bg-dark'}`} onClick={()=>setBand('A')}>BAND_A</button>
                            <button className={`btn-ops p-1 px-3 ${band==='B'?'orange':'bg-dark'}`} onClick={()=>setBand('B')}>BAND_B</button>
                         </div>
                      </div>
                   </div>

                   {/* Derecha: Chat y Unidades */}
                   <div className="d-flex flex-column gap-2" style={{width:'350px'}}>
                      <div className="tac-card d-flex flex-column" style={{height:'60%'}}>
                         <div className="p-2 border-bottom border-dark bg-dark d-flex justify-content-between align-items-center">
                            <span className="small fw-bold text-orange">CHAT_P2P</span>
                            <select className="bg-black border border-secondary text-orange x-small p-1" value={chatTarget.uid} onChange={(e) => {
                               const u = units.find(u => u.uid === e.target.value);
                               setChatTarget(u ? { callsign: u.callsign, uid: u.uid } : { callsign: 'ALL_UNITS', uid: 'BROADCAST' });
                             }}>
                               <option value="BROADCAST">BROADCAST</option>
                               {units.map((u, i) => <option key={i} value={u.uid}>{u.callsign}</option>)}
                            </select>
                         </div>
                         <div className="flex-grow-1 overflow-auto p-2 font-mono" style={{fontSize:'0.7rem'}}>
                           {messages.map((m, i) => (<div key={i} className="mb-1"><span className="text-orange">{m.sender}{m.targetCallsign && m.targetCallsign !== 'ALL_UNITS' ? ` > ${m.targetCallsign}` : ''}:</span> {m.text}</div>))}
                         </div>
                         <div className="p-2 border-top border-dark d-flex gap-2">
                           <input type="text" className="hud-input flex-grow-1" placeholder={`TO: ${chatTarget.callsign}`} value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                           <button className="btn-ops orange p-1 px-3" onClick={sendComm}><Send size={16}/></button>
                         </div>
                      </div>
                      <div className="tac-card flex-grow-1 overflow-auto">
                         <div className="p-2 border-bottom border-dark bg-dark small fw-bold text-orange">ORBAT_DETECTED</div>
                         <div className="p-2">
                            {units.map((u, i) => (
                               <div key={i} className="d-flex justify-content-between align-items-center mb-2 p-2 bg-dark rounded border border-secondary" style={{cursor:'pointer'}} onClick={()=>setChatTarget({callsign:u.callsign, uid:u.uid})}>
                                  <div className="small fw-bold text-white">{u.callsign}</div>
                                  <div className="text-orange" style={{fontSize:'0.6rem'}}>{u.lat.toFixed(3)}, {u.lng.toFixed(3)}</div>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>
             )}
             {!isDeployed && (
                <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center">
                   <Shield size={64} className="text-orange mb-3 opacity-25"/>
                   <h2 className="text-orange fw-bold">TACTICAL_C2_OFFLINE</h2>
                   <button className="btn-ops orange p-3 px-5 mt-4 fw-bold" onClick={toggleMission}>START_MISSION_DEPLOYMENT</button>
                </div>
             )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isConfigOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-black bg-opacity-95" style={{zIndex:1000}}>
             <div className="tac-card p-4 rounded shadow-lg m-2" style={{maxWidth:'500px', width:'100%'}}>
                 <h6 className="text-orange border-bottom border-dark pb-2 mb-4">TACTICAL_INIT</h6>
                 <div className="row g-2">
                    <div className="col-12"><div className="alert alert-warning py-1 mb-2" style={{fontSize:'0.55rem'}}>REMOTE_ACCESS: Use PC IP instead of 'localhost'. Current: {window.location.hostname}</div></div>
                    <div className="col-6"><label className="small text-white-50">PRIMARY_IP (A)</label><input type="text" className="hud-input w-100" value={tempCfg.ipA} placeholder="192.168..." onChange={e=>setTempCfg({...tempCfg, ipA: e.target.value})} /></div>
                    <div className="col-6"><label className="small text-white-50">FAILOVER_IP (B)</label><input type="text" className="hud-input w-100" value={tempCfg.ipB} placeholder="10.0.0..." onChange={e=>setTempCfg({...tempCfg, ipB: e.target.value})} /></div>
                    <div className="col-12"><label className="small text-white-50">C2_PROXY_IP (THIS_PC)</label><input type="text" className="hud-input w-100" value={tempCfg.proxy} placeholder="IP of this computer" onChange={e=>setTempCfg({...tempCfg, proxy: e.target.value})} /></div>
                    <div className="col-6"><label className="small text-white-50">SSH_USER</label><input type="text" className="hud-input w-100" value={tempCfg.user} placeholder="user" onChange={e=>setTempCfg({...tempCfg, user: e.target.value})} /></div>
                    <div className="col-6"><label className="small text-white-50">SSH_PASS</label><input type="password" className="hud-input w-100" value={tempCfg.pass} placeholder="pass" onChange={e=>setTempCfg({...tempCfg, pass: e.target.value})} /></div>
                    <div className="col-12"><label className="small text-white-50">CALLSIGN</label><input type="text" className="hud-input w-100" value={tempCfg.callsign} placeholder="DEL_BRIO" onChange={e=>setTempCfg({...tempCfg, callsign: e.target.value})} /></div>
                 </div>
                 <button className="btn-ops orange w-100 mt-4 py-3 fw-bold" onClick={() => {
                    localStorage.setItem('tak_bootstrap_v13_cfg', JSON.stringify(tempCfg));
                    setConfig(tempCfg); setIsConfigOpen(false); window.location.reload();
                 }}>CONFIRM_DEPLOIMENT</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const GoogleMapHUD = ({ config, units, currentPos }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const markersRef = useRef({});
  const myMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    const m = new window.google.maps.Map(mapRef.current, {
      center: { lat: currentPos.lat, lng: currentPos.lng },
      zoom: 17, mapTypeId: 'satellite', disableDefaultUI: true,
      styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }]
    });
    setMap(m);
    myMarkerRef.current = new window.google.maps.Marker({
      position: { lat: currentPos.lat, lng: currentPos.lng },
      map: m,
      icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, fillColor: '#00ff41', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' }
    });
  }, []);

  useEffect(() => {
    if (myMarkerRef.current) {
      myMarkerRef.current.setPosition(currentPos);
      if (map) map.panTo(currentPos);
    }
  }, [currentPos, map]);

  useEffect(() => {
    if (!map || !units) return;
    const currentUnits = {};
    units.forEach(u => {
      currentUnits[u.callsign] = true;
      if (markersRef.current[u.callsign]) {
        markersRef.current[u.callsign].setPosition({ lat: u.lat, lng: u.lng });
      } else {
        markersRef.current[u.callsign] = new window.google.maps.Marker({
          position: { lat: u.lat, lng: u.lng }, map: map,
          label: { text: u.callsign, color: 'white', fontSize: '10px' },
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#ff9d00', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' }
        });
      }
    });
    Object.keys(markersRef.current).forEach(cs => {
      if (!currentUnits[cs]) { markersRef.current[cs].setMap(null); delete markersRef.current[cs]; }
    });
  }, [map, units]);

  return <div ref={mapRef} className="h-100 w-100" />;
};

export default App;
