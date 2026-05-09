import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, Database, HardDrive, Thermometer, Target, Signal,
  Settings, X, Power, RefreshCw, Download, Terminal as TermIcon,
  MessageSquare, Map as MapIcon, Send, AlertTriangle, Shield, CheckCircle, Info,
  Trash2, RotateCw, Layout, ChevronRight, Users
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
  const [tempCfg, setTempCfg] = useState(config || {
    ipA: '', ipB: '', user: 'server-tak', pass: 'C3rv3rus', proxy: window.location.hostname, callsign: 'HQ-OPERATOR', sshPort: '22', lat: '40.4168', lng: '-3.7038'
  });

  const [band, setBand] = useState('A');
  const [mobileView, setMobileView] = useState('MAP');
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: '0%', temp: '0', fts: false, status: 'DISCONNECTED' });
  
  const [termLines, setTermLines] = useState(['-- TACTICAL_DUAL_BAND_C2_v2.2 --']);
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
    if (!target) return;
    const baseUrl = `http://${config.proxy}:8001`;
    try {
      const r = await fetch(`${baseUrl}/api/v1/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: target, port: parseInt(config.sshPort), user: config.user, password: config.pass })
      });
      const d = await r.json();
      if (d.cpu !== undefined) setStats({ cpu: d.cpu, ram: d.ram.perc, disk: d.disk, temp: d.temp, fts: d.fts, status: 'OPERATIONAL' });
    } catch (e) { setStats(prev => ({ ...prev, status: 'OFFLINE' })); }
  };

  useEffect(() => {
    pollTelemetry();
    const itv = setInterval(pollTelemetry, 10000);
    return () => clearInterval(itv);
  }, [config, band]);

  useEffect(() => {
    if (!config) return;
    const pollComms = async () => {
      const baseUrl = `http://${config.proxy}:8001`;
      const target = band === 'A' ? config.ipA : config.ipB;
      try {
        const lat = (config.lat && config.lat !== 'undefined') ? config.lat : '40.4168';
        const lng = (config.lng && config.lng !== 'undefined') ? config.lng : '-3.7038';
        const r1 = await fetch(`${baseUrl}/api/v1/comms`);
        const d1 = await r1.json();
        setMessages(d1.map(m => ({...m, sender: decodeHTMLEntities(m.sender), text: decodeHTMLEntities(m.text)})));
        const r2 = await fetch(`${baseUrl}/api/v1/units?host=${target}&callsign=${config.callsign}&lat=${lat}&lng=${lng}`);
        const d2 = await r2.json();
        setUnits(d2.map(u => ({...u, callsign: decodeHTMLEntities(u.callsign)})));
      } catch (e) {}
    };
    pollComms();
    const itv = setInterval(pollComms, 3000);
    return () => clearInterval(itv);
  }, [config, band]);

  const sendComm = async () => {
    if (!userInput.trim() || !config) return;
    const target = band === 'A' ? config.ipA : config.ipB;
    const baseUrl = `http://${config.proxy}:8001`;
    const msg = { sender: config.callsign, text: userInput, time: new Date().toLocaleTimeString(), target_host: target, lat: config.lat, lng: config.lng };
    setUserInput('');
    try { await fetch(`${baseUrl}/api/v1/comms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch (e) {}
  };

  const executeTerm = async () => {
    if (!termInput.trim() || !config) return;
    const cmd = termInput; setTermInput('');
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
          <div className={`p-1 rounded-circle ${stats.status==='OPERATIONAL'?'bg-success shadow-glow':'bg-danger'}`} style={{width:8, height:8}}></div>
          <span className="text-orange fw-bold">TAK_C2</span>
        </div>
        <div className="text-orange small">{zuluTime}</div>
        <button className="btn-ops orange p-1" onClick={()=>setIsConfigOpen(true)}><Settings size={18}/></button>
      </div>

      <div className="flex-grow-1 overflow-hidden">
        {isMobile ? (
          <div className="h-100 d-flex flex-column">
             <div className="flex-grow-1 position-relative overflow-hidden">
                {mobileView === 'MAP' && (
                  <div className="h-100 w-100 position-relative">
                    <GoogleMapHUD config={config} units={units} />
                    <div className="position-absolute top-0 start-0 m-2 p-2 bg-black bg-opacity-75 border border-dark rounded" style={{zIndex:10}}>
                       <div className="small text-orange mb-1 fw-bold">BAND_LINK</div>
                       <div className="d-flex gap-1">
                          <button className={`btn-ops p-1 px-3 ${band==='A'?'green':'bg-dark'}`} onClick={()=>setBand('A')}>A</button>
                          <button className={`btn-ops p-1 px-3 ${band==='B'?'orange':'bg-dark'}`} onClick={()=>setBand('B')}>B</button>
                       </div>
                    </div>
                  </div>
                )}
                {mobileView === 'CHAT' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 overflow-auto mb-2 p-2">
                        {messages.map((m, i) => (
                          <div key={i} className={`mb-2 ${m.sender === config?.callsign ? 'text-end' : ''}`}>
                            <div className={`d-inline-block p-2 rounded-1 ${m.sender === config?.callsign ? 'bg-orange text-black' : 'bg-dark border border-secondary text-white'}`} style={{fontSize: '0.85rem'}}>
                              {m.text}
                            </div>
                            <div className="text-white-50" style={{fontSize: '0.5rem'}}>{m.time} // {m.sender}</div>
                          </div>
                        ))}
                     </div>
                     <div className="d-flex gap-2">
                        <input type="text" className="hud-input flex-grow-1" placeholder="TACTICAL_CHAT..." value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendComm()} />
                        <button className="btn-ops orange p-2 px-3" onClick={sendComm}><Send size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'TERM' && (
                  <div className="h-100 d-flex flex-column bg-black p-2">
                     <div className="flex-grow-1 border border-dark rounded p-2 overflow-auto font-mono" style={{fontSize:'0.7rem', backgroundColor:'#000', color:'#00ff41'}}>
                        {termLines.map((l, i) => <pre key={i} className="mb-0">{l}</pre>)}
                     </div>
                     <div className="d-flex gap-2 mt-2">
                        <input type="text" className="hud-input flex-grow-1" placeholder="CMD..." value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&executeTerm()} />
                        <button className="btn-ops green p-2 px-3" onClick={executeTerm}><TermIcon size={20}/></button>
                     </div>
                  </div>
                )}
                {mobileView === 'USERS' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <h6 className="text-orange border-bottom border-dark pb-2 mb-3 d-flex justify-content-between">
                        <span>ORBAT_LIST</span>
                        <span className="badge bg-dark text-orange">{units.length}</span>
                     </h6>
                     <div className="d-flex flex-column gap-2">
                        {units.map((u, i) => (
                          <div key={i} className="tac-card p-3 d-flex justify-content-between align-items-center">
                             <div className="d-flex align-items-center gap-3">
                                <div className="p-2 bg-orange rounded-circle" style={{width:8, height:8}}></div>
                                <div className="fw-bold">{u.callsign}</div>
                             </div>
                             <div className="text-orange small">{u.lat.toFixed(3)}, {u.lng.toFixed(3)}</div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
                {mobileView === 'SYSTEM' && (
                  <div className="h-100 bg-black p-3 overflow-auto">
                     <div className="row g-2 mb-3">
                        {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'SSD',v:stats.disk},{l:'BAND',v:band}].map((s,i)=>(
                          <div className="col-6" key={i}><div className="tac-card p-3 text-center"><div className="text-white-50 small">{s.l}</div><div className="fw-bold">{s.v}</div></div></div>
                        ))}
                     </div>
                     <div className="d-grid gap-2">
                        <button className="btn-ops red p-3" onClick={()=>pollTelemetry()}><Power size={18}/> SHUTDOWN</button>
                        <button className="btn-ops orange p-3" onClick={()=>pollTelemetry()}><RefreshCw size={18}/> REBOOT</button>
                     </div>
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
          /* DESKTOP */
          <div className="h-100 d-flex flex-column gap-2 p-2">
            <div className="stats-grid">
               {[{l:'CPU',v:`${stats.cpu}%`},{l:'RAM',v:`${stats.ram}%`},{l:'DISK',v:stats.disk},{l:'ACTIVE_BAND',v:band}].map((s,i)=>(
                 <div className="tac-card p-2 d-flex align-items-center gap-3" key={i}>
                    <div className="p-2 bg-black border border-dark rounded text-orange"><Cpu size={14}/></div>
                    <div><div className="text-white-50 small" style={{fontSize:'0.5rem'}}>{s.l}</div><div className="fw-bold">{s.v}</div></div>
                 </div>
               ))}
            </div>
            <div className="main-layout">
               <div className="tac-card shadow position-relative">
                  <GoogleMapHUD config={config} units={units} />
                  <div className="position-absolute top-0 start-0 m-3 p-2 bg-black bg-opacity-75 border border-dark rounded" style={{zIndex:10}}>
                     <div className="small fw-bold text-orange mb-1">NETWORK_LINK</div>
                     <div className="d-flex gap-1">
                        <button className={`btn-ops p-1 px-3 ${band==='A'?'green':'bg-dark'}`} onClick={()=>setBand('A')}>BAND_A</button>
                        <button className={`btn-ops p-1 px-3 ${band==='B'?'orange':'bg-dark'}`} onClick={()=>setBand('B')}>BAND_B</button>
                     </div>
                  </div>
               </div>
               <div className="tac-card d-flex flex-column" style={{maxWidth:'350px'}}>
                  <div className="p-2 border-bottom border-dark bg-dark small fw-bold text-orange">ORBAT_COMMS</div>
                  <div className="flex-grow-1 overflow-auto p-2 font-mono" style={{fontSize:'0.7rem'}}>
                    {messages.map((m, i) => (<div key={i} className="mb-1"><span className="text-orange">{m.sender}:</span> {m.text}</div>))}
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

      <AnimatePresence>
        {isConfigOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-black bg-opacity-95" style={{zIndex:1000}}>
             <div className="tac-card p-4 rounded shadow-lg m-2" style={{maxWidth:'500px', width:'100%'}}>
                 <h6 className="text-orange border-bottom border-dark pb-2 mb-4">TACTICAL_DUAL_BAND_INIT</h6>
                 <div className="row g-2">
                    <div className="col-12"><div className="alert alert-warning py-1 mb-2" style={{fontSize:'0.55rem'}}>MOBILE_ACCESS: Use PC IP instead of 'localhost'. Current: {window.location.hostname}</div></div>
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
                 }}>INITIALIZE_NETWORK</button>
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
      zoom: 15, mapTypeId: 'satellite', disableDefaultUI: true,
      styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }]
    });
    setMap(m);
  }, []);

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
