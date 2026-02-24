# ioBroker Samsung Tizen TV Adapter

[![CI](https://github.com/YOUR_GITHUB/ioBroker.samsung-tizen/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_GITHUB/ioBroker.samsung-tizen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Steuere deinen **Samsung Tizen Smart TV** (ab 2016) direkt aus ioBroker – via WebSocket API, WakeOnLAN und REST.

---

## Funktionen

- **Power** – TV ein/ausschalten (WakeOnLAN + Soft-Off)  
- **Lautstärke & Mute** – setzen und stummschalten  
- **Kanal** – direkt wechseln  
- **Apps** – Netflix, YouTube, ARD etc. starten  
- **Tasten** – alle Fernbedienungstasten senden  
- **TV-Info** – Modell, Name, Status auslesen

---

## Voraussetzungen

- Samsung Tizen TV (ab 2016)
- TV und ioBroker im gleichen Netzwerk
- Port 8001 im TV erreichbar (keine Firewall dazwischen)
- Für WakeOnLAN: TV-Einstellung "Netzwerk-Standby" aktivieren

---

## Installation

```bash
cd /opt/iobroker
npm install iobroker.samsung-tizen
iobroker add samsung-tizen
```

Oder über Admin UI → "Aus eigener URL installieren" → GitHub-URL eingeben.

---

## Konfiguration

| Parameter | Beschreibung | Beispiel |
|---|---|---|
| IP-Adresse | Lokale IP des TVs | `192.168.1.100` |
| MAC-Adresse | Für WakeOnLAN (optional) | `AA:BB:CC:DD:EE:FF` |
| Port | WebSocket-Port | `8001` |
| Gerätename | Name am TV | `ioBroker` |
| Abfrageintervall | Status-Check (ms) | `5000` |

**Ersten Start:** Am TV erscheint eine Verbindungsanfrage → "Zulassen" drücken. Das Token wird automatisch gespeichert.

---

## Datenpunkte

### Steuerung (write)

| Datenpunkt | Typ | Beschreibung |
|---|---|---|
| `power` | boolean | TV ein/aus |
| `volume` | number 0–100 | Lautstärke |
| `mute` | boolean | Mute umschalten |
| `channel` | number | Kanal wechseln |
| `launchApp` | string | App-ID starten |
| `sendKey` | string | Taste senden |
| `keys.KEY_*` | button | Direkttasten |

### Status (read)

| Datenpunkt | Typ | Beschreibung |
|---|---|---|
| `info.connected` | boolean | Verbunden? |
| `info.modelName` | string | Modell |
| `info.tvName` | string | TV-Name |
| `info.os` | string | Tizen OS |

---

## Tasten-Referenz

```
Navigation:  KEY_UP  KEY_DOWN  KEY_LEFT  KEY_RIGHT  KEY_ENTER  KEY_RETURN
Menü:        KEY_HOME  KEY_MENU  KEY_SOURCE
Lautstärke:  KEY_VOLUP  KEY_VOLDOWN  KEY_MUTE
Kanal:       KEY_CHUP  KEY_CHDOWN
Ziffern:     KEY_0 – KEY_9
Playback:    KEY_PLAY  KEY_PAUSE  KEY_STOP  KEY_FF  KEY_REWIND
Farbe:       KEY_RED  KEY_GREEN  KEY_YELLOW  KEY_BLUE
```

---

## Bekannte App-IDs

| App | ID |
|---|---|
| Netflix | `11101200001` |
| YouTube | `111299001912` |
| Amazon Prime | `3201910019365` |
| Disney+ | `3201901017640` |
| Spotify | `3201606009684` |
| ARD Mediathek | `3201711012438` |
| ZDF Mediathek | `3201710014866` |

---

## Beispiele

```javascript
// TV einschalten
setState('samsung-tizen.0.power', true);

// Lautstärke auf 20
setState('samsung-tizen.0.volume', 20);

// Netflix starten
setState('samsung-tizen.0.launchApp', '11101200001');

// HOME-Taste drücken
setState('samsung-tizen.0.keys.KEY_HOME', true);

// TV um 23 Uhr automatisch ausschalten
schedule('0 23 * * *', () => {
    setState('samsung-tizen.0.power', false);
});
```

---

## Troubleshooting

**TV nicht erkannt** → Firewall prüfen, Port 8001 muss erreichbar sein  
**WakeOnLAN funktioniert nicht** → "Netzwerk-Standby" im TV aktivieren  
**Unauthorized** → Token löschen, Adapter neu starten, Anfrage am TV bestätigen  

---

## Lizenz

MIT © 2025 Your Name
