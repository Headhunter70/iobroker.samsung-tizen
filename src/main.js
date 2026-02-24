'use strict';

const utils = require('@iobroker/adapter-core');
const SamsungTizen = require('./samsung-tizen');

class SamsungTizenAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'samsung-tizen' });
        this.tv = null;
        this.pollTimer = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Samsung Tizen Adapter gestartet');
        await this.createStates();

        const { ip, mac, port, name, token, pollInterval } = this.config;

        if (!ip) {
            this.log.error('Keine TV IP-Adresse konfiguriert!');
            return;
        }

        this.tv = new SamsungTizen({
            ip,
            mac,
            port: port || 8001,
            name: name || 'ioBroker',
            token,
            logger: this.log,
            onToken: async (t) => {
                this.log.info(`Neues Token gespeichert: ${t}`);
                const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                if (obj) {
                    obj.native.token = t;
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                }
            }
        });

        await this.subscribeStatesAsync('*');
        this.startPolling(pollInterval || 5000);
    }

    async createStates() {
        const statesDef = [
            // Power
            ['power',        { name: 'Power', type: 'boolean', role: 'switch.power', read: true, write: true }],
            // Lautstärke
            ['volume',       { name: 'Lautstärke', type: 'number', role: 'level.volume', min: 0, max: 100, read: true, write: true }],
            ['mute',         { name: 'Stummschalten', type: 'boolean', role: 'media.mute', read: true, write: true }],
            // Kanal
            ['channel',      { name: 'Kanal', type: 'number', role: 'media.channel', read: true, write: true }],
            // Apps
            ['launchApp',    { name: 'App starten (App-ID)', type: 'string', role: 'media.input', read: false, write: true }],
            ['currentApp',   { name: 'Aktuelle App', type: 'string', role: 'media.input', read: true, write: false }],
            // Keys
            ['sendKey',      { name: 'Taste senden (z.B. KEY_HOME)', type: 'string', role: 'button', read: false, write: true }],
            // Info
            ['info.connected', { name: 'Verbunden', type: 'boolean', role: 'indicator.connected', read: true, write: false }],
            ['info.modelName', { name: 'Modell', type: 'string', role: 'info.name', read: true, write: false }],
            ['info.tvName',    { name: 'TV Name', type: 'string', role: 'info.name', read: true, write: false }],
            ['info.os',        { name: 'Betriebssystem', type: 'string', role: 'info.hardware', read: true, write: false }],
        ];

        for (const [id, common] of statesDef) {
            await this.setObjectNotExistsAsync(id, { type: 'state', common, native: {} });
        }

        // Direkttasten als Buttons
        const keys = [
            'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER',
            'KEY_RETURN', 'KEY_HOME', 'KEY_MENU', 'KEY_SOURCE',
            'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE',
            'KEY_CHUP', 'KEY_CHDOWN',
            'KEY_PLAY', 'KEY_PAUSE', 'KEY_STOP', 'KEY_FF', 'KEY_REWIND',
            'KEY_RED', 'KEY_GREEN', 'KEY_YELLOW', 'KEY_BLUE',
            'KEY_0', 'KEY_1', 'KEY_2', 'KEY_3', 'KEY_4',
            'KEY_5', 'KEY_6', 'KEY_7', 'KEY_8', 'KEY_9'
        ];
        for (const key of keys) {
            await this.setObjectNotExistsAsync(`keys.${key}`, {
                type: 'state',
                common: { name: key, type: 'boolean', role: 'button', read: false, write: true },
                native: {}
            });
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        if (!this.tv) return;

        const dp = id.replace(`${this.namespace}.`, '');
        this.log.debug(`State geändert: ${dp} = ${state.val}`);

        try {
            if (dp === 'power') {
                if (state.val) {
                    await this.tv.powerOn();
                } else {
                    await this.tv.sendKey('KEY_POWER');
                }
            } else if (dp === 'volume') {
                await this.tv.setVolume(Number(state.val));
            } else if (dp === 'mute') {
                await this.tv.sendKey('KEY_MUTE');
            } else if (dp === 'channel') {
                await this.tv.setChannel(Number(state.val));
            } else if (dp === 'launchApp') {
                await this.tv.launchApp(String(state.val));
            } else if (dp === 'sendKey') {
                await this.tv.sendKey(String(state.val));
            } else if (dp.startsWith('keys.')) {
                const key = dp.replace('keys.', '');
                await this.tv.sendKey(key);
            }
        } catch (err) {
            this.log.error(`Fehler bei State ${dp}: ${err.message}`);
        }
    }

    startPolling(interval) {
        this.pollTimer = this.setInterval(async () => {
            if (!this.tv) return;
            try {
                const info = await this.tv.getDeviceInfo();
                if (info) {
                    await this.setStateAsync('info.connected', true, true);
                    await this.setStateAsync('power', true, true);
                    await this.setStateAsync('info.modelName', info.ModelName || '', true);
                    await this.setStateAsync('info.tvName', info.FriendlyName || '', true);
                    await this.setStateAsync('info.os', info.OS || '', true);
                } else {
                    await this.setStateAsync('info.connected', false, true);
                    await this.setStateAsync('power', false, true);
                }
            } catch {
                await this.setStateAsync('info.connected', false, true);
                await this.setStateAsync('power', false, true);
            }
        }, interval);
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) this.clearInterval(this.pollTimer);
            if (this.tv) this.tv.disconnect();
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new SamsungTizenAdapter(options);
} else {
    new SamsungTizenAdapter();
}
