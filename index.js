'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- 辅助函数：计算文件哈希 ---
function getFileHash(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        }
    } catch (e) { /* 忽略读取错误，例如权限问题 */ }
    return null;
}

module.exports = function LanguageSwitcher(mod) {
    // --- 路径定义 ---
    if (!mod.clientInterface) return mod.error('Client interface not available.');

    const gameRoot = findGameRoot();
    if (!gameRoot) return mod.error('[语言切换器] 未能自动找到游戏根目录。');

    const sourceFiles = {
        gfxUI: path.join(__dirname, 'GFxUI.eur'),
        dataCenter: path.join(__dirname, 'DataCenter_Final_EUR.dat'),
        fonts: path.join(__dirname, 'fonts_tw.gpk')
    };
    const targetFiles = {
        gfxUI: path.join(gameRoot, 'S1Game', 'Localization', 'EUR', 'GFxUI.eur'),
        dataCenter: path.join(gameRoot, 'S1Game', 'S1Data', 'DataCenter_Final_EUR.dat'),
        fonts: path.join(gameRoot, 'S1Game', 'CookedPC', 'Art_Data', 'Packages', 'S1UI', 'fonts_tw.gpk')
    };
    const backupFiles = {
        gfxUI: targetFiles.gfxUI + '.backup',
        dataCenter: targetFiles.dataCenter + '.backup'
    };

    // --- 核心文件同步函数 ---
    function syncFiles(targetLanguage) {
        mod.command.message(`开始切换至 <font color="#FFFF00">${targetLanguage.toUpperCase()}</font> 模式...`);
        try {
            if (targetLanguage === 'cn') {
                // --- 切换到中文 ---
                updateFile(sourceFiles.gfxUI, targetFiles.gfxUI, backupFiles.gfxUI);
                updateFile(sourceFiles.dataCenter, targetFiles.dataCenter, backupFiles.dataCenter);
                copyIfNeeded(sourceFiles.fonts, targetFiles.fonts);
            } else { // 'en'
                // --- 切换回英文 (只恢复DAT) ---
                restoreFile(targetFiles.dataCenter, backupFiles.dataCenter);
                mod.log('[语言切换器] UI和字体文件已保留为中文。');
            }
            mod.command.message(`<font color="#00FF00">切换完成！</font> 部分更改可能需要重启游戏才能完全生效。`);
        } catch (e) {
            handleError(e, "切换失败！");
        }
    }

    // --- 文件操作辅助函数 ---

    function updateFile(source, target, backup) {
        const sourceHash = getFileHash(source);
        if (!sourceHash) {
            mod.warn(`[语言切换器] 找不到源文件: ${path.basename(source)}`);
            return;
        }

        const targetHash = getFileHash(target);
        if (sourceHash === targetHash) {
            mod.log(`[语言切换器] 文件已是最新中文版，跳过: ${path.basename(target)}`);
            return;
        }

        // 备份逻辑
        if (fs.existsSync(backup)) {
            const backupHash = getFileHash(backup);
            if (targetHash && targetHash !== backupHash) {
                fs.unlinkSync(backup);
                mod.log(`[语言切换器] 检测到新版游戏文件，已移除过时的备份。`);
                fs.renameSync(target, backup);
                mod.log(`[语言切换器] 已为新版游戏文件创建备份: ${path.basename(backup)}`);
            }
        } else if (fs.existsSync(target)) {
            fs.renameSync(target, backup);
            mod.log(`[语言切换器] 文件已备份: ${path.basename(backup)}`);
        }
        
        fs.copyFileSync(source, target);
        mod.log(`[语言切换器] 文件已更新为中文版: ${path.basename(target)}`);
    }

    function copyIfNeeded(source, target) {
        const sourceHash = getFileHash(source);
        if (!sourceHash) {
            mod.warn(`[语言切换器] 找不到源文件: ${path.basename(source)}`);
            return;
        }
        
        if (sourceHash !== getFileHash(target)) {
            fs.copyFileSync(source, target);
            mod.log(`[语言切换器] 文件已复制: ${path.basename(target)}`);
        } else {
            mod.log(`[语言切换器] 文件已是最新，跳过: ${path.basename(target)}`);
        }
    }
    
    function restoreFile(target, backup) {
        if (fs.existsSync(backup)) {
            const backupHash = getFileHash(backup);
            if (backupHash !== getFileHash(target)) {
                if (fs.existsSync(target)) fs.unlinkSync(target);
                fs.renameSync(backup, target);
                mod.log(`[语言切换器] 文件已从备份恢复: ${path.basename(target)}`);
            } else {
                fs.unlinkSync(backup);
                mod.log(`[语言切换器] 目标已是英文版，移除冗余备份: ${path.basename(backup)}`);
            }
        }
    }

    function findGameRoot() {
        let searchPath = path.dirname(mod.clientInterface.info.path);
        for(let i = 0; i < 5; i++) {
            if (fs.existsSync(path.join(searchPath, 'S1Game'))) return searchPath;
            searchPath = path.join(searchPath, '..');
        }
        return null;
    }

    function handleError(e, m) {
        mod.command.message(`<font color="#FF0000">${m}</font> 详情请查看Toolbox日志。`);
        mod.error(e);
    }

    // --- 命令注册 (立即执行同步) ---
    mod.command.add('lang', (subcommand) => {
        const lang = (subcommand || '').toLowerCase();
        let targetLang = null;

        switch (lang) {
            case 'cn': targetLang = 'cn'; break;
            case 'en': targetLang = 'en'; break;
            default:
                mod.command.message(
                    `语言切换器帮助:\n` +
                    `  <font color="#00FF00">lang cn</font> - 切换到简体中文\n` +
                    `  <font color="#00FF00">lang en</font> - 切换到英文数据 (保留中文UI)\n` +
                    `当前设置的语言是: <font color="#FFFF00">${mod.settings.currentLanguage === 'cn' ? '简体中文' : '英文数据'}</font>`
                );
                return;
        }

        syncFiles(targetLang);

        if (mod.settings.currentLanguage !== targetLang) {
            mod.settings.currentLanguage = targetLang;
            mod.saveSettings();
        }
    });

    // --- 启动信息 ---
    mod.log(`简体中文语言切换器已加载。输入 "lang" 查看帮助。`);
    mod.command.message(`当前语言模式: <font color="#00FF00">${mod.settings.currentLanguage === 'cn' ? '简体中文' : '英文数据'}</font>`);
};