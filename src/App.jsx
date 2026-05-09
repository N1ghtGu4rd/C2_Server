import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, Database, HardDrive, Thermometer, Target, Signal,
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon,
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle, Info,
  Trash2, RotateCw, Layout, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('tak_bootstrap_v13_cfg');
    return saved ? JSON.parse(saved) : null;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(!config);
  const [tempCfg, setTempCfg] = useState(config || {
    ipA: '', ipB: '', user: 'server-tak', pass: 'C3rv3rus', proxy: 'localhost', callsign: 'HQ-OPERATOR', sshPort: '22', lat: '40.4168', lng: '-3.7038'
  });

  const [band, setBand] = useState('A');
  const [mobileView, setMobileView] = useState('MAP'); // MAP, CHAT, TERM, SYSTEM
  const [recipient, setRecipient] = useState({ name: 'ALL', uid: 'ALL' });
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: '0%', temp: '0', fts: false, status: 'INIT' });
  
  // CHAT & TERM STATE
  const [termLines, setTermLines] = useState(['-- SECURE_SSH_TERMINAL_v1.0 --']);
  const [termInput, setTermInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [zuluTime, setZuluTime] = useState('--:--:--Z');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener('resize', handleResize);
    const t = setInterval(() => setZuluTime(new Date().toISOString().substring(11, 19) + 'Z'), 1000);
    return () => { clearInterval(t); window.removeEventListener('resize', handleResize); };
  }, []);

  const pollTelemetry = async () => {
    if (!config) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    try {
      const r = await fetch(`http://${config.proxy}:8001/api/v1/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass })
      });
      const d = await r.json();
      if (d.cpu !== undefined) setStats({ cpu: d.cpu, ram: d.ram.perc, disk: d.disk, temp: d.temp, fts: d.fts, status: 'OPERATIONAL' });
    } catch (e) {}
  };

  useEffect(() => {
    pollTelemetry();
    const itv = setInterval(pollTelemetry, 10000);
    return () => clearInterval(itv);
  }, [config, band]);

  useEffect(() => {
    if (!config) return;
    const pollComms = async () => {
      try {
        const lat = (config.lat && config.lat !== 'undefined') ? config.lat : '40.4168';
        const lng = (config.lng && config.lng !== 'undefined') ? config.lng : '-3.7038';
        const target = band === 'A' ? config.ipA : config.ipB;
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
    const lat = config.lat || '40.4168';
    const lng = config.lng || '-3.7038';
    const msg = { 
      sender: config.callsign, 
      text: userInput, 
      time: new Date().toLocaleTimeString(), 
      target_host: target, 
      recipient: recipient.name, 
      recipient_uid: recipient.uid,
      lat: lat,
      lng: lng
    };
    setUserInput('');
    try { await fetch(`http://${config.proxy}:8001/api/v1/comms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch (e) {}
  };

  const executeTerm = async () => {
    if (!termInput.trim() || !config) return;
    const cmd = termInput;
    setTermInput('');
    setTermLines(prev => [...prev, `> ${cmd}`]);
    const target = band === 'A' ? config.ipA : config.ipB;
    try {
      const r = await fetch(`http://${config.proxy}:8001/api/v1/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass, command: cmd })
      });
      const d = await r.json();
      setTermLines(prev => [...prev, d.output]);
    } catch (e) {
      setTermLines(prev => [...prev, 'ERROR: REQ_FAILED']);
    }
  };

  return (
    <div className="tac-container font-mono">
      {/* HEADER */}
      <div className="tac-header">
        <div className="d-flex align-items-center gap-2">
          <Shield size={20} className="text-orange shadow-glow"/>
          <span className="text-orange fw-bold">TAK_C2</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <div className="text-orange fw-bold small">{zuluTime}</div>
          <button className="btn-ops orange" style={{padding:'4px'}} onClick={()=>setIsConfigOpen(true)}>
            <Settings size={16}/>
          </button>
        </div>
      </div>

      {/* MAIN VIEW */}
      <div className="flex-grow-1 overflow-hidden">
        {isMobile ? (
          <div className="h-100 d-flex flex-column">
             <div className="flex-grow-1 position-relative overflow-hidden">
                {mobileView === 'MAP' && (
                  <div className="h-100 w-100">
                     <GoogleMapHUD config={config} units={units} />
                     <div className="position-absolute top-0 start-0 m-2 p-2 bg-black bg-opacity-75 border border-dark rounded">
                        <div className="small text-orange mb-1">BAND_{band}</div>
                        <div className="d-flex gap-1">
                          <button className={`btn-ops p-1 px-2 ${band==='A'?'green':''}`} onClick={()=>setBand('A')}>A</button>
                          <button className={`btn-ops p-1 px-2 ${band==='B'?'orange':''}`} onClick={()=>setBand('B')}>B</button>
                        </div>
                     </div>
                  </div>
                )}
                {mobileView === 'CHAT' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 overflow-auto mb-2">
                        {messages.map((m, i) => (
                          <div key={i} className={`mb-2 ${m.sender === config?.callsign ? 'text-end' : ''}`}>
                            <div className={`d-inline-block p-2 rounded-1 ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark border border-secondary text-white'}`} style={{fontSize: '0.85rem'}}>
                              {m.text}
                            </div>
                            <div className="text-white-50" style={{fontSize: '0.4rem'}}>{m.time} // {m.sender}</div>
                          </div>
                        ))}
                     </div>
                     <div className="d-flex gap-2">
                        <input type="text" className="hud-input flex-grow-1" placeholder="TACTICAL_MSG..." value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                        <button className="btn-ops orange p-2 px-3" onClick={sendComm}><Send size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'TERM' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 bg-dark-subtle border border-dark rounded p-2 overflow-auto font-mono text-success" style={{fontSize:'0.7rem', backgroundColor:'#050608'}}>
                        {termLines.map((l, i) => <pre key={i} className="mb-1" style={{whiteSpace:'pre-wrap'}}>{l}</pre>)}
                     </div>
                     <div className="d-flex gap-2 mt-2">
                        <div className="d-flex align-items-center text-success fw-bold px-1"><ChevronRight size={18}/></div>
                        <input type="text" className="hud-input flex-grow-1" placeholder="SSH_COMMAND..." value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                        <button className="btn-ops green p-2 px-3" onClick={executeTerm}><TermIcon size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'SYSTEM' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <div className="row g-2 mb-4">
                        {[
                          { label: 'CPU', val: `${stats.cpu}%` }, { label: 'RAM', val: `${stats.ram}%` },
                          { label: 'DISK', val: stats.disk }, { label: 'TEMP', val: `${stats.temp}°C` }
                        ].map((s,i)=>(
                          <div className="col-6" key={i}>
                            <div className="tac-card p-3 text-center">
                               <div className="text-white-50 small mb-1">{s.label}</div>
                               <div className="fw-bold fs-4">{s.val}</div>
                            </div>
                          </div>
                        ))}
                     </div>
                     <div className="d-grid gap-2">
                        <button className="btn-ops red p-3" onClick={()=>pollTelemetry()}><Power size={20}/> SHUTDOWN</button>
                        <button className="btn-ops orange p-3" onClick={()=>pollTelemetry()}><RefreshCw size={20}/> REBOOT</button>
                        <button className="btn-ops green p-3" onClick={()=>pollTelemetry()}><Download size={20}/> UPDATE</button>
                     </div>
                  </div>
                )}
             </div>
             {/* NAV TAB */}
             <div className="mobile-nav">
                <div className={`text-center ${mobileView==='MAP'?'text-orange':''}`} onClick={()=>setMobileView('MAP')}>
                   <MapIcon size={24}/><div style={{fontSize:'0.5rem'}}>MAP</div>
                </div>
                <div className={`text-center ${mobileView==='CHAT'?'text-orange':''}`} onClick={()=>setMobileView('CHAT')}>
                   <MessageSquare size={24}/><div style={{fontSize:'0.5rem'}}>CHAT</div>
                </div>
                <div className={`text-center ${mobileView==='TERM'?'text-orange':''}`} onClick={()=>setMobileView('TERM')}>
                   <TermIcon size={24}/><div style={{fontSize:'0.5rem'}}>TERM</div>
                </div>
                <div className={`text-center ${mobileView==='SYSTEM'?'text-orange':''}`} onClick={()=>setMobileView('SYSTEM')}>
                   <Layout size={24}/><div style={{fontSize:'0.5rem'}}>SYS</div>
                </div>
             </div>
          </div>
        ) : (
          /* DESKTOP (Split Screen) */
          <div className="h-100 d-flex flex-column gap-2 p-2">
            <div className="stats-grid">
               {[
                 { label: 'CPU', val: `${stats.cpu}%` }, { label: 'RAM', val: `${stats.ram}%` },
                 { label: 'DISK', val: stats.disk }, { label: 'FTS', val: stats.fts?'ONLINE':'OFFLINE' }
               ].map((s,i)=>(
                 <div className="tac-card p-2 d-flex align-items-center gap-3" key={i}>
                    <div className="p-2 bg-black border border-dark rounded text-orange"><Cpu size={14}/></div>
                    <div><div className="text-white-50 small" style={{fontSize:'0.5rem'}}>{s.label}</div><div className="fw-bold">{s.val}</div></div>
                 </div>
               ))}
            </div>
            <div className="main-layout">
               <div className="tac-card shadow">
                  <GoogleMapHUD config={config} units={units} />
               </div>
               <div className="tac-card d-flex flex-column">
                  <div className="p-2 border-bottom border-dark bg-dark d-flex gap-4">
                    <div className="small fw-bold text-orange">CHAT</div>
                    <div className="small fw-bold text-white-50" onClick={()=>setMobileView('TERM')}>SSH_TERM</div>
                  </div>
                  <div className="flex-grow-1 overflow-auto p-2">
                    {messages.map((m, i) => (
                      <div key={i} className="mb-2">
                        <span className="text-orange fw-bold">{m.sender}:</span> {m.text}
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-top border-dark d-flex gap-2">
                    <input type="text" className="hud-input flex-grow-1" value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                    <button className="btn-ops orange p-1 px-3" onClick={sendComm}><Send size={16}/></button>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* CONFIG */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-black bg-opacity-95" style={{zIndex: 1000}}>
             <div className="tac-card p-4 rounded shadow-lg m-2" style={{maxWidth: '450px', width: '100%'}}>
                 <h6 className="text-orange border-bottom border-dark pb-2 mb-4 fw-bold">MISSION_PROPERTIES</h6>
                 <div className="row g-2">
                    <div className="col-6"><input type="text" className="hud-input" value={tempCfg.ipA} placeholder="IP_PRIMARY" onChange={e=>setTempCfg({...tempCfg, ipA: e.target.value})} /></div>
                    <div className="col-6"><input type="text" className="hud-input" value={tempCfg.ipB} placeholder="IP_FAILOVER" onChange={e=>setTempCfg({...tempCfg, ipB: e.target.value})} /></div>
                    <div className="col-6"><input type="text" className="hud-input" value={tempCfg.user} placeholder="USER" onChange={e=>setTempCfg({...tempCfg, user: e.target.value})} /></div>
                    <div className="col-6"><input type="password" className="hud-input" value={tempCfg.pass} placeholder="PASS" onChange={e=>setTempCfg({...tempCfg, pass: e.target.value})} /></div>
                    <div className="col-12"><input type="text" className="hud-input" value={tempCfg.callsign} placeholder="CALLSIGN" onChange={e=>setTempCfg({...tempCfg, callsign: e.target.value})} /></div>
                    <div className="col-6"><input type="text" className="hud-input" value={tempCfg.lat} placeholder="LAT" onChange={e=>setTempCfg({...tempCfg, lat: e.target.value})} /></div>
                    <div className="col-6"><input type="text" className="hud-input" value={tempCfg.lng} placeholder="LNG" onChange={e=>setTempCfg({...tempCfg, lng: e.target.value})} /></div>
                 </div>
                 <button className="btn-ops orange w-100 mt-4 py-3 fw-bold" onClick={() => {
                    localStorage.setItem('tak_bootstrap_v13_cfg', JSON.stringify(tempCfg));
                    setConfig(tempCfg);
                    setIsConfigOpen(false);
                    window.location.reload();
                 }}>INITIALIZE</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const GoogleMapHUD = ({ config, units }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const markersRef = useRef({});

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    const m = new window.google.maps.Map(mapRef.current, {
      center: { lat: parseFloat(config?.lat || 40.4168), lng: parseFloat(config?.lng || -3.7038) },
      zoom: 15,
      mapTypeId: 'satellite',
      disableDefaultUI: true,
      styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }]
    });
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map || !units) return;
    units.forEach(u => {
      if (markersRef.current[u.callsign]) {
        markersRef.current[u.callsign].setPosition({ lat: u.lat, lng: u.lng });
      } else {
        markersRef.current[u.callsign] = new window.google.maps.Marker({
          position: { lat: u.lat, lng: u.lng },
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: u.callsign === config?.callsign ? '#00ff00' : '#ff9d00',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#fff',
            rotation: 0
          }
        });
      }
    });
  }, [map, units]);

  return <div ref={mapRef} style={{width:'100%', height:'100%'}} />;
};

export default App;
