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
    if (!gameRoot) return mod.error('未能自动找到游戏根目录。');

    // 添加标志变量，用于跟踪是否已显示过语言状态
    let hasShownLanguageStatus = false;
    
    const sourceFiles = {
        gfxUI: path.join(__dirname, 'GFxUI.eur'),
        dataCenter: path.join(__dirname, 'DataCenter_Final_CN.dat'),
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

    // --- 检查哈希更新 ---
    function checkHashUpdates(showMessage = true) {
        // 获取当前插件内的DataCenter哈希
        const currentPluginHash = getFileHash(sourceFiles.dataCenter);
        
        // 获取游戏客户端的DataCenter哈希
        const gameFileHash = getFileHash(targetFiles.dataCenter);
        const gameBackupHash = getFileHash(backupFiles.dataCenter);

        // 检查游戏客户端文件是否更新（综合比较游戏文件、备份文件和插件文件的哈希）
        const isGameUpdated = gameFileHash && mod.settings.gameDataCenterHash && 
                              gameFileHash !== mod.settings.gameDataCenterHash && 
                              (!gameBackupHash || gameFileHash !== gameBackupHash) &&
                              (currentPluginHash && gameFileHash !== currentPluginHash);
        
        // 检查插件汉化文件是否有更新（与上次应用的哈希比较）
        const isTranslationUpdated = currentPluginHash && mod.settings.lastAppliedPluginHash && 
                                     currentPluginHash !== mod.settings.lastAppliedPluginHash;

        // 游戏客户端更新处理
        if (isGameUpdated && showMessage) {
            // 不更新配置中的哈希记录，仅提示用户
            
            // 如果当前是中文模式，提示游戏文件已更新
            if (mod.settings.currentLanguage === 'cn') {
                // 检查汉化是否也更新了
                if (isTranslationUpdated || !mod.settings.lastAppliedPluginHash) {
                    mod.command.message('<font color="#FFFF00">检测到游戏客户端文件已更新，且汉化文件也有更新。</font>');
                    mod.command.message('<font color="#FFFF00">请输入 "<font color="#00FF00">lang cn</font>" 应用最新汉化。</font>');
                } else {
                    mod.command.message('<font color="#FFFF00">检测到游戏客户端文件已更新，但汉化文件尚未更新。</font>');
                    mod.command.message('<font color="#FFFF00">如果现在使用 "<font color="#00FF00">lang cn</font>" 更新，可能会导致游戏部分内容显示异常。</font>');
                    mod.command.message('<font color="#FFFF00">建议等待汉化更新后再应用。</font>');
                }
            }
        }
        // 仅汉化更新处理（游戏未更新但汉化更新了）
        else if (isTranslationUpdated && showMessage) {
            mod.command.message('<font color="#FFFF00">检测到汉化文件有更新。</font>');
            mod.command.message('<font color="#FFFF00">请输入 "<font color="#00FF00">lang cn</font>" 应用最新汉化。</font>');
        }
        
        // 返回是否有任何更新
        return isGameUpdated || isTranslationUpdated;
    }

    // --- 显示语言状态 ---
    function showLanguageStatus() {
        // 检查当前状态
        const gameFileHash = getFileHash(targetFiles.dataCenter);
        const backupFileHash = getFileHash(backupFiles.dataCenter);
        const pluginFileHash = getFileHash(sourceFiles.dataCenter);
        
        let statusMessage = '';
        
        if (mod.settings.currentLanguage === 'cn') {
            // 对比游戏文件哈希与插件文件哈希
            if (gameFileHash === pluginFileHash) {
                statusMessage = '<font color="#00FF00">当前使用的是最新的中文翻译。</font>';
            } else if (gameFileHash === mod.settings.lastAppliedPluginHash) {
                // 游戏文件与上次应用的哈希一致，但与当前插件哈希不一致
                statusMessage = '<font color="#FFFF00">当前使用的是旧版中文翻译，有新版本可用。</font>';
            } else if (pluginFileHash && gameFileHash !== pluginFileHash) {
                // 游戏文件与插件文件不一致
                statusMessage = '<font color="#FFFF00">检测到游戏文件已更新，需要重新应用中文翻译。</font>';
            } else {
                statusMessage = '<font color="#FFFF00">当前设置为中文模式，但翻译文件可能未正确应用。</font>';
            }
        } else { // 'en'
            if (backupFileHash && gameFileHash && gameFileHash === backupFileHash) {
                statusMessage = '<font color="#00FF00">当前使用的是原始英文数据。</font>';
            } else {
                statusMessage = '<font color="#00FF00">当前设置为英文数据模式。</font>';
            }
        }
        
        // 使用普通的命令消息显示信息
        mod.command.message(statusMessage);
    }

    // --- 核心文件同步函数---
    function syncFiles(targetLanguage) {
        mod.command.message(`<font color="#FFFF00">开始切换至 ${targetLanguage.toUpperCase()} 模式...</font>`);
        try {
            if (targetLanguage === 'cn') {
                // --- 切换到中文 ---
                // 获取当前哈希值，用于后续比较
                const currentPluginHash = getFileHash(sourceFiles.dataCenter);
                const currentGameHash = getFileHash(targetFiles.dataCenter);

                // 检查游戏文件是否已经是汉化版本
                const isAlreadyTranslated = currentPluginHash && currentGameHash && currentPluginHash === currentGameHash;

                // 更新UI和字体文件
                updateFile(sourceFiles.gfxUI, targetFiles.gfxUI, backupFiles.gfxUI);

                // 只有当游戏文件不是汉化版本时，才进行更新
                if (!isAlreadyTranslated) {
                    updateFile(sourceFiles.dataCenter, targetFiles.dataCenter, backupFiles.dataCenter);
                } else {
                    mod.log('检测到游戏文件已是最新中文版，跳过数据中心文件更新。');
                }

                copyIfNeeded(sourceFiles.fonts, targetFiles.fonts);

                // 记录应用的插件哈希
                if (currentPluginHash) {
                    mod.settings.lastAppliedPluginHash = currentPluginHash;
                }

                // 获取最新的备份文件哈希。
                const updatedBackupHash = getFileHash(backupFiles.dataCenter);

                // 优先使用更新后备份文件的哈希，这代表了最新的英文原版文件
                if (updatedBackupHash) {
                    mod.settings.gameDataCenterHash = updatedBackupHash;
                }
                // 如果没有备份文件（例如首次安装），并且当前游戏文件不是汉化版，
                // 那么就保存切换操作之前的游戏文件哈希（currentGameHash）。
                else if (!isAlreadyTranslated) {
                    mod.settings.gameDataCenterHash = currentGameHash;
                }
                // 因此保持原有的 gameDataCenterHash 不变。

                mod.saveSettings();
            } else { // 'en'
                // --- 切换回英文 (只恢复DAT) ---
                restoreFile(targetFiles.dataCenter, backupFiles.dataCenter);
                mod.log('UI和字体文件已保留为中文。');

                // 更新游戏客户端哈希（恢复后的哈希）
                const gameFileHash = getFileHash(targetFiles.dataCenter);
                if (gameFileHash) {
                    mod.settings.gameDataCenterHash = gameFileHash;
                    mod.saveSettings();
                }
            }
            mod.command.message(`<font color="#00FF00">切换完成！部分更改可能需要重启游戏才能完全生效。</font>`);
        } catch (e) {
            handleError(e, "切换失败！");
        }
    }

    // --- 文件操作辅助函数 ---

    // 统一的文件更新函数
    function updateFile(source, target, backup) {
        const sourceHash = getFileHash(source);
        if (!sourceHash) {
            mod.warn(`找不到源文件: ${path.basename(source)}`);
            return;
        }

        const targetHash = getFileHash(target);
        
        // 简化的哈希比较逻辑：直接比较源文件和目标文件哈希
        if (sourceHash === targetHash) {
            mod.log(`文件已是最新中文版，跳过: ${path.basename(target)}`);
            return;
        }

        // 备份逻辑
        if (fs.existsSync(backup)) {
            const backupHash = getFileHash(backup);
            if (targetHash && targetHash !== backupHash) {
                fs.unlinkSync(backup);
                mod.log(`检测到新版游戏文件，已移除过时的备份。`);
                fs.renameSync(target, backup);
                mod.log(`已为新版游戏文件创建备份: ${path.basename(backup)}`);
            }
        } else if (fs.existsSync(target)) {
            fs.renameSync(target, backup);
            mod.log(`文件已备份: ${path.basename(backup)}`);
        }
        
        // 复制文件
        fs.copyFileSync(source, target);
        mod.log(`文件已更新为中文版: ${path.basename(target)}`);
    }

    function copyIfNeeded(source, target) {
        const sourceHash = getFileHash(source);
        if (!sourceHash) {
            mod.warn(`找不到源文件: ${path.basename(source)}`);
            return;
        }
        
        if (sourceHash !== getFileHash(target)) {
            fs.copyFileSync(source, target);
            mod.log(`文件已复制: ${path.basename(target)}`);
        } else {
            mod.log(`文件已是最新，跳过: ${path.basename(target)}`);
        }
    }
    
    function restoreFile(target, backup) {
        if (fs.existsSync(backup)) {
            const backupHash = getFileHash(backup);
            if (backupHash !== getFileHash(target)) {
                if (fs.existsSync(target)) fs.unlinkSync(target);
                fs.renameSync(backup, target);
                mod.log(`文件已从备份恢复: ${path.basename(target)}`);
            } else {
                fs.unlinkSync(backup);
                mod.log(`目标已是英文版，移除冗余备份: ${path.basename(backup)}`);
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
        mod.command.message(`<font color="#FF0000">${m} 详情请查看Toolbox日志。</font>`);
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
    mod.log(`简体中文语言包已加载。`);

    mod.hook('S_SPAWN_ME', 3, () => {
        // 如果消息已显示过，则直接退出函数
        if (hasShownLanguageStatus) {
            return;
        }
        
        // 设置标志，防止重复执行
        hasShownLanguageStatus = true;
        
        // 角色进入游戏时显示语言状态
        mod.setTimeout(() => {
            // 先检查更新，但不显示消息
            const hasUpdates = checkHashUpdates(false);
            
            // 如果有更新，显示更新消息；否则显示当前状态
            if (hasUpdates) {
                // 再次调用但显示消息
                checkHashUpdates(true);
            } else {
                // 没有更新时才显示当前状态
                showLanguageStatus();
            }
        }, 5000); // 延迟5秒显示，避免与其他信息重叠
    });
};