import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  Power, 
  Cpu, 
  Database,
  Eye,
  EyeOff,
  RefreshCw,
  Signal,
  Lock,
  Settings,
  Save,
  X,
  Map as MapIcon,
  Wifi,
  Clock,
  Shield,
  Server,
  Radio,
  FileText,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Zap,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [isNightVision, setIsNightVision] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [isSecure, setIsSecure] = useState(true);

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('tak_c2_v3_config');
    return saved ? JSON.parse(saved) : { 
      primaryIp: '192.168.1.60', 
      secondaryIp: '172.26.197.97',
      apiPort: '8080',
      sshPort: '22',
      ztId: 'd5e5eada668fXXXX',
      apiKey: 'FTS-TAK-COMMAND-01',
      callsign: 'COMMANDER-HQ'
    };
  });

  const [stats, setStats] = useState({
    cpu: 18,
    ram: 4.2,
    disk: 22,
    clients: 6,
    uptime: '14:22:05'
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setStats(prev => ({
        ...prev,
        cpu: Math.floor(Math.random() * 15 + 10),
        ram: (Math.random() * 0.2 + 4.1).toFixed(1),
        clients: Math.floor(Math.random() * 2 + 5)
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const toggleNightVision = () => {
    setIsNightVision(!isNightVision);
    document.documentElement.setAttribute('data-theme', !isNightVision ? 'night-vision' : 'default');
  };

  return (
    <div className="c2-container">
      {/* Top Mission Header */}
      <header className="c2-header">
        <div className="header-left">
          <div className="status-dot-active"></div>
          <div>
            <div className="header-title">TAK COMMAND & CONTROL</div>
            <div className="header-subtitle">HOST: {config.primaryIp} // {config.callsign}</div>
          </div>
        </div>
        <div className="header-right">
          <div className="uptime-box">
            <Clock size={12} /> {stats.uptime}
          </div>
          <button className="icon-btn" onClick={() => setShowConfig(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="c2-nav">
        {['DASHBOARD', 'CLIENTS', 'SYSTEM', 'LOGS'].map(tab => (
          <button 
            key={tab} 
            className={`nav-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Dynamic Viewport */}
      <main className="c2-viewport">
        <AnimatePresence mode="wait">
          {activeTab === 'DASHBOARD' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="tab-content"
            >
              {/* Critical Stats Grid */}
              <div className="stats-grid">
                <div className="c2-card">
                  <div className="card-label"><Cpu size={12} /> CPU LOAD</div>
                  <div className="card-value">{stats.cpu}%</div>
                  <div className="progress-bar"><div className="fill" style={{ width: `${stats.cpu}%` }} /></div>
                </div>
                <div className="c2-card">
                  <div className="card-label"><Database size={12} /> RAM USAGE</div>
                  <div className="card-value">{stats.ram}GB</div>
                  <div className="progress-bar"><div className="fill" style={{ width: `${(stats.ram/16)*100}%` }} /></div>
                </div>
                <div className="c2-card">
                  <div className="card-label"><Users size={12} /> ACTIVE TAK UNITS</div>
                  <div className="card-value" style={{ color: 'var(--c2-accent)' }}>0{stats.clients}</div>
                </div>
                <div className="c2-card">
                  <div className="card-label"><Signal size={12} /> NETWORK LATENCY</div>
                  <div className="card-value">12MS</div>
                </div>
              </div>

              {/* Tactical Overview */}
              <div className="c2-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-label"><MapIcon size={12} /> GEOSPATIAL COMMAND OVERVIEW</div>
                <div className="tactical-map">
                  {/* Mock Map Background */}
                  <div className="map-overlay">
                    <div className="unit-marker" style={{ top: '30%', left: '40%' }}>ALPHA-01</div>
                    <div className="unit-marker" style={{ top: '60%', left: '70%' }}>RECON-2</div>
                  </div>
                </div>
              </div>

              {/* Fast Action Dock */}
              <div className="action-dock">
                <button className="action-btn" onClick={toggleNightVision}>
                  {isNightVision ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span>NIGHT VISION</span>
                </button>
                <button className="action-btn" onClick={() => setIsSecure(!isSecure)}>
                  <Shield size={18} color={isSecure ? 'var(--c2-accent)' : '#ff4444'} />
                  <span>SECURE MODE</span>
                </button>
                <button className="action-btn warning" onClick={() => alert('REBOOTING FTS SERVICE...')}>
                  <RefreshCw size={18} />
                  <span>RESTART SERVICE</span>
                </button>
                <button className="action-btn critical" onClick={() => confirm('INITIATE SERVER SHUTDOWN?')}>
                  <Power size={18} />
                  <span>TERMINATE</span>
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'CLIENTS' && (
            <motion.div key="clients" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tab-content">
              <div className="c2-card">
                <div className="card-label">CONNECTED TACTICAL UNITS</div>
                <div className="client-list">
                  {['KILO-1', 'SIERRA-4', 'VICTOR-2', 'HOTEL-3'].map(id => (
                    <div key={id} className="client-row">
                      <div className="client-id">{id}</div>
                      <div className="client-meta">ONLINE // 192.168.1.{(Math.random()*100).toFixed(0)}</div>
                      <div className="client-actions">
                        <button onClick={() => alert(`Kicking ${id}`)}>KICK</button>
                        <button onClick={() => alert(`Messaging ${id}`)}>MSG</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          
          {activeTab === 'LOGS' && (
            <motion.div key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tab-content">
              <div className="c2-card console-view">
                <div className="card-label"><Terminal size={12} /> SYSTEM_KERNEL_LOGS</div>
                <div className="console-text">
                  [14:22:01] INFO: FTS Core initialized on port {config.apiPort}<br/>
                  [14:22:05] AUTH: User KILO-1 connected via ZeroTier<br/>
                  [14:22:12] WARN: Encryption handshake latency &gt; 50ms<br/>
                  [14:23:00] INFO: Periodic database optimization complete<br/>
                  <span className="cursor-blink">_</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Advanced Settings Overlay */}
      <AnimatePresence>
        {showConfig && (
          <motion.div className="settings-panel" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
            <div className="settings-header">
              <div className="title">COMMANDER CONFIGURATION</div>
              <X size={24} onClick={() => setShowConfig(false)} style={{ cursor: 'pointer' }} />
            </div>
            
            <div className="settings-scroll">
              <div className="config-section">
                <div className="section-label">NETWORK INTERFACES</div>
                <div className="input-group">
                  <label>PRIMARY HOST IP (LAN)</label>
                  <input type="text" value={config.primaryIp} onChange={e => setConfig({...config, primaryIp: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>SECONDARY HOST IP (WAN)</label>
                  <input type="text" value={config.secondaryIp} onChange={e => setConfig({...config, secondaryIp: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>ZEROTIER NETWORK ID</label>
                  <input type="text" value={config.ztId} onChange={e => setConfig({...config, ztId: e.target.value})} />
                </div>
              </div>

              <div className="config-section">
                <div className="section-label">TAK SERVER PARAMETERS</div>
                <div className="grid-2">
                  <div className="input-group">
                    <label>API PORT</label>
                    <input type="text" value={config.apiPort} onChange={e => setConfig({...config, apiPort: e.target.value})} />
                  </div>
                  <div className="input-group">
                    <label>SSH PORT</label>
                    <input type="text" value={config.sshPort} onChange={e => setConfig({...config, sshPort: e.target.value})} />
                  </div>
                </div>
                <div className="input-group">
                  <label>FTS MASTER API KEY</label>
                  <input type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} />
                </div>
              </div>

              <div className="config-section">
                <div className="section-label">OPERATIONAL PARAMETERS</div>
                <div className="input-group">
                  <label>HQ CALLSIGN</label>
                  <input type="text" value={config.callsign} onChange={e => setConfig({...config, callsign: e.target.value})} />
                </div>
              </div>

              <button className="save-btn" onClick={() => {
                localStorage.setItem('tak_c2_v3_config', JSON.stringify(config));
                setShowConfig(false);
              }}>
                <Save size={18} /> APPLY COMMAND PARAMETERS
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
