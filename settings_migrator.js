'use strict';

const DefaultSettings = {
    "currentLanguage": "en",
    "gameDataCenterHash": "",
    "lastAppliedPluginHash": ""
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined) {
        return Object.assign({}, DefaultSettings, settings);
    } else if (from_ver === null) {
        return DefaultSettings;
    } else {
        if (from_ver + 1 < to_ver) {
            settings = MigrateSettings(from_ver, from_ver + 1, settings);
            return MigrateSettings(from_ver + 1, to_ver, settings);
        }
        
        settings = Object.assign({}, DefaultSettings, settings);

        return settings;
    }
};