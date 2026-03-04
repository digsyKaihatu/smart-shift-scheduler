// src/utils/scheduleUtils.js

/**
 * パターンIDからデフォルトの休憩有無を判定するヘルパー
 * @param {string} pId パターンID
 * @param {object[]} patterns マスターデータのパターンリスト
 * @returns {boolean} 休憩ありなら true
 */
export const checkPatternHasBreak = (pId, patterns) => {
    if (pId === 'シフト休') return false;
    const p = patterns.find(x => x.id === pId);
    if (!p) return true; // デフォルト
    return p.breakHours !== undefined ? p.breakHours > 0 : (p.breakTime !== undefined && p.breakTime !== '0:00' && p.breakTime !== '00:00');
};

/**
 * 指定された年月の初期スケジュールを生成する
 * @param {number} year 年
 * @param {number} month 月
 * @param {object[]} staff スタッフリスト
 * @param {object[]} shiftPatterns シフトパターンのリスト
 * @param {number[]} holidays 祝日の配列
 * @returns {object} 生成されたスケジュールオブジェクト
 */
export const generateScheduleForMonth = (year, month, staff, shiftPatterns, holidays = []) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const schedule = {};

    staff.forEach(s => {
        schedule[s.id] = {};
        const pattern = s.defaultShift?.pattern || Array(5).fill('シフト休');
        const hasBreakArray = s.defaultShift?.hasBreakArray;

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dw = date.getDay(); // 0:日, 1:月, ... 6:土

            // 祝日または土日は「シフト休」
            if (holidays.includes(day) || dw === 0 || dw === 6) {
                schedule[s.id][day] = 'シフト休';
            } else {
                const pId = pattern[dw - 1];
                if (pId === 'シフト休') {
                    schedule[s.id][day] = 'シフト休';
                } else {
                    const pat = shiftPatterns.find(p => p.id === pId);
                    if (pat) {
                        let workHours = Number(pat.workHours) || 0;
                        
                        // 休憩設定の評価
                        let hasBreak = true;
                        if (Array.isArray(hasBreakArray) && hasBreakArray.length > dw - 1) {
                            hasBreak = hasBreakArray[dw - 1];
                        } else if (s.defaultShift?.hasBreak !== undefined) {
                            hasBreak = s.defaultShift.hasBreak;
                        } else {
                            hasBreak = checkPatternHasBreak(pId, shiftPatterns);
                        }
                        
                        // 休憩なしの場合は、稼働時間に休憩時間分を加算する
                        if (!hasBreak) {
                            let breakH = Number(pat.breakHours) || 0;
                            if (breakH === 0 && pat.breakTime && pat.breakTime !== '0:00' && pat.breakTime !== '00:00') {
                                const [h, m] = pat.breakTime.split(':').map(Number);
                                breakH = h + (m / 60);
                            }
                            // もともと休憩があるパターンから休憩を抜いた場合のみ、稼働時間に休憩時間を足す
                            if (breakH > 0) {
                                workHours += breakH;
                            }
                        }
                        schedule[s.id][day] = workHours;
                    } else {
                        schedule[s.id][day] = '';
                    }
                }
            }
        }
    });

    return schedule;
};

/**
 * 基本シフトパターンの配列を要約した文字列を生成する
 * @param {string[]} pattern ['p1', 'p1', 'p2', 'p2', 'シフト休'] (月〜金)
 * @param {object[]} patterns マスターデータのパターンリスト
 * @param {boolean|boolean[]} hasBreakArray 休憩の有無 (単一のboolean、または曜日ごとの配列)
 * @returns {string} サマリー文字列
 */
export const summarizePattern = (pattern, patterns, hasBreakArray) => {
    if (!pattern || pattern.length === 0) return '未設定';
    
    // hasBreakArrayの補完と評価
    const hasBreaks = pattern.map((pId, idx) => {
        if (Array.isArray(hasBreakArray) && hasBreakArray.length === pattern.length) {
            return hasBreakArray[idx];
        } else if (hasBreakArray !== undefined && typeof hasBreakArray === 'boolean') {
            return hasBreakArray;
        } else {
            return checkPatternHasBreak(pId, patterns);
        }
    });

    const isAllSame = pattern.every(p => p === pattern[0]);
    const isBreakAllSame = hasBreaks.every(b => b === hasBreaks[0]);
    
    if (isAllSame && isBreakAllSame) {
        if (pattern[0] === 'シフト休') return '月-金: 休';
        const p = patterns.find(x => x.id === pattern[0]);
        const hasBreak = hasBreaks[0];
        return p ? `月-金: ${p.name}(${p.startTime}-${p.endTime}) (${hasBreak ? '休憩あり' : '休憩なし'})` : '不明なパターン';
    }
    
    const days = ['月', '火', '水', '木', '金'];
    return pattern.map((pId, index) => {
        if (pId === 'シフト休') return `${days[index]}: 休`;
        const p = patterns.find(x => x.id === pId);
        const hasBreak = hasBreaks[index];
        return `${days[index]}: ${p ? `${p.name}(${p.startTime}-${p.endTime})` : pId}(${hasBreak ? '有' : '無'})`;
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
