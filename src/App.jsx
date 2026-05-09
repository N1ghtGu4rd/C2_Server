import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Cpu, Database, HardDrive, Thermometer, Target, Signal, 
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon, 
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  // --- CONFIG PERSISTENCE ---
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('tak_bootstrap_v13_cfg');
    return saved ? JSON.parse(saved) : null;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(!config);
  const [tempCfg, setTempCfg] = useState(config || {
    ipA: '', ipB: '', user: 'server-tak', pass: 'C3rv3rus', proxy: 'localhost', callsign: 'HQ-OPERATOR', sshPort: '22'
  });

  // --- OPS STATE ---
  const [band, setBand] = useState('A');
  const [activeTab, setActiveTab] = useState('TERMINAL');
  const [recipient, setRecipient] = useState('ALL');
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, ram_u: 0, ram_t: 0, disk: '0%', temp: '0', fts: false, status: 'INIT', busy: false });
  const [termOutput, setTermOutput] = useState(['-- TACTICAL_HUD_V13_INITIALIZED --']);
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [zuluTime, setZuluTime] = useState('--:--:--Z');
  const [notifs, setNotifs] = useState([]);

  const addNotif = (text, type = 'info') => {
    const id = Date.now();
    setNotifs(prev => [...prev, { id, text, type }]);
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const addTerm = (line) => setTermOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-20));

  // --- CLOCK ---
  useEffect(() => {
    const t = setInterval(() => setZuluTime(new Date().toISOString().substring(11, 19) + 'Z'), 1000);
    return () => clearInterval(t);
  }, []);

  // --- TELEMETRY ---
  useEffect(() => {
    if (!config) return;
    const poll = async () => {
      const target = band === 'A' ? config.ipA : config.ipB;
      if (!target) return;
      try {
        const r = await fetch(`http://${config.proxy}:8001/api/v1/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass }),
          signal: AbortSignal.timeout(4000)
        });
        const d = await r.json();
        if (d.status === 'success') {
          setStats({ cpu: d.cpu, ram: d.ram.perc, ram_u: d.ram.used, ram_t: d.ram.total, disk: d.disk, temp: d.temp, fts: d.fts, status: 'OPERATIONAL', busy: d.busy });
        } else { throw new Error(d.detail); }
      } catch (e) {
        setStats(prev => ({ ...prev, status: 'OFFLINE' }));
        setBand(prev => prev === 'A' ? 'B' : 'A');
        addNotif('AUTO_BAND_SWITCHING...', 'warning');
      }
    };
    const itv = setInterval(poll, 7000);
    poll();
    return () => clearInterval(itv);
  }, [config, band]);

  // --- ACTIONS ---
  const execCmd = async (c) => {
    if (!c || !config) return;
    addTerm(`> ${c}`);
    setUserInput('');
    const target = band === 'A' ? config.ipA : config.ipB;
    try {
      const r = await fetch(`http://${config.proxy}:8001/api/v1/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass, command: c })
      });
      const d = await r.json();
      addTerm(d.output || d.detail);
    } catch (e) { addTerm('ERR: PROXY_NOT_REACHABLE'); }
  };

  const triggerAction = async (act) => {
    if (!config || !confirm(`CONFIRM_SYS_${act.toUpperCase()}?`)) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    try {
      const r = await fetch(`http://${config.proxy}:8001/api/v1/action?action=${act}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass })
      });
      const d = await r.json();
      if (d.status === 'success') addNotif(`${act.toUpperCase()}_DISPATCHED`, 'success');
    } catch (e) { addNotif('CONN_ERROR', 'danger'); }
  };

  const sendComm = async () => {
    if (!userInput.trim() || !config) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const msg = { sender: config.callsign, text: userInput, time: new Date().toLocaleTimeString(), target_host: target, recipient: recipient };
    setUserInput('');
    try {
      await fetch(`http://${config.proxy}:8001/api/v1/comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
    } catch (e) {}
  };

  // --- COMMS & UNITS POLL ---
  useEffect(() => {
    if (!config) return;
    const itv = setInterval(async () => {
      try {
        const r = await fetch(`http://${config.proxy}:8001/api/v1/comms`);
        const d = await r.json();
        setMessages(d);

        const r2 = await fetch(`http://${config.proxy}:8001/api/v1/units`);
        const d2 = await r2.json();
        setUnits(d2);
      } catch (e) {}
    }, 3000);
    return () => clearInterval(itv);
  }, [config]);

  if (!config && !isConfigOpen) return null;

  return (
    <div className="container-fluid p-0">
      
      {/* TOP NAV / HUD */}
      <nav className="navbar navbar-dark bg-black border-bottom border-dark px-3" style={{height: '60px'}}>
        <div className="d-flex align-items-center gap-3">
          <div className="fw-900 text-orange" style={{letterSpacing: '2px'}}>TAK_BRIDGE_PRO</div>
          <span className="badge bg-dark border border-secondary font-mono small" style={{fontSize: '0.6rem'}}>
            {config?.callsign} // <span className={stats.status==='OPERATIONAL'?'text-green':'text-danger'}>{stats.status}</span>
          </span>
        </div>
        <div className="d-flex align-items-center gap-4">
           <div className="text-orange font-mono fw-bold">{zuluTime}</div>
           <Settings size={20} className="text-white-50 cursor-pointer" onClick={() => setIsConfigOpen(true)} />
        </div>
      </nav>

      {/* MAIN HUD */}
      <main className="p-3">
        {/* GAUGES ROW */}
        <div className="row g-3 mb-3 text-center align-items-stretch">
           {[
             { val: stats.cpu, label: 'CPU_LOAD', icon: <Cpu size={14}/>, color: 'text-orange' },
             { val: stats.ram, label: 'MEM_UTIL', icon: <Database size={14}/>, color: 'text-blue' },
             { val: stats.temp, label: 'CORE_TEMP', icon: <Thermometer size={14}/>, color: stats.temp > 70 ? 'text-danger' : 'text-green' },
             { val: stats.disk, label: 'DISK_CAP', icon: <HardDrive size={14}/>, color: 'text-white' }
           ].map((g, i) => (
             <div key={i} className="col-6 col-md-3">
                <div className="tactical-card p-3 h-100 d-flex flex-column align-items-center justify-content-center">
                   <div className="gauge-circle mb-2">
                      <div className={`gauge-val ${g.color}`}>{g.val}<span style={{fontSize: '0.6rem'}}>{g.label==='DISK_CAP'?'':'%'}</span></div>
                      <div className="gauge-label">{g.label}</div>
                   </div>
                   {g.label === 'MEM_UTIL' && <div className="small text-white-50 font-mono w-100 text-center" style={{fontSize: '0.5rem', marginTop: '2px'}}>{stats.ram_u}M/{stats.ram_t}M</div>}
                   {g.label !== 'MEM_UTIL' && <div style={{height: '10px'}}></div> /* Placeholder para mantener simetría */}
                </div>
             </div>
           ))}
        </div>

        {/* OPS ROW */}
        <div className="row g-3 mb-3">
           {/* TERMINAL */}
           <div className="col-12 col-lg-7">
              <div className="tactical-card h-100 d-flex flex-column">
                 <div className="card-header-tactical">
                    <div className={`cursor-pointer ${activeTab==='TERMINAL'?'text-orange':''}`} onClick={()=>setActiveTab('TERMINAL')}><TermIcon size={14}/> TERMINAL</div>
                    <div className="vr mx-2 bg-secondary" style={{height: '15px'}}></div>
                    <div className={`cursor-pointer ${activeTab==='COMMS'?'text-orange':''}`} onClick={()=>setActiveTab('COMMS')}><MessageSquare size={14}/> COMMS</div>
                 </div>
                 <div className="terminal-window d-flex">
                    {activeTab === 'TERMINAL' ? (
                      <div className="flex-grow-1 overflow-auto">
                        {termOutput.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
                      </div>
                    ) : (
                      <>
                        <div className="border-end border-dark pe-2 d-flex flex-column" style={{width: '120px'}}>
                           <div className="small text-white-50 mb-2 fw-bold" style={{fontSize: '0.5rem'}}>CONTACTS</div>
                           <div className={`cursor-pointer mb-1 p-1 small ${recipient==='ALL'?'bg-orange text-black fw-bold':''}`} onClick={()=>setRecipient('ALL')}>GLOBAL_NET</div>
                           {units.map((u, i) => (
                             <div key={i} className={`cursor-pointer mb-1 p-1 small text-truncate ${recipient===u.callsign?'bg-orange text-black fw-bold':''}`} onClick={()=>setRecipient(u.callsign)}>
                               {u.callsign}
                             </div>
                           ))}
                        </div>
                        <div className="flex-grow-1 overflow-auto p-2">
                          <div className="text-orange small mb-2 font-mono" style={{fontSize: '0.6rem'}}>{recipient === 'ALL' ? '>> BROADCAST_MODE' : `>> PRIVATE_TO: ${recipient}`}</div>
                          {messages.length === 0 ? (
                             <div className="text-white-50 small opacity-50">-- NO_MISSION_COMMS_DETECTED --</div>
                          ) : (
                            messages.filter(m => recipient === 'ALL' || m.recipient === recipient || m.sender === recipient).map((m, i) => (
                              <div key={i} className={`mb-3 ${m.sender === config.callsign ? 'text-end' : ''}`}>
                                 <div className={`d-inline-block p-1 px-3 rounded-1 ${m.sender === config.callsign ? 'bg-orange text-black' : 'bg-dark text-white'}`} style={{fontSize: '0.8rem', fontWeight: 800}}>
                                    {m.text}
                                 </div>
                                 <div className="text-white-50 font-mono" style={{fontSize: '0.4rem'}}>{m.time} // {m.sender} {m.recipient !== 'ALL' ? `-> ${m.recipient}` : ''}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                 </div>
                 <div className="p-2 border-top border-dark d-flex gap-2 bg-black">
                    <span className="text-orange fw-bold">{activeTab === 'TERMINAL' ? '>' : '#'}</span>
                    <input 
                      type="text" 
                      className="bg-transparent border-0 text-white flex-grow-1 outline-none font-mono small" 
                      style={{outline: 'none'}} 
                      value={userInput} 
                      onChange={e=>setUserInput(e.target.value)} 
                      onKeyPress={e=>e.key==='Enter' && (activeTab === 'TERMINAL' ? execCmd(userInput) : sendComm())} 
                      placeholder={activeTab === 'TERMINAL' ? "ENTER_CMD..." : "TYPE_MSG..."} 
                    />
                    <button className="btn btn-sm btn-orange border-0" onClick={() => activeTab === 'TERMINAL' ? execCmd(userInput) : sendComm()}>
                      <Send size={14} className="text-black" />
                    </button>
                 </div>
              </div>
           </div>

           {/* MAP */}
           <div className="col-12 col-lg-5">
              <div className="tactical-card" style={{height: '350px'}}>
                 <div className="card-header-tactical"><MapIcon size={14}/> GEOSPATIAL_INTEL</div>
                 <div className="position-relative h-100 w-100 overflow-hidden">
                    <GoogleMapHUD config={config} band={band} stats={stats} />
                    <div className="position-absolute bottom-0 start-0 p-2 bg-black bg-opacity-75 font-mono" style={{fontSize: '0.5rem', zIndex: 10}}>
                       <Shield size={10} className={stats.fts?'text-green':'text-danger'} /> FTS_{stats.fts?'STABLE':'DOWN'} // LINK_BAND_{band}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* ACTIONS ROW */}
        <div className="row g-2 mt-auto pt-3">
           <div className="col-4"><button className="btn btn-tactical w-100 py-3" onClick={()=>setBand(prev=>prev==='A'?'B':'A')}><Signal size={14}/> BAND_{band==='A'?'B':'A'}</button></div>
           <div className="col-4"><button className={`btn btn-tactical w-100 py-3 ${stats.busy?'opacity-50':''}`} onClick={()=>triggerAction('update')}><Download size={14}/> {stats.busy?'BUSY':'UPDATE'}</button></div>
           <div className="col-4"><button className="btn btn-tactical w-100 py-3 text-danger" onClick={()=>triggerAction('reboot')}><Power size={14}/> REBOOT</button></div>
        </div>
      </main>

      {/* NOTIFS */}
      <div className="position-fixed top-0 start-50 translate-middle-x mt-3" style={{zIndex: 3000, width: '280px'}}>
         <AnimatePresence>
            {notifs.map(n => (
              <motion.div key={n.id} initial={{y: -20, opacity: 0}} animate={{y: 0, opacity: 1}} exit={{opacity: 0}} className={`alert alert-${n.type === 'danger' ? 'danger' : 'success'} bg-black border-${n.type} text-white p-2 d-flex align-items-center gap-2 mb-2`}>
                 <Info size={16} /> <span className="small fw-bold">{n.text}</span>
              </motion.div>
            ))}
         </AnimatePresence>
      </div>

      {/* CONFIG MODAL */}
      <AnimatePresence>
         {isConfigOpen && (
           <motion.div className="config-full" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}>
              <div className="container-fluid p-0">
                 <div className="d-flex justify-content-between align-items-center mb-4">
                    <div className="text-orange fw-900">MISSION_SETUP</div>
                    {config && <X className="cursor-pointer" onClick={()=>setIsConfigOpen(false)} />}
                 </div>
                 <div className="row g-3">
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">PRIMARY_IP (BAND_A)</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.ipA} onChange={e=>setTempCfg({...tempCfg, ipA: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">SECONDARY_IP (BAND_B)</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.ipB} onChange={e=>setTempCfg({...tempCfg, ipB: e.target.value})} />
                    </div>
                    <div className="col-8">
                       <label className="text-white-50 small fw-bold mb-1 d-block">AUTH_USER</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.user} onChange={e=>setTempCfg({...tempCfg, user: e.target.value})} />
                    </div>
                    <div className="col-4">
                       <label className="text-white-50 small fw-bold mb-1 d-block">SSH_PORT</label>
                       <input type="number" className="hud-input w-100" value={tempCfg.sshPort} onChange={e=>setTempCfg({...tempCfg, sshPort: e.target.value})} />
                    </div>
                    <div className="col-12">
                       <label className="text-white-50 small fw-bold mb-1 d-block">AUTH_PASS</label>
                       <input type="password" className="hud-input w-100" value={tempCfg.pass} onChange={e=>setTempCfg({...tempCfg, pass: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">PROXY_IP</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.proxy} onChange={e=>setTempCfg({...tempCfg, proxy: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">CALLSIGN</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.callsign} onChange={e=>setTempCfg({...tempCfg, callsign: e.target.value})} />
                    </div>
                 </div>
                 <button className="btn btn-tactical w-100 mt-4 bg-orange text-black border-0 py-3" onClick={() => {
                    localStorage.setItem('tak_bootstrap_v13_cfg', JSON.stringify(tempCfg));
                    setConfig(tempCfg); setIsConfigOpen(false); window.location.reload();
                 }}>COMMIT_MISSION_CONFIG</button>
                 {config && <button className="btn btn-link text-danger small w-100 mt-2" onClick={()=>{if(confirm('ERASE_ALL?')){localStorage.removeItem('tak_bootstrap_v13_cfg'); window.location.reload();}}}>FACTORY_RESET</button>}
              </div>
           </motion.div>
         )}
      </AnimatePresence>

    </div>
  );
};

const GoogleMapHUD = ({ config, band, stats }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState({});

  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || !window.google || !window.google.maps) return;
      const m = new window.google.maps.Map(mapRef.current, {
        center: { lat: 40.4168, lng: -3.7038 },
        zoom: 15,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        styles: [{ featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'on' }] }]
      });
      setMap(m);
    };

    if (window.google) {
      initMap();
    } else {
      const itv = setInterval(() => {
        if (window.google) {
          initMap();
          clearInterval(itv);
        }
      }, 500);
      return () => clearInterval(itv);
    }
  }, []);

  useEffect(() => {
    if (!map || !config) return;
    const fetchUnits = async () => {
      try {
        const r = await fetch(`http://${config.proxy}:8001/api/v1/units`);
        const units = await r.json();
        
        // Update markers
        const newMarkers = { ...markers };
        units.forEach(u => {
          if (!newMarkers[u.callsign]) {
            newMarkers[u.callsign] = new window.google.maps.Marker({
              position: { lat: u.lat, lng: u.lng },
              map,
              label: { text: u.callsign, color: '#ff5500', fontWeight: 'bold', fontSize: '10px' },
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#ff5500',
                fillOpacity: 1,
                strokeWeight: 2,
                rotation: 0
              }
            });
          } else {
            newMarkers[u.callsign].setPosition({ lat: u.lat, lng: u.lng });
          }
        });
        setMarkers(newMarkers);
      } catch (e) {}
    };
    const itv = setInterval(fetchUnits, 5000);
    return () => clearInterval(itv);
  }, [map, config, markers]);

  return <div ref={mapRef} className="w-100 h-100" style={{ filter: 'grayscale(0.6) brightness(0.7)' }}></div>;
};

export default App;
