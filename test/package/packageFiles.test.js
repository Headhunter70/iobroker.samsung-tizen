'use strict';

const { tests } = require('@iobroker/testing');

// Führe automatische Adapter-Paket-Tests durch
tests.packageFiles(path.join(__dirname, '../..'), {
    // optional: Liste der erlaubten zusätzlichen Dateien
    allowedFiles: []
});
