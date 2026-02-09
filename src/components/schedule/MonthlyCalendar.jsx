import React, { useState, useMemo } from 'react';
import DailyShiftDetailModal from './DailyShiftDetailModal.jsx';

// -----------------------------------------------------------------------------
// Helper Logic: 判定ロジックの改修
// -----------------------------------------------------------------------------

const getShiftStatus = (value) => {
    if (value === undefined || value === null || value === '') {
        return { isWorking: false, isVacation: false, label: '' };
    }

    // A. 数値（稼働時間）の場合
    if (typeof value === 'number') {
        return { isWorking: value > 0, isVacation: false, label: `${value}h` };
    }

    let type = '';
    let label = '';
    let hours = 0;

    // B. オブジェクトまたは文字列からタイプと時間を抽出
    if (typeof value === 'object') {
        type = value.type || '';
        label = type;
        hours = value.hours || 0;
        if ('locked' in value) label = type; // ロック時はタイプ名を表示
    } else if (typeof value === 'string') {
        type = value;
        label = value;
    }

    let isWorking = false;
    let isVacation = false;

    // ---------------------------------------------------
    // 判定ロジックの実装
    // ---------------------------------------------------

    // 1. 基本的な出勤判定
    // 時間が入っている、または「遅刻」「早退」が含まれる場合は出勤
    if (hours > 0) isWorking = true;
    if (type.includes('遅刻') || type.includes('早退')) isWorking = true;

    // 2. 半休系（午前・午後）の判定
    // 要件: 「午前」「午後」がつく区分は、出勤者・休暇者の両方にカウント
    if (type.includes('午前') || type.includes('午後')) {
        isWorking = true;
        isVacation = true;
    }

    // 3. 休暇判定
    // 要件: 有休、通休、欠勤は休暇に含める
    // ※「午後有休」などは上記2で既にisVacation=trueになっているが、念のためここでも判定
    if (['有休', '通休', '欠勤'].some(k => type.includes(k))) {
        isVacation = true;
    }

    // 4. 除外判定
    // 「シフト休」は通常、勤務日ではない（公休）扱いのため、明示的な休暇申請（有休等）とは区別して
    // リストには表示しないのが一般的ですが、もし表示したい場合はここを調整します。
    // 現状は「休暇者リスト（＝休んだ人）」という文脈のため、シフト休は除外します。
    if (type === 'シフト休') {
        isWorking = false;
        isVacation = false;
    }

    return { isWorking, isVacation, label };
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const MonthlyCalendar = ({ 
    schedule, 
    staff = [], 
    initialYear, 
    initialMonth,
    isAdmin = false 
}) => {
    const [selectedDate, setSelectedDate] = useState(null);

    const daysInMonth = useMemo(() => {
        return new Date(initialYear, initialMonth, 0).getDate();
    }, [initialYear, initialMonth]);

    const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

    // カレンダー表示用にデータを加工
    const calendarData = useMemo(() => {
        const data = {};
        const currentKey = `${initialYear}-${initialMonth}`;
        const monthSchedule = schedule[currentKey] || {};

        days.forEach(day => {
            const attendees = [];
            const vacationers = [];

            staff.forEach(s => {
                const shiftValue = monthSchedule[s.id]?.[day];
                const status = getShiftStatus(shiftValue);

                const memberInfo = {
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    label: status.label,
                    rawValue: shiftValue
                };

                if (status.isWorking) {
                    attendees.push(memberInfo);
                }

                if (status.isVacation) {
                    vacationers.push(memberInfo);
                }
            });

            data[day] = { attendees, vacationers };
        });
        return data;
    }, [schedule, staff, initialYear, initialMonth, days]);

    const handleDayClick = (day) => {
        const dayData = calendarData[day];
        if (!dayData) return;

        const events = [
            ...dayData.attendees.map(a => ({ ...a, type: '出勤', date: `${initialYear}-${initialMonth}-${day}` })),
            ...dayData.vacationers.map(v => ({ ...v, type: '休暇', date: `${initialYear}-${initialMonth}-${day}` }))
        ];

        setSelectedDate({
            date: new Date(initialYear, initialMonth - 1, day),
            title: `${initialMonth}月${day}日 詳細`,
            events: events
        });
    };

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">出勤・休暇カレンダー</h3>
            
            <div className="grid grid-cols-7 border-t border-l border-slate-200">
                {/* ヘッダー */}
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                    <div key={i} className={`p-2 text-center text-xs font-bold border-b border-r border-slate-200 ${d === '日' ? 'text-pink-600 bg-pink-50' : d === '土' ? 'text-sky-600 bg-sky-50' : 'text-slate-700 bg-slate-50'}`}>
                        {d}
                    </div>
                ))}
                
                {/* 空白セル（月の開始曜日まで） */}
                {Array.from({ length: new Date(initialYear, initialMonth - 1, 1).getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-slate-50 border-b border-r border-slate-200 min-h-[100px]"></div>
                ))}

                {/* 日付セル */}
                {days.map(day => {
                    const date = new Date(initialYear, initialMonth - 1, day);
                    const dayOfWeek = date.getDay();
                    const { attendees, vacationers } = calendarData[day] || { attendees: [], vacationers: [] };
                    const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === initialMonth && new Date().getFullYear() === initialYear;

                    let bgClass = "bg-white";
                    if (dayOfWeek === 0) bgClass = "bg-pink-50/30";
                    if (dayOfWeek === 6) bgClass = "bg-sky-50/30";
                    if (isToday) bgClass = "bg-yellow-50";

                    return (
                        <div 
                            key={day} 
                            onClick={() => handleDayClick(day)}
                            className={`${bgClass} p-1 min-h-[100px] border-b border-r border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer flex flex-col`}
                        >
                            <div className="text-right mb-1">
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${isToday ? 'bg-yellow-200 text-yellow-800' : 'text-slate-500'}`}>
                                    {day}
                                </span>
                            </div>
                            
                            <div className="flex flex-col gap-1 flex-grow">
                                {/* 出勤者リスト */}
                                {attendees.length > 0 && (
                                    <div className="bg-green-50 rounded border border-green-100 p-1">
                                        <div className="text-[10px] font-bold text-green-700 mb-0.5">出勤 ({attendees.length})</div>
                                        <div className="flex flex-wrap gap-1">
                                            {attendees.map(a => (
                                                <span key={a.id} className="text-[10px] text-slate-700 leading-tight" title={`${a.name} (${a.label})`}>
                                                    {a.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 休暇者リスト */}
                                {vacationers.length > 0 && (
                                    <div className="bg-red-50 rounded border border-red-100 p-1 mt-auto">
                                        <div className="text-[10px] font-bold text-red-700 mb-0.5">休暇 ({vacationers.length})</div>
                                        <div className="flex flex-wrap gap-1">
                                            {vacationers.map(v => (
                                                <span key={v.id} className="text-[10px] text-slate-700 leading-tight" title={`${v.name} (${v.label})`}>
                                                    {v.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedDate && (
                <DailyShiftDetailModal 
                    detail={selectedDate}
                    viewMode="calendar_summary"
                    onClose={() => setSelectedDate(null)}
                    canDelete={() => false}
                />
            )}
        </div>
    );
};

export default MonthlyCalendar;
