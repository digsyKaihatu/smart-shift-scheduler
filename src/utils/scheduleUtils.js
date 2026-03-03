// src/utils/scheduleUtils.js

/**
 * 基本シフトパターンの配列を要約した文字列を生成する
 * @param {string[]} pattern ['p1', 'p1', 'p2', 'p2', 'シフト休'] (月〜金)
 * @param {object[]} patterns マスターデータのパターンリスト
 * @param {boolean|boolean[]} hasBreakArray 休憩の有無 (単一のboolean、または曜日ごとの配列)
 * @returns {string} サマリー文字列
 */
export const summarizePattern = (pattern, patterns, hasBreakArray) => {
    if (!pattern || pattern.length === 0) return '未設定';
    const isAllSame = pattern.every(p => p === pattern[0]);
    // 配列対応：すべて同じ休憩設定か判定
    const isBreakAllSame = Array.isArray(hasBreakArray) ? hasBreakArray.every(b => b === hasBreakArray[0]) : true;
    
    if (isAllSame && isBreakAllSame) {
        if (pattern[0] === 'シフト休') return 'すべてシフト休';
        const p = patterns.find(x => x.id === pattern[0]);
        // 配列の先頭、または単一のboolean値を取得
        const hasBreak = Array.isArray(hasBreakArray) ? hasBreakArray[0] : (hasBreakArray !== false);
        return p ? `月-金: ${p.name} (${hasBreak ? '休憩あり' : '休憩なし'})` : '不明なパターン';
    }
    
    const days = ['月', '火', '水', '木', '金'];
    return pattern.map((pId, index) => {
        if (pId === 'シフト休') return `${days[index]}: 休`;
        const p = patterns.find(x => x.id === pId);
        // 曜日ごとに配列から判定
        const hasBreak = Array.isArray(hasBreakArray) ? hasBreakArray[index] : (hasBreakArray !== false);
        return `${days[index]}: ${p ? p.name : pId}(${hasBreak ? '有' : '無'})`;
    }).join('\n');
};

/**
 * 担当可能な業務の配列から、業務名のカンマ区切り文字列を生成する
 * @param {string[]} taskIds 業務IDの配列
 * @param {object[]} tasks 業務マスターデータのリスト
 * @returns {string}
 */
export const getTaskNames = (taskIds, tasks) => {
    if (!taskIds || taskIds.length === 0) return 'なし';
    return taskIds.map(id => {
        const t = tasks.find(x => x.id === id);
        return t ? t.name : id;
    }).join(', ');
};
