import { getJapaneseHolidays, formatValue } from './dateUtils';

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
            const dayOfWeek = date.getDay(); // 0: 日曜, 1: 月曜, ..., 6: 土曜
            const isHoliday = monthHolidays.includes(day);

            // 平日以外（土日、または祝日）の場合は初期状態を「シフト休」に設定
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                scheduleForMonth[staffId][day] = 'シフト休';
            } else {
                // 平日の場合：基本シフトパターンがあればそれを適用
                const patternIndex = dayOfWeek - 1; // 月曜(1) -> 0
                if (defaultPattern && patternIndex >= 0 && patternIndex < defaultPattern.length) {
                    const patternId = defaultPattern[patternIndex];
                    if (patternId === 'シフト休') {
                        scheduleForMonth[staffId][day] = 'シフト休';
                    } else {
                        const patternDetails = shiftPatternsData.find(p => p.id === patternId);
                        scheduleForMonth[staffId][day] = patternDetails ? patternDetails.workHours : '';
                    }
                } else {
                    scheduleForMonth[staffId][day] = ''; // パターン未定義の場合は空欄
                }
            }
        }
    });

    return scheduleForMonth;
};

export const generateInitialSchedule = (staffData, shiftPatternsData) => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
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

/**
 * イレギュラー（基本パターンと異なるシフト）を抽出する関数
 * ShiftApprovalModalとMainContent(通知送信時)で共通して使用し、不整合を防ぐ
 */
export const calculateIrregularities = (staffMember, staffSchedule, shiftPatterns, holidays, year, month) => {
    const irregularities = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const safeSchedule = staffSchedule || {};

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); // 0 = Sunday
        const isHoliday = holidays.includes(day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let expectedValue = '';
        
        if (isWeekend || isHoliday) {
            expectedValue = 'シフト休';
        } else {
            const patternIndex = dayOfWeek - 1; // 0 = Monday
            if (patternIndex >= 0 && patternIndex < 5) {
                const patternId = staffMember.defaultShift?.pattern?.[patternIndex];
                if (patternId === 'シフト休') {
                    expectedValue = 'シフト休';
                } else if (patternId) {
                    const pattern = shiftPatterns.find(p => p.id === patternId);
                    expectedValue = pattern ? pattern.workHours : '';
                }
            }
        }
        
        const actualValue = safeSchedule[day];

        // 比較用に値を正規化
        let actualCompare = actualValue;
        if (typeof actualValue === 'object' && actualValue !== null) {
            actualCompare = actualValue.type || '';
        } else if (actualValue === undefined || actualValue === null) {
            actualCompare = '';
        }

        // 一致判定
        let isEffectivelySame = (String(actualCompare) === String(expectedValue));

        if (!isEffectivelySame) {
            if (expectedValue === 'シフト休') {
                // 想定が休日の場合、実質的に休みを意味する値なら一致とみなす
                const emptyOrRestValues = ['', 0, '0', '休', 'シフト休', null, undefined];
                if (emptyOrRestValues.includes(actualCompare)) {
                    isEffectivelySame = true;
                }
            } else if (expectedValue !== '') {
                // 想定が数値(稼働時間)の場合、数値として一致すればOK
                const actualNum = parseFloat(actualCompare);
                const expectedNum = parseFloat(expectedValue);
                if (!isNaN(actualNum) && !isNaN(expectedNum) && actualNum === expectedNum) {
                    isEffectivelySame = true;
                }
            }
        }

        if (!isEffectivelySame) {
            const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeek];
            // formatValueを利用して表示形式を統一
            const formattedActual = formatValue(actualValue);
            irregularities.push(`${month}/${day}(${dayOfWeekStr}): ${String(formattedActual || '未入力')}`);
        }
    }
    return irregularities;
};
