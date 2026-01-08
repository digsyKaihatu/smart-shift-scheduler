import React, { useState, useMemo } from 'react';

// アイコンコンポーネント
const ChevronLeft = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const ChevronRight = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

// 削除アイコン
const Trash2 = ({ size = 24 }) => (
  <img 
    src="/image_498ea9.png" 
    alt="削除" 
    style={{ width: size, height: size, objectFit: 'contain' }} 
  />
);

const XIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// 名前から色を生成するヘルパー関数
const getColorForName = (name) => {
  const colors = [
    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }, // Red
    { bg: '#ffedd5', border: '#f97316', text: '#9a3412' }, // Orange
    { bg: '#fef9c3', border: '#eab308', text: '#854d0e' }, // Yellow
    { bg: '#dcfce7', border: '#22c55e', text: '#166534' }, // Green
    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }, // Blue
    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' }, // Indigo
    { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' }, // Purple
    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }, // Pink
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const MonthlyCalendar = ({ schedule, staff, tasks, shiftPatterns, initialYear, initialMonth, onUpdateSchedule, isAdmin, currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date(initialYear, initialMonth - 1, 1));
  const [selectedDateDetail, setSelectedDateDetail] = useState(null);
  const [viewMode, setViewMode] = useState('active_shifts'); // デフォルトを個人出勤日に

  // 表示月の日付配列を生成
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  // イベントデータの生成
  const events = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const key = `${year}-${month}`;
    const monthSchedule = schedule[key] || {};
    const eventList = [];

    Object.entries(monthSchedule).forEach(([staffId, days]) => {
        const staffMember = staff.find(s => s.id === staffId);
        if (!staffMember) return;

        Object.entries(days).forEach(([day, value]) => {
            if (!value || value === '') return;

            let displayText = value;
            let isHoliday = false;
            
            if (typeof value === 'object' && value.type) {
                displayText = value.type === '休' ? '休' : `${value.type}${value.hours ? `(${value.hours})` : ''}`;
                if (['休', '欠', '有', '午前休', '午後休'].some(type => value.type.includes(type))) {
                    isHoliday = true;
                }
            } else if (typeof value === 'number') {
                displayText = `${value}h`;
            } else if (value === '休') {
                isHoliday = true;
            }

            eventList.push({
                id: `${staffId}-${day}`,
                staffId: staffId,
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                day: parseInt(day),
                year: year,
                month: month,
                userName: staffMember.name,
                type: displayText,
                rawValue: value,
                isHoliday: isHoliday,
                tasks: staffMember.possibleTasks || []
            });
        });
    });
    return eventList;
  }, [currentDate, schedule, staff]);

  // モード別データフィルタリング
  const getFilteredEvents = (dateKey) => {
      const dayEvents = events.filter(e => e.date === dateKey);
      
      if (viewMode === 'active_shifts') {
          // 個人出勤日（全員の稼働のみ）
          return dayEvents.filter(e => !e.isHoliday && e.type !== '欠');
      } else if (viewMode === 'holidays') {
          // 個人休日
          return dayEvents.filter(e => e.isHoliday);
      }
      return [];
  };

  const handleDelete = (e, event) => {
      e.stopPropagation();
      if (!window.confirm(`${event.userName}さんの ${event.date} のシフトを削除しますか？`)) return;
      onUpdateSchedule(event.staffId, event.day, '', event.year, event.month);
      setSelectedDateDetail(null);
  };

  const handleDateClick = (date, filteredEvents) => {
      if (filteredEvents.length === 0) return;
      setSelectedDateDetail({
          date,
          events: filteredEvents
      });
  };

  const canDelete = (event) => {
      return isAdmin || (currentUser && currentUser.id === event.staffId);
  };

  const getDayOfWeekStr = (date) => ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  
  // スタイリング用ヘルパー
  const getDayHeaderClass = (dayOfWeek, isHoliday) => {
      let baseClasses = "sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap min-w-[100px]"; // 幅を少し広めに
      if (dayOfWeek === '土') return `${baseClasses} bg-sky-100 text-sky-800 border-sky-200`;
      if (dayOfWeek === '日' || isHoliday) return `${baseClasses} bg-pink-100 text-pink-800 border-pink-200`;
      return `${baseClasses} bg-slate-100 text-slate-900 border-slate-300`;
  };

  return (
    <div className="mt-8 bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"><ChevronLeft size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight whitespace-nowrap">{currentDate.getFullYear()}年 {currentDate.getMonth()+1}月</h2>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"><ChevronRight size={24} /></button>
        </div>

        {/* 表示モード切り替え（全シフト・業務表示削除） */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
                onClick={() => setViewMode('active_shifts')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'active_shifts' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                個人出勤日
            </button>
            <button
                onClick={() => setViewMode('holidays')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'holidays' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                個人休日
            </button>
        </div>
      </div>

      {/* 横スクロールカレンダー本体 */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <div className="min-w-max">
            {/* ヘッダー行 */}
            <div className="flex border-b border-slate-200">
                <div className="sticky left-0 z-40 bg-slate-200 p-2 border-r border-slate-300 font-semibold text-xs text-center w-[100px] flex-shrink-0 flex items-center justify-center">
                    日付
                </div>
                {/* 日付列 */}
                {daysInMonth.map((d) => {
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                    // isHoliday判定は本来 dateUtils から持ってくるべきだが簡易的に土日判定のみ
                    const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
                    return (
                        <div key={d.toISOString()} className={getDayHeaderClass(dayOfWeek, isWeekend)}>
                            <div>{d.getDate()}</div>
                            <div>{dayOfWeek}</div>
                        </div>
                    );
                })}
            </div>

            {/* データ行（ここは1行で日付ごとに縦に積むか、日付を横にして中身を縦に積むか） */}
            {/* 要望：「日付を横一列で表示」→ 上記ヘッダーで日付を横に並べた。
                中身（人名）は、その日付の下にリスト表示する形にする。 */}
            
            <div className="flex">
                <div className="sticky left-0 z-30 bg-slate-50 p-2 border-r border-slate-300 font-semibold text-xs text-center w-[100px] flex-shrink-0 flex items-center justify-center border-b border-slate-200">
                    {viewMode === 'active_shifts' ? '出勤者' : '休日者'}
                </div>
                
                {daysInMonth.map((d) => {
                    const dateKey = formatDate(d);
                    const targetEvents = getFilteredEvents(dateKey);
                    
                    return (
                        <div 
                            key={dateKey} 
                            className="border-r border-slate-200 min-w-[100px] p-1 valign-top bg-white hover:bg-slate-50 transition-colors border-b border-slate-200"
                            onClick={() => handleDateClick(d, targetEvents)}
                        >
                            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto scrollbar-thin">
                                {targetEvents.length > 0 ? (
                                    targetEvents.map(ev => {
                                        const colors = getColorForName(ev.userName);
                                        const isDeletable = canDelete(ev);
                                        return (
                                            <div 
                                                key={ev.id} 
                                                className="group relative flex items-center justify-between p-1.5 rounded text-[10px] border-l-2 shadow-sm bg-opacity-50 hover:shadow-md transition-all cursor-pointer"
                                                style={{
                                                    backgroundColor: colors.bg,
                                                    borderColor: colors.border,
                                                    color: colors.text
                                                }}
                                            >
                                                <div className="truncate font-bold w-full pr-4">{ev.userName}</div>
                                                {isDeletable && (
                                                    <button 
                                                        onClick={(e) => handleDelete(e, ev)} 
                                                        className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })
                                ) : (
                                    <div className="text-[10px] text-slate-300 text-center py-4">-</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      {/* 詳細モーダル (クリック時拡大表示) */}
      {selectedDateDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4" onClick={() => setSelectedDateDetail(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-2xl text-[#D9824D]">{selectedDateDetail.date.getDate()}</span>
                        <span className="text-sm text-slate-500">{getDayOfWeekStr(selectedDateDetail.date)}曜日</span>
                        <span className="px-3 py-1 bg-[#F4B896] text-white text-xs font-bold rounded-full ml-4">
                            {viewMode === 'active_shifts' ? '出勤者一覧' : '休日者一覧'}
                        </span>
                    </h3>
                    <button onClick={() => setSelectedDateDetail(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24} /></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-slate-50/50 flex-grow">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {selectedDateDetail.events.map(ev => {
                            const colors = getColorForName(ev.userName);
                            const isDeletable = canDelete(ev);
                            return (
                                <div key={ev.id} className="relative flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${colors.border}` }}>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm text-slate-700 font-bold truncate">{ev.userName}</span>
                                        <span className="text-xs text-slate-500">{ev.type}</span>
                                    </div>
                                    {isDeletable && (
                                        <button onClick={(e) => handleDelete(e, ev)} className="text-slate-300 hover:text-red-500 transition-colors ml-2"><Trash2 size={14} /></button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyCalendar;
