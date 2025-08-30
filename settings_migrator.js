'use strict';

const DefaultSettings = {
	"language": "en",
    "currentLanguage": "en",
    "lastAppliedPluginHash": "",
	"originalBackupHashes": {} 
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined) {
        return Object.assign({}, DefaultSettings, settings);
    } else if (from_ver === null) {
        return DefaultSettings;
    } else {
        // 合并新旧设置
        settings = Object.assign({}, DefaultSettings, settings);
        
        // 清理掉旧代码中不再需要的字段
        delete settings.gameDataCenterHash;
        
        return settings;
    }
};