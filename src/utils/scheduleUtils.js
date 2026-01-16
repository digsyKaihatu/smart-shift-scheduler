import { getJapaneseHolidays } from './dateUtils';

export const generateScheduleForMonth = (year, month, staffData, shiftPatternsData) => {
    const scheduleForMonth = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = getJapaneseHolidays(year, month);

    staffData.forEach(staffMember => {
        const staffId = staffMember.id;
        scheduleForMonth[staffId] = {};
        const defaultPattern = staffMember.defaultShift?.pattern;

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay(); // Sunday: 0, Monday: 1, ..., Saturday: 6
            const isHoliday = monthHolidays.includes(day);

            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                scheduleForMonth[staffId][day] = 'シフト休';
            } else {
                // It's a weekday
                const patternIndex = dayOfWeek - 1; // Monday (1) -> 0
                if (defaultPattern && patternIndex >= 0 && patternIndex < defaultPattern.length) {
                    const patternId = defaultPattern[patternIndex];
                    if (patternId === 'シフト休') {
                        scheduleForMonth[staffId][day] = 'シフト休';
                    } else {
                        const patternDetails = shiftPatternsData.find(p => p.id === patternId);
                        scheduleForMonth[staffId][day] = patternDetails ? patternDetails.workHours : '';
                    }
                } else {
                    scheduleForMonth[staffId][day] = ''; // No pattern defined for this weekday
                }
            }
        }
    });

    return scheduleForMonth;
};

export const generateInitialSchedule = (staffData, shiftPatternsData) => {
    const year = 2025;
    const month = 12;
    const key = `${year}-${month}`;
    return {
        [key]: generateScheduleForMonth(year, month, staffData, shiftPatternsData)
    };
};

/**
 * シフトパターンのサマリーを生成する関数
 * 同じ設定（パターンIDと休憩有無）の曜日をまとめて表示します。
 * @param {Array} pattern - ['A', 'A', 'B', 'A', 'A'] のようなパターンの配列
 * @param {Array} patterns - シフトパターンの定義データ
 * @param {Array} hasBreakArray - [true, true, false, true, true] のような休憩有無の配列
 */
export const summarizePattern = (pattern, patterns, hasBreakArray) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];

    // 休憩設定の取得ヘルパー
    const getBreak = (i) => Array.isArray(hasBreakArray) ? hasBreakArray[i] : true;

    // 5日間すべて同じ設定かどうかをチェック
    const firstId = pattern[0];
    const firstBreak = getBreak(0);
    const isUniform = pattern.every((id, i) => id === firstId && getBreak(i) === firstBreak);

    // 一括表示（すべて同じ場合）
    if (isUniform) {
        if (firstId === 'シフト休') {
            return '月〜金: シフト休';
        }
        const p = patterns.find(x => x.id === firstId);
        if (p) {
            const breakLabel = firstBreak ? '休憩あり' : '休憩なし';
            return `月〜金 ${p.startTime}～${p.endTime} ${breakLabel}`;
        }
    }

    // 設定内容を一意なキーに変換するヘルパー関数
    // 区切り文字によるバグを防ぐため、JSON文字列化してキーにする
    const getSettingKey = (index) => {
        const pId = pattern[index];
        const isBreak = getBreak(index);
        return JSON.stringify({ pId, isBreak });
    };

    // グループ化のためのMap (挿入順序を保持)
    const groups = new Map();

    for (let i = 0; i < 5; i++) {
        const key = getSettingKey(i);
        if (!groups.has(key)) {
            groups.set(key, { key, days: [] });
        }
        groups.get(key).days.push(DAY_NAMES[i]);
    }

    const resultLines = [];

    for (const group of groups.values()) {
        const { key, days } = group;
        const daysStr = days.join('、');
        let contentStr = '';

        try {
            const { pId, isBreak } = JSON.parse(key);

            if (pId === 'シフト休') {
                contentStr = 'シフト休';
            } else {
                const p = patterns.find(x => x.id === pId);
                if (p) {
                    const breakLabel = isBreak ? '休憩あり' : '休憩なし';
                    contentStr = `${p.name}：${p.startTime}～${p.endTime}　${breakLabel}`;
                } else {
                    // フォールバック: マスタに見つからない場合
                    // 万が一IDに「シフト休」や「休」という文字列が含まれていれば「シフト休」とみなす（セーフティ）
                    if (String(pId).includes('シフト休') || String(pId).includes('休')) {
                         contentStr = 'シフト休';
                    } else {
                         contentStr = `?`; 
                    }
                }
            }
        } catch (e) {
            contentStr = '?';
        }
        resultLines.push(`${daysStr}　${contentStr}`);
    }

    return resultLines.join('\n');
};
