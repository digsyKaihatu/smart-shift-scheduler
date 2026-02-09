import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DailyShiftDetailModal from './DailyShiftDetailModal.jsx';

// -----------------------------------------------------------------------------
// Helper Logic
// -----------------------------------------------------------------------------

/**
 * スタッフのその日のステータスを判定する
 * @param {string|number|object} value - シフトの値
 * @returns {object} { isWorking: boolean, isVacation: boolean, label: string }
 */
const getShiftStatus = (value) => {
    if (value === undefined || value === null || value === '') {
        return { isWorking: false, isVacation: false, label: '' };
    }

    // 数値（稼働時間）の場合
    if (typeof value === 'number') {
        return { isWorking: value > 0, isVacation: false, label: `${value}h` };
    }

    // 文字列の場合
    if (typeof value === 'string') {
        if (['有休', '通休', '欠勤'].includes(value)) {
            return { isWorking: false, isVacation: true, label: value };
        }
        if (value === 'シフト休') {
            return { isWorking: false, isVacation: false, label: '休' }; // シフト休は休暇者リストには入れない（通常）
        }
        // その他の文字列は一旦稼働なし扱い（必要に応じて追加）
        return { isWorking: false, isVacation: false, label: value };
    }

    // オブジェクトの場合 ({ type: '...', hours: ... })
    if (typeof value === 'object') {
        const type = value.type || '';
        const hours = value.hours || 0;
        
        let isWorking = false;
        let isVacation = false;

        // 1. 出勤判定
        // 時間が入っている、または半休系（遅刻・早退含む）は出勤扱い
        if (hours > 0) isWorking = true;
        if (['遅刻', '早退'].some(k => type.includes(k))) isWorking = true;
        
        // 午前・午後は出勤にも含める
        if (type.includes('午前') || type.includes('午後')) isWorking = true;

        // 2. 休暇判定
        // 有休、通休、欠勤は休暇
        if (['有休', '通休', '欠勤'].some(k => type.includes(k))) isVacation = true;
        
        // 午前休、午後休などの「休」が含まれる半日区分も休暇に含める
        // ※「シフト休」は除外するが、「午前シフト休」のような運用がある場合は調整必要
        if ((type.includes('午前') || type.includes('午後')) && (type.includes('休') || type.includes('有休'))) {
            isVacation = true;
        }

        return { isWorking, isVacation, label: type };
    }

    return { isWorking: false, isVacation: false, label: '' };
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
    const [selectedDate, setSelectedDate] = useState(null); // { date: Date, events: [] }

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

                if (status.isWorking) {
                    attendees.push({
                        id: s.id,
                        name: s.name,
                        role: s.role,
                        label: status.label,
                        rawValue: shiftValue
                    });
                }

                if (status.isVacation) {
                    vacationers.push({
                        id: s.id,
                        name: s.name,
                        role: s.role,
                        label: status.label,
                        rawValue: shiftValue
                    });
                }
            });

            data[day] = { attendees, vacationers };
        });
        return data;
    }, [schedule, staff, initialYear, initialMonth, days]);

    const handleDayClick = (day) => {
        const dayData = calendarData[day];
        if (!dayData) return;

        // モーダル表示用のデータ構造に変換
        const events = [
            ...dayData.attendees.map(a => ({ ...a, type: '出勤', date: `${initialYear}-${initialMonth}-${day}` })),
            ...dayData.vacationers.map(v => ({ ...v, type: '休暇', date: `${initialYear}-${initialMonth}-${day}` }))
        ];

        setSelectedDate({
            date: new Date(initialYear, initialMonth - 1, day),
            title: `${initialMonth}月${day}日 詳細`,
            events: events,
            attendees: dayData.attendees,   // 専用表示用に分ける
            vacationers: dayData.vacationers
        });
    };

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">出勤・休暇カレンダー</h3>
            
            <div className="grid grid-cols-7 gap-1 bg-slate-200 border border-slate-300 rounded overflow-hidden">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                    <div key={i} className={`p-2 text-center text-xs font-bold ${d === '日' ? 'text-pink-600 bg-pink-50' : d === '土' ? 'text-sky-600 bg-sky-50' : 'text-slate-700 bg-slate-50'}`}>
                        {d}
                    </div>
                ))}
                
                {/* 最初の日のパディング（簡易実装） */}
                {Array.from({ length: new Date(initialYear, initialMonth - 1, 1).getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-slate-50 min-h-[100px]"></div>
                ))}

                {days.map(day => {
                    const date = new Date(initialYear, initialMonth - 1, day);
                    const dayOfWeek = date.getDay();
                    const { attendees, vacationers } = calendarData[day] || { attendees: [], vacationers: [] };
                    const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === initialMonth && new Date().getFullYear() === initialYear;

                    let bgClass = "bg-white";
                    if (dayOfWeek === 0) bgClass = "bg-pink-50/30"; // 日曜
                    if (dayOfWeek === 6) bgClass = "bg-sky-50/30"; // 土曜
                    if (isToday) bgClass = "bg-yellow-50 ring-2 ring-inset ring-yellow-200";

                    return (
                        <div 
                            key={day} 
                            onClick={() => handleDayClick(day)}
                            className={`${bgClass} p-1 min-h-[120px] border-t border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer flex flex-col gap-1`}
                        >
                            <div className="text-right text-xs font-semibold text-slate-500 px-1">{day}</div>
                            
                            {/* 出勤者数バッジ */}
                            {attendees.length > 0 && (
                                <div className="text-[10px] bg-green-50 border border-green-200 rounded px-1 py-0.5">
                                    <span className="font-bold text-green-700 block mb-0.5 border-b border-green-100">出勤 ({attendees.length})</span>
                                    <div className="flex flex-wrap gap-0.5">
                                        {attendees.map(a => (
                                            <span key={a.id} className="text-slate-700 truncate max-w-full" title={`${a.name} (${a.label})`}>
                                                {a.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 休暇者数バッジ */}
                            {vacationers.length > 0 && (
                                <div className="text-[10px] bg-red-50 border border-red-200 rounded px-1 py-0.5 mt-auto">
                                    <span className="font-bold text-red-700 block mb-0.5 border-b border-red-100">休暇 ({vacationers.length})</span>
                                    <div className="flex flex-wrap gap-0.5">
                                        {vacationers.map(v => (
                                            <span key={v.id} className="text-slate-700 truncate max-w-full" title={`${v.name} (${v.label})`}>
                                                {v.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 詳細モーダル (DailyShiftDetailModalを再利用または独自拡張) */}
            {selectedDate && (
                <DailyShiftDetailModal 
                    detail={selectedDate}
                    viewMode="calendar_summary" // モーダル側で表示モードを切り替える識別子
                    onClose={() => setSelectedDate(null)}
                    canDelete={() => false}
                />
            )}
        </div>
    );
};

export default MonthlyCalendar;
