import React, { useState, useMemo, useEffect, useRef } from 'react';
import DailyShiftDetailModal from './DailyShiftDetailModal.jsx';

// -----------------------------------------------------------------------------
// Helper Logic: 判定ロジック
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
    if (hours > 0) isWorking = true;
    if (type.includes('遅刻') || type.includes('早退')) isWorking = true;

    // 2. 半休系（午前・午後）の判定 -> 両方にカウント
    if (type.includes('午前') || type.includes('午後')) {
        isWorking = true;
        isVacation = true;
    }

    // 3. 休暇判定 (有休、通休、欠勤)
    if (['有休', '通休', '欠勤'].some(k => type.includes(k))) {
        isVacation = true;
    }

    // 4. シフト休は除外
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
    const scrollContainerRef = useRef(null);

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

    // 今日の日付へ自動スクロール
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        
        const today = new Date();
        if (today.getFullYear() === initialYear && (today.getMonth() + 1) === initialMonth) {
            const todayDate = today.getDate();
            const targetElement = scrollContainerRef.current.querySelector(`[data-day="${todayDate}"]`);
            
            if (targetElement) {
                // 少し余白を持たせてスクロール
                const scrollLeft = targetElement.offsetLeft - 50; 
                scrollContainerRef.current.scrollTo({
                    left: Math.max(0, scrollLeft),
                    behavior: 'smooth'
                });
            }
        }
    }, [initialYear, initialMonth, days]);

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
            events: events,
            attendees: dayData.attendees,
            vacationers: dayData.vacationers
        });
    };

    return (
        <div className="mt-8 bg-white rounded-lg shadow-md p-4 ring-1 ring-black ring-opacity-5">
            <h3 className="text-lg font-bold text-slate-800 mb-4">出勤・休暇カレンダー</h3>
            
            <div 
                className="overflow-x-auto pb-2 custom-scrollbar" 
                ref={scrollContainerRef}
            >
                <div className="flex min-w-max border-l border-t border-b border-slate-200">
                    {days.map(day => {
                        const date = new Date(initialYear, initialMonth - 1, day);
                        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
                        const { attendees, vacationers } = calendarData[day] || { attendees: [], vacationers: [] };
                        const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === initialMonth && new Date().getFullYear() === initialYear;

                        let headerBgClass = "bg-slate-100 text-slate-700 border-slate-300";
                        if (dayOfWeek === '日') headerBgClass = "bg-pink-100 text-pink-800 border-pink-200";
                        else if (dayOfWeek === '土') headerBgClass = "bg-sky-100 text-sky-800 border-sky-200";
                        if (isToday) headerBgClass = "bg-yellow-200 text-yellow-900 border-yellow-300 ring-2 ring-inset ring-yellow-400 z-10";

                        // 横スクロール用のセル幅設定
                        const cellWidthClass = "w-[160px] min-w-[160px] max-w-[160px]";

                        return (
                            <div 
                                key={day} 
                                data-day={day}
                                onClick={() => handleDayClick(day)}
                                className={`${cellWidthClass} border-r border-slate-200 flex flex-col bg-white hover:bg-slate-50 transition-colors cursor-pointer group`}
                            >
                                {/* 日付ヘッダー */}
                                <div className={`p-2 text-center text-sm font-bold border-b ${headerBgClass}`}>
                                    {day}日 ({dayOfWeek})
                                </div>
                                
                                {/* コンテンツエリア */}
                                <div className="p-2 flex flex-col gap-2 flex-grow h-[300px] overflow-y-auto custom-scrollbar">
                                    
                                    {/* 出勤者リスト */}
                                    <div className="bg-green-50/50 rounded border border-green-100 p-1.5 flex flex-col gap-1 min-h-[80px]">
                                        <div className="text-xs font-bold text-green-700 border-b border-green-200 pb-0.5 mb-0.5 flex justify-between items-center">
                                            <span>出勤</span>
                                            <span className="bg-green-100 text-green-800 px-1.5 rounded-full text-[10px]">{attendees.length}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 content-start">
                                            {attendees.map(a => (
                                                <span key={a.id} className="text-xs text-slate-700 bg-white border border-green-100 px-1 rounded shadow-sm truncate max-w-full" title={`${a.name} (${a.label})`}>
                                                    {a.name}
                                                </span>
                                            ))}
                                            {attendees.length === 0 && <span className="text-[10px] text-slate-400 italic">なし</span>}
                                        </div>
                                    </div>

                                    {/* 休暇者リスト */}
                                    <div className="bg-red-50/50 rounded border border-red-100 p-1.5 flex flex-col gap-1 min-h-[80px]">
                                        <div className="text-xs font-bold text-red-700 border-b border-red-200 pb-0.5 mb-0.5 flex justify-between items-center">
                                            <span>休暇</span>
                                            <span className="bg-red-100 text-red-800 px-1.5 rounded-full text-[10px]">{vacationers.length}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 content-start">
                                            {vacationers.map(v => (
                                                <span key={v.id} className="text-xs text-slate-700 bg-white border border-red-100 px-1 rounded shadow-sm truncate max-w-full" title={`${v.name} (${v.label})`}>
                                                    {v.name}
                                                </span>
                                            ))}
                                            {vacationers.length === 0 && <span className="text-[10px] text-slate-400 italic">なし</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
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
