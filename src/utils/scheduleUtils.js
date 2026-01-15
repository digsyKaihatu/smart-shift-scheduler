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
 * @param {Array} pattern - ['A', 'A', 'B', 'A', 'A'] のようなパターンの配列
 * @param {Array} patterns - シフトパターンの定義データ
 * @param {Array} hasBreakArray - [true, true, false, true, true] のような休憩有無の配列
 */
export const summarizePattern = (pattern, patterns, hasBreakArray) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];

    // 休憩設定の取得ヘルパー（データがない場合はtrue=休憩ありとみなす）
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
            // ここを変更: (休有)/(休無) -> 休憩あり/休憩なし
            const breakStr = firstBreak ? '休憩あり' : '休憩なし';
            return `月〜金 ${p.startTime}～${p.endTime} ${breakStr}`;
        }
    }

    // 曜日ごとの表示（設定が異なる場合）
    const lines = pattern.map((pId, index) => {
        const isBreak = getBreak(index);
        // ここを変更: (有)/(無) -> (休憩あり)/(休憩なし) ※スペースの都合上、カッコ付き等で区別
        const breakLabel = isBreak ? "(休憩あり)" : "(休憩なし)";
        
        if (pId === 'シフト休') return `${DAY_NAMES[index]}:休`;
        
        const p = patterns.find(x => x.id === pId);
        if (!p) return `${DAY_NAMES[index]}:?`;
        
        return `${DAY_NAMES[index]}:${p.name}${breakLabel}`;
    });

    // 2行に分けて表示（月〜水 / 木〜金）
    return `${lines.slice(0, 3).join(' ')}\n${lines.slice(3).join(' ')}`;
};
