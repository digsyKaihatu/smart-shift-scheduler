/**
 * 入力確定後の値を短縮表記に変換する共通ヘルパー
 */
export const formatValue = (value) => {
    const mapping = {
        'シフト休': '休',
        '欠勤': '欠',
        '通休': '通',
        '有休': '有',
        '遅刻': '遅',
        '早退': '早'
    };

    if (typeof value === 'number') {
        return value % 1 === 0 ? Math.floor(value) : value;
    }

    if (value && typeof value === 'object' && 'type' in value) {
        let displayType = value.type;
        if (mapping[value.type]) {
            displayType = mapping[value.type];
        } else {
            Object.entries(mapping).forEach(([full, short]) => {
                displayType = displayType.replace(full, short);
            });
        }
        if ('locked' in value) {
            return displayType;
        }
        return `${displayType}(${value.hours})`;
    }

    if (typeof value === 'string') {
        return mapping[value] || value;
    }

    return value;
};

// 既存の他の関数（getJapaneseHolidaysなど）がここにある場合は維持してください。
