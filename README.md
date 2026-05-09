# ⚡ TAK Command & Control (C2) Dashboard

![Elite Tactical Dashboard](https://img.shields.io/badge/Status-Operational-00ffcc?style=for-the-badge&logo=target)
![Milspec Standard](https://img.shields.io/badge/Design-Modern_Milspec-4b5320?style=for-the-badge)
![Encryption](https://img.shields.io/badge/Security-AES--256--GCM-blue?style=for-the-badge)

**TAK C2 Command Center** is a high-performance, professional management interface designed for controlling TAK servers and coordinating field units (ATAK, WinTAK, ITAK). It provides a centralized "Commander's View" of server health, tactical unit status, and remote operational controls.

---

## 🛠 Strategic Features

### 🖥️ Mission Dashboard
- **Real-Time Telemetry**: Monitor CPU load, RAM allocation, and network latency with high-precision instruments.
- **Situational Awareness**: Integrated geospatial map overlay for tracking field operative positions and mission markers.
- **Unit Management**: View active TAK units, connection types (LAN/WAN), and individual telemetry.

### 🔐 Advanced Operational Security
- **Dual IP Profile**: Instant switching between Primary (LAN) and Secondary (ZeroTier/WAN) network interfaces.
- **Secure Tunneling**: Native support for SSH management and API-encrypted communication.
- **Stealth Mode**: Low-luminance UI filter for night operations and light discipline.
- **NVG Optimization**: Full red-spectrum Night Vision mode to preserve operator optics.

### 🕹️ Remote Command Suite
- **Service Control**: Restart FreeTAKServer (FTS) services remotely.
- **Power Management**: Authorized remote shutdown and reboot sequences.
- **Log Console**: Real-time access to kernel logs for immediate troubleshooting.

---

## 🚀 Deployment & Setup

### Requirements
- **Node.js** (LTS)
- **Capacitor CLI** (for mobile export)
- **FreeTAKServer** (Compatible with v1.9+)

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/N1ghtGu4rd/C2_Server.git
   cd C2_Server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Launch in Dev Mode:**
   ```bash
   npm run dev
   ```

### 📱 Android APK Compilation
To generate the tactical mobile application:
1. Build the web assets: `npm run build`
2. Sync with Capacitor: `npx cap copy`
3. Open in Android Studio: `npx cap open android`
4. Build > Build Bundle(s) / APK(s) > Build APK(s)

---

## 📡 Configuration Parameters

Access the **Commander Configuration** panel (Gear Icon) to define operational parameters:
- **Primary IP**: Local network address of the TAK Server.
- **Secondary IP**: ZeroTier or public WAN address.
- **API/SSH Ports**: Customize based on your server hardening.
- **Master API Key**: Required for administrative commands.

---

## ⚖️ Legal & Security
*This software is designed for professional tactical communication and situational awareness. Ensure all deployments comply with local encryption and network security regulations.*

**Developed for elite operators. Command with precision.**
