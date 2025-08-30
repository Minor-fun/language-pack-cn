'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getFileHash(filePath) { try { if (fs.existsSync(filePath)) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); } } catch (e) {} return null; }

module.exports = function LanguageSwitcher(mod) {
    // --- [国际化核心] ---
    const language = mod.settings.language || 'en';
    let STRINGS;
    try {
        STRINGS = require(`./locales/${language}.json`);
    } catch (e) {
        mod.error(`Failed to load language file for '${language}'. Falling back to 'en'.`);
        STRINGS = require('./locales/en.json');
    }

    function format(str, ...args) {
        if (!str) return '';
        let i = 0;
        return str.replace(/%s/g, () => args[i++]);
    }

    function t(key, ...args) {
        const template = STRINGS[key];
        if (!template) return key;
        return format(template, ...args);
    }
    
    if (!mod.clientInterface) return mod.error(t('err_client_interface'));
    const gameRoot = findGameRoot();
    if (!gameRoot) return mod.error(t('err_game_root'));

    const LANGUAGES = {
        'en': { 
            descriptionKey: 'lang_desc_en', 
            files: {} 
        },
        'cn': {
            descriptionKey: 'lang_desc_cn',
            files: {
                dataCenter: { source: 'DataCenter_Final_CN.dat', target: path.join('S1Game', 'S1Data', 'DataCenter_Final_EUR.dat') },
                gfxUI: { source: 'GFxUI.eur', target: path.join('S1Game', 'Localization', 'EUR', 'GFxUI.eur') },
                fonts: { source: 'fonts_tw.gpk', target: path.join('S1Game', 'CookedPC', 'Art_Data', 'Packages', 'S1UI', 'fonts_tw.gpk'), noBackup: true }
            }
        },
        'rus': {
            descriptionKey: 'lang_desc_rus',
            files: {
                dataCenter: { source: 'DataCenter_Final_RUS.dat', target: path.join('S1Game', 'S1Data', 'DataCenter_Final_EUR.dat') }
            }
        }
    };

    // --- [核心命令处理 - 已修复] ---
    mod.command.add('lang', (lang) => {
        lang = (lang || '').toLowerCase();
        if (LANGUAGES[lang]) {
            // 步骤 1: 切换游戏文件 (这个函数会更新 currentLanguage)
            syncFiles(lang);
            
            // 步骤 2: 同时更新脚本的界面语言设置
            if (mod.settings.language !== lang) {
                mod.settings.language = lang;
                mod.saveSettings();
                const newLangDesc = t(LANGUAGES[lang].descriptionKey);
                mod.command.message(t('ui_lang_changed_notice', newLangDesc));
            }
        } else {
            // 帮助信息逻辑
            let helpMsg = t('help_header') + '\n';
            Object.keys(LANGUAGES).forEach(key => helpMsg += t('help_line', key, t(LANGUAGES[key].descriptionKey)) + '\n');
            const currentDesc = t(LANGUAGES[mod.settings.currentLanguage]?.descriptionKey || 'lang_desc_unknown');
            helpMsg += t('help_footer', currentDesc);
            mod.command.message(helpMsg);
        }
    });

    // --- [核心工作流与辅助函数] ---
    function syncFiles(targetLang) {
        if (!LANGUAGES[targetLang]) { handleError(new Error(t('err_lang_not_defined', targetLang))); return; }
        mod.command.message(t('switch_start', t(LANGUAGES[targetLang].descriptionKey)));
        try {
            checkAndUpdateBackups();
            restoreAllKnownBackups();
            
            let newAppliedPluginHash = null;
            if (targetLang !== 'en') {
                const langConfig = LANGUAGES[targetLang];
                const dataCenterInfo = langConfig.files.dataCenter;
                if (dataCenterInfo) newAppliedPluginHash = getFileHash(path.join(__dirname, dataCenterInfo.source));

                for (const fileInfo of Object.values(langConfig.files)) {
                    const sourcePath = path.join(__dirname, fileInfo.source);
                    const targetPath = path.join(gameRoot, fileInfo.target);
                    applyPatch(sourcePath, targetPath);
                }
            }
            
            mod.settings.currentLanguage = targetLang;
            mod.settings.lastAppliedPluginHash = newAppliedPluginHash;
            mod.saveSettings();
            mod.command.message(t('switch_complete'));
        } catch (e) { handleError(e, t('err_switch_failed')); }
    }
    
    function checkAndUpdateBackups() {
        let settingsChanged = false;
        getAllKnownFiles().forEach(fileInfo => {
            if (fileInfo.noBackup) return;
            const targetPath = path.join(gameRoot, fileInfo.target);
            const backupPath = targetPath + '.backup';
            const fileKey = fileInfo.key;
            if (!fs.existsSync(targetPath)) return;
            const targetHash = getFileHash(targetPath);

            if (!fs.existsSync(backupPath)) {
                mod.command.message(t('backup_creating', path.basename(targetPath)));
                fs.copyFileSync(targetPath, backupPath);
                mod.settings.originalBackupHashes[fileKey] = targetHash;
                settingsChanged = true;
                return;
            }

            const originalHash = mod.settings.originalBackupHashes[fileKey];
            const isKnownPatch = Object.values(LANGUAGES).some(lang => {
                const patchFile = lang.files[fileKey];
                return patchFile && getFileHash(path.join(__dirname, patchFile.source)) === targetHash;
            });
            
            if (!isKnownPatch && targetHash !== originalHash) {
                mod.command.message(t('game_file_updated_backup', path.basename(targetPath)));
                fs.unlinkSync(backupPath);
                fs.copyFileSync(targetPath, backupPath);
                mod.settings.originalBackupHashes[fileKey] = targetHash;
                settingsChanged = true;
            }
        });
        if (settingsChanged) mod.saveSettings();
    }

    function applyPatch(source, target) {
        if (!fs.existsSync(source)) { mod.warn(`Source file not found: ${path.basename(source)}`); return; }
        if (getFileHash(source) !== getFileHash(target)) fs.copyFileSync(source, target);
    }

    function restoreAllKnownBackups() {
        getAllKnownFiles().forEach(fileInfo => {
            if (fileInfo.noBackup) return;
            const targetPath = path.join(gameRoot, fileInfo.target);
            const backupPath = targetPath + '.backup';
            if (fs.existsSync(backupPath) && getFileHash(backupPath) !== getFileHash(targetPath)) {
                fs.copyFileSync(backupPath, targetPath);
                mod.log(`Restored from backup: ${path.basename(targetPath)}`);
            }
        });
    }
    
    function getAllKnownFiles() { const allKnownFiles = new Map(); Object.values(LANGUAGES).forEach(langConfig => { Object.entries(langConfig.files).forEach(([key, fileInfo]) => { if (!allKnownFiles.has(key)) { fileInfo.key = key; allKnownFiles.set(key, fileInfo); } }); }); return allKnownFiles; }
    function getSystemStatus() { const currentLang = mod.settings.currentLanguage || 'en'; const langConfig = LANGUAGES[currentLang]; if (!langConfig) return { status: 'ERROR_UNKNOWN_LANG' }; if (currentLang === 'en') { const eurDat = path.join(gameRoot, 'S1Game', 'S1Data', 'DataCenter_Final_EUR.dat'); if (fs.existsSync(eurDat + '.backup') && getFileHash(eurDat) === getFileHash(eurDat + '.backup')) return { status: 'OK_ENGLISH' }; return { status: 'OK_ENGLISH_NO_BACKUP' }; } const dataCenterInfo = langConfig.files.dataCenter; if (!dataCenterInfo) return { status: 'OK_UNKNOWN' }; const sourcePath = path.join(__dirname, dataCenterInfo.source); const targetPath = path.join(gameRoot, dataCenterInfo.target); const backupPath = targetPath + '.backup'; const sourceHash = getFileHash(sourcePath); const targetHash = getFileHash(targetPath); const backupHash = getFileHash(backupPath); const lastAppliedHash = mod.settings.lastAppliedPluginHash; if (!sourceHash) return { status: 'ERROR_NO_SOURCE' }; if (targetHash === sourceHash) return { status: 'OK_TRANSLATED_LATEST' }; if (targetHash === lastAppliedHash) return { status: 'WARN_TRANSLATION_UPDATED' }; if (backupHash && targetHash !== backupHash) return { status: 'WARN_GAME_UPDATED' }; if (targetHash === backupHash) return { status: 'ERROR_MISMATCH_EN' }; return { status: 'ERROR_UNKNOWN_STATE' }; }
    function showStatusMessage() { const { status } = getSystemStatus(); let msg = ''; const currentLang = mod.settings.currentLanguage || 'en'; switch (status) { case 'OK_ENGLISH': case 'OK_ENGLISH_NO_BACKUP': msg = t('status_ok_english'); break; case 'OK_TRANSLATED_LATEST': msg = t('status_ok_translated'); break; case 'WARN_TRANSLATION_UPDATED': msg = t('status_warn_translation_updated', currentLang); break; case 'WARN_GAME_UPDATED': msg = t('status_warn_game_updated', currentLang); break; case 'ERROR_MISMATCH_EN': msg = t('status_error_mismatch', currentLang, currentLang); break; default: msg = t('status_error_unknown'); break; } if (msg) mod.command.message(msg); }
    
    let hasShownStatus = false;
    mod.hook('S_SPAWN_ME', 3, () => { if (hasShownStatus) return; hasShownStatus = true; mod.setTimeout(showStatusMessage, 5000); });

    function findGameRoot() { let searchPath = path.dirname(mod.clientInterface.info.path); for (let i = 0; i < 5; i++) { if (fs.existsSync(path.join(searchPath, 'S1Game'))) return searchPath; searchPath = path.join(searchPath, '..'); } return null; }
    function handleError(e, m) { mod.command.message(`<font color="#FF0000">${m || t('err_unknown')} See toolbox log for details.</font>`); mod.error(e); }
};