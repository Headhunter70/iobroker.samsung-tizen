'use strict';

const utils = require('@iobroker/adapter-core');
const SamsungTV = require('./lib/samsung-tv');
const wol = require('wol');

class SamsungTizen extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'samsung-tizen' });

        this.tv = null;
        this.pollInterval = null;
        this.reconnectTimeout = null;
        this.isConnected = false;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Samsung Tizen Adapter gestartet');

        await this.createObjects();
        await this.setState('info.connection', false, true);

        this.tv = new SamsungTV({
            host: this.config.host,
            port: this.config.port || 8002,
            name: this.config.appName || 'ioBroker',
            token: this.config.token || '',
            log: this.log,
            onToken: async (token) => {
                this.log.info(`Neuer Token erhalten: ${token}`);
                // Token im Adapter-Config speichern
                const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                if (obj) {
                    obj.native.token = token;
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                }
            },
            onConnected: async () => {
                this.log.info('TV verbunden');
                this.isConnected = true;
                await this.setState('info.connection', true, true);
                await this.setState('device.power', true, true);
            },
            onDisconnected: async () => {
                this.log.info('TV getrennt');
                this.isConnected = false;
                await this.setState('info.connection', false, true);
                await this.setState('device.power', false, true);
                this.scheduleReconnect();
            },
            onError: (err) => {
                this.log.warn(`TV Fehler: ${err.message}`);
            }
        });

        await this.connect();
        this.startPolling();
        this.subscribeStates('*');
    }

    async connect() {
        try {
            await this.tv.connect();
        } catch (e) {
            this.log.warn(`Verbindung fehlgeschlagen: ${e.message}`);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        const delay = (this.config.reconnectInterval || 30) * 1000;
        this.reconnectTimeout = setTimeout(() => {
            this.log.info('Versuche TV neu zu verbinden...');
            this.connect();
        }, delay);
    }

    startPolling() {
        const interval = (this.config.pollInterval || 60) * 1000;
        this.pollInterval = setInterval(async () => {
            await this.pollTVStatus();
        }, interval);
    }

    async pollTVStatus() {
        try {
            const info = await this.tv.getDeviceInfo();
            if (info) {
                await this.setState('device.name', info.device?.name || '', true);
                await this.setState('device.modelName', info.device?.modelName || '', true);
                await this.setState('device.wifiMac', info.device?.wifiMac || '', true);
            }
        } catch (e) {
            // TV möglicherweise aus
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const dp = id.replace(`${this.namespace}.`, '');
        this.log.debug(`State Change: ${dp} = ${state.val}`);

        try {
            switch (dp) {
                case 'device.power':
                    if (state.val) {
                        await this.powerOn();
                    } else {
                        await this.tv.sendKey('KEY_POWER');
                    }
                    break;

                case 'control.volume':
                    await this.setVolume(state.val);
                    break;

                case 'control.mute':
                    await this.tv.sendKey('KEY_MUTE');
                    await this.setState('control.mute', state.val, true);
                    break;

                case 'control.channel':
                    await this.setChannel(state.val);
                    break;

                case 'control.key':
                    if (state.val) {
                        await this.tv.sendKey(state.val);
                        await this.setState('control.key', state.val, true);
                    }
                    break;

                case 'control.app':
                    if (state.val) {
                        await this.tv.launchApp(state.val);
                        await this.setState('control.app', state.val, true);
                    }
                    break;

                case 'control.url':
                    if (state.val) {
                        await this.tv.openURL(state.val);
                    }
                    break;

                // Direkttasten
                case 'remote.volUp':
                    if (state.val) await this.tv.sendKey('KEY_VOLUP');
                    break;
                case 'remote.volDown':
                    if (state.val) await this.tv.sendKey('KEY_VOLDOWN');
                    break;
                case 'remote.chUp':
                    if (state.val) await this.tv.sendKey('KEY_CHUP');
                    break;
                case 'remote.chDown':
                    if (state.val) await this.tv.sendKey('KEY_CHDOWN');
                    break;
                case 'remote.up':
                    if (state.val) await this.tv.sendKey('KEY_UP');
                    break;
                case 'remote.down':
                    if (state.val) await this.tv.sendKey('KEY_DOWN');
                    break;
                case 'remote.left':
                    if (state.val) await this.tv.sendKey('KEY_LEFT');
                    break;
                case 'remote.right':
                    if (state.val) await this.tv.sendKey('KEY_RIGHT');
                    break;
                case 'remote.enter':
                    if (state.val) await this.tv.sendKey('KEY_ENTER');
                    break;
                case 'remote.back':
                    if (state.val) await this.tv.sendKey('KEY_RETURN');
                    break;
                case 'remote.home':
                    if (state.val) await this.tv.sendKey('KEY_HOME');
                    break;
                case 'remote.menu':
                    if (state.val) await this.tv.sendKey('KEY_MENU');
                    break;
                case 'remote.playPause':
                    if (state.val) await this.tv.sendKey('KEY_PLAY');
                    break;
                case 'remote.stop':
                    if (state.val) await this.tv.sendKey('KEY_STOP');
                    break;
                case 'remote.source':
                    if (state.val) await this.tv.sendKey('KEY_SOURCE');
                    break;
            }
        } catch (e) {
            this.log.error(`Fehler bei State ${dp}: ${e.message}`);
        }
    }

    async powerOn() {
        if (!this.config.macAddress) {
            this.log.warn('Keine MAC-Adresse konfiguriert für WakeOnLAN');
            return;
        }
        return new Promise((resolve, reject) => {
            wol.wake(this.config.macAddress, { address: this.config.host }, (err) => {
                if (err) {
                    this.log.error(`WOL Fehler: ${err}`);
                    reject(err);
                } else {
                    this.log.info('WakeOnLAN Paket gesendet');
                    resolve();
                }
            });
        });
    }

    async setVolume(volume) {
        volume = Math.max(0, Math.min(100, parseInt(volume)));
        const current = await this.getStateAsync('control.volume');
        const currentVal = current ? parseInt(current.val) : 0;
        const diff = volume - currentVal;
        const key = diff > 0 ? 'KEY_VOLUP' : 'KEY_VOLDOWN';
        for (let i = 0; i < Math.abs(diff); i++) {
            await this.tv.sendKey(key);
            await new Promise(r => setTimeout(r, 100));
        }
        await this.setState('control.volume', volume, true);
    }

    async setChannel(channel) {
        const ch = String(channel);
        for (const digit of ch) {
            await this.tv.sendKey(`KEY_${digit}`);
            await new Promise(r => setTimeout(r, 300));
        }
        await this.tv.sendKey('KEY_ENTER');
        await this.setState('control.channel', channel, true);
    }

    async createObjects() {
        const objects = {
            // Info
            'info.connection': { type: 'state', common: { name: 'Verbindung', type: 'boolean', role: 'indicator.connected', read: true, write: false } },

            // Device
            'device.power': { type: 'state', common: { name: 'TV Ein/Aus', type: 'boolean', role: 'switch.power', read: true, write: true, def: false } },
            'device.name': { type: 'state', common: { name: 'Gerätename', type: 'string', role: 'info.name', read: true, write: false, def: '' } },
            'device.modelName': { type: 'state', common: { name: 'Modell', type: 'string', role: 'info.model', read: true, write: false, def: '' } },
            'device.wifiMac': { type: 'state', common: { name: 'WiFi MAC', type: 'string', role: 'info.mac', read: true, write: false, def: '' } },

            // Control
            'control.volume': { type: 'state', common: { name: 'Lautstärke', type: 'number', role: 'level.volume', read: true, write: true, min: 0, max: 100, def: 0, unit: '%' } },
            'control.mute': { type: 'state', common: { name: 'Stummschalten', type: 'boolean', role: 'media.mute', read: true, write: true, def: false } },
            'control.channel': { type: 'state', common: { name: 'Kanal', type: 'number', role: 'media.channel', read: true, write: true, def: 1 } },
            'control.key': { type: 'state', common: { name: 'Taste senden', type: 'string', role: 'text', read: true, write: true, def: '' } },
            'control.app': { type: 'state', common: { name: 'App starten (App-ID)', type: 'string', role: 'text', read: true, write: true, def: '' } },
            'control.url': { type: 'state', common: { name: 'URL öffnen', type: 'string', role: 'text', read: true, write: true, def: '' } },

            // Remote Buttons
            'remote.volUp': { type: 'state', common: { name: 'Lautstärke +', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.volDown': { type: 'state', common: { name: 'Lautstärke -', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.chUp': { type: 'state', common: { name: 'Kanal +', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.chDown': { type: 'state', common: { name: 'Kanal -', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.up': { type: 'state', common: { name: 'Pfeil Hoch', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.down': { type: 'state', common: { name: 'Pfeil Runter', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.left': { type: 'state', common: { name: 'Pfeil Links', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.right': { type: 'state', common: { name: 'Pfeil Rechts', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.enter': { type: 'state', common: { name: 'OK / Enter', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.back': { type: 'state', common: { name: 'Zurück', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.home': { type: 'state', common: { name: 'Home', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.menu': { type: 'state', common: { name: 'Menü', type: 'boolean', role: 'button', read: false, write: true, def: false } },
            'remote.playPause': { type: 'state', common: { name: 'Play/Pause', type: 'boolean', role: 'button.play', read: false, write: true, def: false } },
            'remote.stop': { type: 'state', common: { name: 'Stop', type: 'boolean', role: 'button.stop', read: false, write: true, def: false } },
            'remote.source': { type: 'state', common: { name: 'Eingangsquelle', type: 'boolean', role: 'button', read: false, write: true, def: false } },
        };

        for (const [id, obj] of Object.entries(objects)) {
            await this.setObjectNotExistsAsync(id, {
                type: obj.type,
                common: obj.common,
                native: {}
            });
        }
    }

    onUnload(callback) {
        try {
            if (this.pollInterval) clearInterval(this.pollInterval);
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            if (this.tv) this.tv.disconnect();
        } catch (e) {
            // ignore
        }
        callback();
    }
}

if (require.main !== module) {
    module.exports = (options) => new SamsungTizen(options);
} else {
    new SamsungTizen();
}
