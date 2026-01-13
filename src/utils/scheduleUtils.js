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

export const summarizePattern = (pattern, patterns) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];

    const groups = {};
    const order = [];

    pattern.forEach((p, index) => {
        const key = p;
        if (!groups[key]) {
            groups[key] = [];
            order.push(key);
        }
        groups[key].push(DAY_NAMES[index]);
    });

    return order.map(key => {
        const days = groups[key].join('');
        if (key === 'シフト休') {
            return `${days}:シフト休`;
        }
        const patternDetail = patterns.find(p => p.id === key);
        if (!patternDetail) {
            return `${days}:不明なパターン`;
        }
        return `${days} ${patternDetail.name} ${patternDetail.startTime}～${patternDetail.endTime} ${patternDetail.workHours.toFixed(1)}`;
    }).join('\n');
};
