import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, Database, HardDrive, Thermometer, Target, Signal,
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon,
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle, Info
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
    ipA: '', ipB: '', user: 'server-tak', pass: 'C3rv3rus', proxy: 'localhost', callsign: 'HQ-OPERATOR', sshPort: '22', lat: '40.4168', lng: '-3.7038'
  });

  // --- OPS STATE ---
  const [band, setBand] = useState('A');
  const [activeTab, setActiveTab] = useState('TERMINAL');
  const [recipient, setRecipient] = useState({ name: 'ALL', uid: 'ALL' });
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: '0%', temp: '0', fts: false, status: 'INIT' });
  const [termOutput, setTermOutput] = useState(['-- TACTICAL_HUD_V14_INITIALIZED --']);
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
          body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass })
        });
        const d = await r.json();
        if (d.status === 'success') {
          setStats({ cpu: d.cpu, ram: d.ram.perc, disk: d.disk, temp: d.temp, fts: d.fts, status: 'OPERATIONAL' });
        }
      } catch (e) {}
    };
    poll();
    const itv = setInterval(poll, 10000);
    return () => clearInterval(itv);
  }, [config, band]);

  // --- COMMS & UNITS ---
  useEffect(() => {
    if (!config) return;
    const pollComms = async () => {
      try {
        const target = band === 'A' ? config.ipA : config.ipB;
        const lat = config.lat || '40.4168';
        const lng = config.lng || '-3.7038';
        
        const r1 = await fetch(`http://${config.proxy}:8001/api/v1/comms`);
        const d1 = await r1.json();
        setMessages(d1);

        const r2 = await fetch(`http://${config.proxy}:8001/api/v1/units?host=${target}&callsign=${config.callsign}&lat=${lat}&lng=${lng}`);
        const d2 = await r2.json();
        setUnits(d2);
      } catch (e) {}
    };
    pollComms();
    const itv = setInterval(pollComms, 3000);
    return () => clearInterval(itv);
  }, [config, band]);

  const sendComm = async () => {
    if (!userInput.trim() || !config) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const msg = { 
      sender: config.callsign, 
      text: userInput, 
      time: new Date().toLocaleTimeString(), 
      target_host: target, 
      recipient: recipient.name,
      recipient_uid: recipient.uid
    };
    setUserInput('');
    try {
      await fetch(`http://${config.proxy}:8001/api/v1/comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
    } catch (e) {}
  };

  return (
    <div className="tac-container bg-black text-white vh-100 d-flex flex-column p-2 overflow-hidden font-mono">
      {/* HUD HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-2 px-2 border-bottom border-dark pb-2 shadow-sm">
        <div className="d-flex align-items-center gap-3">
          <div className="text-orange fw-bold d-flex align-items-center gap-2" style={{fontSize: '1.2rem'}}>
             <Shield size={20}/> TAK_C2_BRIDGE <span className="badge bg-dark text-orange border border-orange ms-2" style={{fontSize: '0.6rem'}}>v1.4</span>
          </div>
          <div className="vr bg-secondary" style={{height: '20px'}}></div>
          <div className="small text-white-50">BAND: <span className={band==='A'?'text-success':'text-warning'}>{band==='A'?'PRIMARY':'SECONDARY'}</span></div>
        </div>
        <div className="d-flex align-items-center gap-4">
           <div className="text-center">
             <div className="text-white-50" style={{fontSize: '0.5rem'}}>ZULU_TIME</div>
             <div className="fw-bold text-orange" style={{letterSpacing: '1px'}}>{zuluTime}</div>
           </div>
           <button className="btn btn-outline-secondary btn-sm border-dark text-white-50" onClick={()=>setIsConfigOpen(true)}>
             <Settings size={16}/>
           </button>
        </div>
      </div>

      {/* TACTICAL GRID */}
      <div className="row g-2 mb-2 px-1">
        {[
          { icon: <Cpu size={14}/>, label: 'CPU_LOAD', val: `${stats.cpu}%`, color: stats.cpu > 70 ? 'text-danger' : 'text-success' },
          { icon: <Database size={14}/>, label: 'RAM_USAGE', val: `${stats.ram}%`, color: 'text-info' },
          { icon: <HardDrive size={14}/>, label: 'DISK_SPACE', val: stats.disk, color: 'text-warning' },
          { icon: <Thermometer size={14}/>, label: 'CORE_TEMP', val: `${stats.temp}°C`, color: stats.temp > 60 ? 'text-danger' : 'text-success' }
        ].map((item, i) => (
          <div className="col-3" key={i}>
            <div className="tac-card p-2 border border-dark rounded-1 bg-dark-subtle d-flex align-items-center gap-2">
               <div className={`p-1 rounded-circle bg-dark border border-secondary ${item.color}`}>{item.icon}</div>
               <div>
                 <div className="text-white-50 fw-bold" style={{fontSize: '0.45rem'}}>{item.label}</div>
                 <div className={`fw-bold ${item.color}`} style={{fontSize: '0.9rem'}}>{item.val}</div>
               </div>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN CONSOLE AREA */}
      <div className="flex-grow-1 row g-2 overflow-hidden px-1">
         {/* LEFT: MAP HUB */}
         <div className="col-8 h-100 position-relative">
            <div className="tac-card h-100 border border-dark rounded-1 overflow-hidden">
               <GoogleMapHUD config={config} band={band} units={units} />
            </div>
            {/* NETWORK OVERLAY */}
            <div className="position-absolute top-0 start-0 m-3 p-2 bg-black bg-opacity-75 border border-dark rounded-1 shadow" style={{zIndex: 10, backdropFilter: 'blur(4px)'}}>
               <div className="d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center gap-2">
                     <div className={`status-dot ${stats.fts ? 'bg-success shadow-success' : 'bg-danger'}`}></div>
                     <span className="small fw-bold" style={{fontSize: '0.6rem'}}>FTS_SERVER</span>
                  </div>
                  <div className="vr bg-secondary" style={{height: '10px'}}></div>
                  <div className="d-flex gap-1">
                     <button className={`btn btn-xs ${band==='A'?'btn-success':'btn-outline-secondary'}`} style={{fontSize: '0.5rem'}} onClick={()=>setBand('A')}>BAND_A</button>
                     <button className={`btn btn-xs ${band==='B'?'btn-warning text-black':'btn-outline-secondary'}`} style={{fontSize: '0.5rem'}} onClick={()=>setBand('B')}>BAND_B</button>
                  </div>
               </div>
            </div>
         </div>

         {/* RIGHT: COMMS & CONTACTS */}
         <div className="col-4 h-100 d-flex flex-column gap-2">
            <div className="tac-card flex-grow-1 border border-dark rounded-1 d-flex flex-column overflow-hidden">
               <div className="p-2 border-bottom border-dark bg-dark d-flex gap-3 align-items-center">
                  <div className={`cursor-pointer small fw-bold ${activeTab==='TERMINAL'?'text-orange border-bottom border-orange':''}`} onClick={()=>setActiveTab('TERMINAL')}>
                    <TermIcon size={12}/> LOGS
                  </div>
                  <div className={`cursor-pointer small fw-bold ${activeTab==='COMMS'?'text-orange border-bottom border-orange':''}`} onClick={()=>setActiveTab('COMMS')}>
                    <MessageSquare size={12}/> COMMS
                  </div>
               </div>
               
               <div className="flex-grow-1 overflow-auto p-2">
                  {activeTab === 'TERMINAL' ? (
                     <div className="small text-white-50 font-mono">
                        {termOutput.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
                     </div>
                  ) : (
                     <div className="d-flex h-100">
                        <div className="border-end border-dark pe-2 d-flex flex-column" style={{width: '100px'}}>
                           <div className="text-white-50 mb-2 fw-bold" style={{fontSize: '0.5rem'}}>CONTACTS</div>
                           <div className={`cursor-pointer mb-1 p-1 small rounded ${recipient.name==='ALL'?'bg-orange text-black fw-bold':''}`} onClick={()=>setRecipient({name: 'ALL', uid: 'ALL'})}>GLOBAL</div>
                           {units.filter(u=>u.status==='ONLINE').map((u, i) => (
                             <div key={i} className={`cursor-pointer mb-1 p-1 small text-truncate rounded ${recipient.name===u.callsign?'bg-orange text-black fw-bold':''}`} onClick={()=>setRecipient({name: u.callsign, uid: u.uid})}>
                               {u.callsign}
                             </div>
                           ))}
                        </div>
                        <div className="flex-grow-1 ps-2 overflow-auto">
                           <div className="text-orange mb-2 font-mono" style={{fontSize: '0.6rem'}}>{recipient.name === 'ALL' ? '>> GLOBAL_NET' : `>> TO: ${recipient.name}`}</div>
                           {messages.map((m, i) => (
                             <div key={i} className={`mb-2 ${m.sender === config?.callsign ? 'text-end' : ''}`}>
                                <div className={`d-inline-block p-1 px-2 rounded-1 ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark text-white'}`} style={{fontSize: '0.75rem'}}>
                                   {m.text}
                                </div>
                                <div className="text-white-50" style={{fontSize: '0.4rem'}}>{m.time} // {m.sender}</div>
                             </div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
               
               <div className="p-2 border-top border-dark d-flex gap-2 bg-black">
                  <input type="text" className="hud-input flex-grow-1 bg-dark border-secondary text-white p-1 px-2 small rounded" placeholder="TYPE_MESSAGE..." value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                  <button className="btn btn-sm bg-orange text-black border-0" onClick={sendComm}><Send size={14}/></button>
               </div>
            </div>
         </div>
      </div>

      {/* CONFIG MODAL */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)'}}>
             <div className="bg-dark border border-orange p-4 rounded-1 shadow-lg" style={{width: '500px'}}>
                 <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="text-orange mb-0 fw-bold">MISSION_CONFIG</h5>
                    <X className="cursor-pointer text-white-50" onClick={()=>setIsConfigOpen(false)}/>
                 </div>
                 <div className="row g-3">
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">IP_BAND_A</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.ipA} onChange={e=>setTempCfg({...tempCfg, ipA: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">IP_BAND_B</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.ipB} onChange={e=>setTempCfg({...tempCfg, ipB: e.target.value})} />
                    </div>
                    <div className="col-4">
                       <label className="text-white-50 small fw-bold mb-1 d-block">SSH_USER</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.user} onChange={e=>setTempCfg({...tempCfg, user: e.target.value})} />
                    </div>
                    <div className="col-4">
                       <label className="text-white-50 small fw-bold mb-1 d-block">SSH_PASS</label>
                       <input type="password" className="hud-input w-100" value={tempCfg.pass} onChange={e=>setTempCfg({...tempCfg, pass: e.target.value})} />
                    </div>
                    <div className="col-4">
                       <label className="text-white-50 small fw-bold mb-1 d-block">SSH_PORT</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.sshPort} onChange={e=>setTempCfg({...tempCfg, sshPort: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">PROXY_IP</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.proxy} onChange={e=>setTempCfg({...tempCfg, proxy: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">CALLSIGN</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.callsign} onChange={e=>setTempCfg({...tempCfg, callsign: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">BASE_LAT</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.lat} onChange={e=>setTempCfg({...tempCfg, lat: e.target.value})} />
                    </div>
                    <div className="col-6">
                       <label className="text-white-50 small fw-bold mb-1 d-block">BASE_LNG</label>
                       <input type="text" className="hud-input w-100" value={tempCfg.lng} onChange={e=>setTempCfg({...tempCfg, lng: e.target.value})} />
                    </div>
                 </div>
                 <button className="btn btn-tactical w-100 mt-4 bg-orange text-black border-0 py-3" onClick={() => {
                    localStorage.setItem('tak_bootstrap_v13_cfg', JSON.stringify(tempCfg));
                    setConfig(tempCfg);
                    setIsConfigOpen(false);
                    window.location.reload();
                 }}>SAVE_&_INITIALIZE</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const GoogleMapHUD = ({ config, band, units }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState({});

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    const m = new window.google.maps.Map(mapRef.current, {
      center: { lat: parseFloat(config?.lat || 40.4168), lng: parseFloat(config?.lng || -3.7038) },
      zoom: 15,
      mapTypeId: 'satellite',
      disableDefaultUI: true,
      styles: [{ featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'on' }] }]
    });
    setMap(m);
  }, [config]);

  useEffect(() => {
    if (!map || !units) return;
    // Update markers
    const newMarkers = { ...markers };
    units.forEach(u => {
      if (newMarkers[u.callsign]) {
        newMarkers[u.callsign].setPosition({ lat: u.lat, lng: u.lng });
      } else {
        newMarkers[u.callsign] = new window.google.maps.Marker({
          position: { lat: u.lat, lng: u.lng },
          map: map,
          title: u.callsign,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: u.callsign === config.callsign ? '#00ff00' : '#ff9900',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#000',
            rotation: 0
          }
        });
      }
    });
    setMarkers(newMarkers);
  }, [map, units]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default App;
