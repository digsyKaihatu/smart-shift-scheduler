import React, { useState, useMemo } from 'react';

// アイコンコンポーネント (Lucide-reactの代用)
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

const Trash2 = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <line x1="10" x2="10" y1="11" y2="17"/>
    <line x1="14" x2="14" y1="11" y2="17"/>
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

const MonthlyCalendar = ({ schedule, staff, shiftPatterns, initialYear, initialMonth, onUpdateSchedule, isAdmin, currentUser }) => {
  // 初期表示年月を設定
  const [currentDate, setCurrentDate] = useState(new Date(initialYear, initialMonth - 1, 1));

  // 表示月の日付配列を生成
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    
    // 月の最初の日まで埋めるための空要素用（曜日に合わせる）
    const firstDayOfWeek = date.getDay(); // 0: 日曜
    for (let i = 0; i < firstDayOfWeek; i++) {
        days.push(null);
    }

    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  // スケジュールデータからカレンダー用イベントリストへ変換
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
            // 値がない、または「休」の場合は表示しない設定にする（必要に応じて変更可）
            if (!value || value === '') return;

            // シフト表示用テキスト生成
            let displayText = value;
            if (typeof value === 'object' && value.type) {
                displayText = value.type === '休' ? '休' : `${value.type}${value.hours ? `(${value.hours})` : ''}`;
            } else if (typeof value === 'number') {
                displayText = `${value}h`;
            }

            // 「休」を表示するかどうか。カレンダーが埋まりすぎるのを防ぐなら除外しても良い
            // ここでは全て表示します
            
            eventList.push({
                id: `${staffId}-${day}`,
                staffId: staffId,
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                day: parseInt(day),
                userName: staffMember.name,
                type: displayText,
                rawValue: value
            });
        });
    });

    return eventList;
  }, [currentDate, schedule, staff]);

  const handleDelete = (e, event) => {
      e.stopPropagation();
      if (!window.confirm(`${event.userName}さんの ${event.date} のシフトを削除しますか？`)) return;
      // シフトを空にする更新を実行
      onUpdateSchedule(event.staffId, event.day, '');
  };

  // 編集権限のチェック
  const canDelete = (event) => {
      return isAdmin || (currentUser && currentUser.id === event.staffId);
  };

  return (
    <div className="mt-8">
      {/* --- 月移動ナビゲーション --- */}
      <div className="flex justify-between items-center mb-4 px-2">
        <button 
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} 
            className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"
        >
            <ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            {currentDate.getFullYear()}年 {currentDate.getMonth()+1}月
        </h2>
        <button 
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} 
            className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"
        >
            <ChevronRight size={24} />
        </button>
      </div>

      {/* --- カレンダーグリッド本体 --- */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-bold text-slate-500 border-b border-slate-200">
          {['日','月','火','水','木','金','土'].map((d,i) => (
            <div key={d} className={`py-3 ${i===0?'text-red-500':i===6?'text-blue-500':''}`}>{d}</div>
          ))}
        </div>
        
        {/* 日付セル */}
        <div className="grid grid-cols-7 bg-slate-200 gap-px">
          {daysInMonth.map((d, i) => {
            // 空白セル（月始めの調整用）
            if(!d) return <div key={`empty-${i}`} className="bg-slate-50 min-h-[100px]"></div>;
            
            const dateKey = formatDate(d);
            // その日のイベントをフィルタリング
            const dayEvents = events.filter(e => e.date === dateKey);
            const isToday = formatDate(new Date()) === dateKey;

            return (
              <div key={dateKey} className="bg-white min-h-[100px] p-1.5 flex flex-col gap-1 hover:bg-slate-50 transition-colors">
                {/* 日付数字 */}
                <div className="flex justify-center mb-1">
                  <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-bold ${isToday ? 'bg-[#F4B896] text-white' : 'text-slate-700'}`}>
                    {d.getDate()}
                  </span>
                </div>
                
                {/* 予定リスト */}
                <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[120px]">
                  {dayEvents.map(ev => {
                    const colors = getColorForName(ev.userName);
                    const isDeletable = canDelete(ev);

                    return (
                      <div 
                        key={ev.id} 
                        className="group relative flex justify-between items-center border-l-4 text-[10px] p-1.5 rounded shadow-sm transition-all hover:shadow-md cursor-default bg-opacity-50"
                        style={{
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                          color: colors.text
                        }}
                      >
                        <div className="overflow-hidden pr-4">
                          <div className="font-bold truncate text-xs">{ev.userName}</div>
                          <div className="truncate opacity-80 text-[9px]">{ev.type}</div>
                        </div>
                        
                        {/* 削除ボタン */}
                        {isDeletable && (
                            <button 
                            onClick={(e) => handleDelete(e, ev)} 
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="削除"
                            >
                            <Trash2 size={12} />
                            </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MonthlyCalendar;
