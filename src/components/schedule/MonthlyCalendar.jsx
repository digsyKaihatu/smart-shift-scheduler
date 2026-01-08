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

const MonthlyCalendar = ({ schedule, staff, tasks, shiftPatterns, initialYear, initialMonth, onUpdateSchedule, isAdmin, currentUser }) => {
  // 初期表示年月を設定
  const [currentDate, setCurrentDate] = useState(new Date(initialYear, initialMonth - 1, 1));
  // 表示モードの状態: 'default' (個人出勤日), 'holidays' (個人休日), 'tasks' (業務表示)
  const [viewMode, setViewMode] = useState('default');

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
            // 値がない場合はスキップ
            if (!value || value === '') return;

            // シフト表示用テキスト生成
            let displayText = value;
            let isHoliday = false;
            
            // オブジェクト型（詳細情報あり）の場合
            if (typeof value === 'object' && value.type) {
                displayText = value.type === '休' ? '休' : `${value.type}${value.hours ? `(${value.hours})` : ''}`;
                // 休日判定
                if (['休', '欠', '有', '午前休', '午後休'].some(type => value.type.includes(type))) {
                    isHoliday = true;
                }
            } 
            // 数値型（時間のみ）の場合
            else if (typeof value === 'number') {
                displayText = `${value}h`;
            } 
            // 文字列型（'休'など）の場合
            else if (value === '休') {
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
                tasks: staffMember.possibleTasks || [] // 担当可能タスク
            });
        });
    });

    return eventList;
  }, [currentDate, schedule, staff]);

  const handleDelete = (e, event) => {
      e.stopPropagation();
      if (!window.confirm(`${event.userName}さんの ${event.date} のシフトを削除しますか？`)) return;
      onUpdateSchedule(event.staffId, event.day, '', event.year, event.month);
  };

  // 編集権限のチェック
  const canDelete = (event) => {
      return isAdmin || (currentUser && currentUser.id === event.staffId);
  };

  return (
    <div className="mt-8">
      {/* --- 月移動ナビゲーション --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 px-2 gap-4">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} 
                className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"
            >
                <ChevronLeft size={24} />
            </button>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight whitespace-nowrap">
                {currentDate.getFullYear()}年 {currentDate.getMonth()+1}月
            </h2>
            <button 
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} 
                className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"
            >
                <ChevronRight size={24} />
            </button>
        </div>

        {/* 表示モード切り替えボタン */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
                onClick={() => setViewMode('default')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'default' 
                    ? 'bg-white text-[#D9824D] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                個人出勤日
            </button>
            <button
                onClick={() => setViewMode('holidays')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'holidays' 
                    ? 'bg-white text-[#D9824D] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                個人休日
            </button>
            <button
                onClick={() => setViewMode('tasks')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'tasks' 
                    ? 'bg-white text-[#D9824D] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                業務表示
            </button>
        </div>
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
            if(!d) return <div key={`empty-${i}`} className="bg-slate-50 min-h-[150px]"></div>;
            
            const dateKey = formatDate(d);
            // その日のイベントをフィルタリング
            const dayEvents = events.filter(e => e.date === dateKey);
            const isToday = formatDate(new Date()) === dateKey;
            
            // --- モード別データ準備 ---

            // 1. 個人出勤日モード用：自分のイベント
            const myEvent = currentUser ? dayEvents.find(e => e.staffId === currentUser.id) : null;

            // 2. 個人休日モード用：休みの人リスト
            const holidayStaff = dayEvents.filter(e => e.isHoliday);

            // 3. 業務表示モード用：業務ごとの担当者リスト
            // 出勤しているスタッフ（休みではない）
            const workingStaff = dayEvents.filter(e => !e.isHoliday && e.type !== '欠');
            
            // 業務ごとに集計
            const taskSummary = tasks ? tasks.map(task => {
                // 簡易ロジック: 出勤していて、かつその業務を担当可能な人
                const assignedMembers = workingStaff.filter(ev => ev.tasks.includes(task.id));
                if (assignedMembers.length === 0) return null;
                return {
                    name: task.name,
                    count: assignedMembers.length,
                    members: assignedMembers.map(m => m.userName)
                };
            }).filter(Boolean) : [];

            return (
              <div key={dateKey} className="bg-white min-h-[150px] p-1.5 flex flex-col gap-1 hover:bg-slate-50 transition-colors">
                {/* 日付ヘッダー */}
                <div className="flex justify-between items-start mb-1 border-b border-slate-100 pb-1">
                  <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-bold ${isToday ? 'bg-[#F4B896] text-white' : 'text-slate-700'}`}>
                    {d.getDate()}
                  </span>
                  
                  {/* 個人出勤日モードのみ：自分のステータスを表示 */}
                  {viewMode === 'default' && myEvent && (
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${myEvent.isHoliday ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                          {myEvent.isHoliday ? '休' : myEvent.type}
                      </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 overflow-y-auto max-h-[110px] scrollbar-thin">
                    {/* --- モード別コンテンツ表示 --- */}

                    {/* 1. 個人出勤日モード: 全員のシフトリスト（従来通り） */}
                    {viewMode === 'default' && dayEvents.map(ev => {
                        const colors = getColorForName(ev.userName);
                        const isDeletable = canDelete(ev);
                        return (
                        <div 
                            key={ev.id} 
                            className="group relative flex justify-between items-center border-l-2 text-[9px] p-1 rounded shadow-sm cursor-default bg-opacity-50 h-6"
                            style={{
                            backgroundColor: colors.bg,
                            borderColor: colors.border,
                            color: colors.text
                            }}
                        >
                            <div className="overflow-hidden pr-3 flex items-center gap-1 w-full">
                                <span className="font-bold truncate shrink-0 max-w-[60%]">{ev.userName}</span>
                                <span className="truncate opacity-80 text-[8px]">{ev.type}</span>
                            </div>
                            
                            {isDeletable && (
                                <button 
                                onClick={(e) => handleDelete(e, ev)} 
                                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                                title="削除"
                                >
                                <Trash2 size={10} />
                                </button>
                            )}
                        </div>
                        );
                    })}

                    {/* 2. 個人休日モード: 休みスタッフのみ表示 */}
                    {viewMode === 'holidays' && (
                        holidayStaff.length > 0 ? (
                            holidayStaff.map(ev => (
                                <div key={ev.id} className="flex items-center justify-between bg-slate-50 px-1.5 py-1 rounded border border-slate-100">
                                    <span className="text-[10px] text-slate-700 font-medium truncate">{ev.userName}</span>
                                    <span className="text-[9px] text-slate-500 bg-slate-200 px-1 rounded">{ev.type}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-[10px] text-slate-400 text-center py-2">休日者なし</div>
                        )
                    )}

                    {/* 3. 業務表示モード: 業務ごとの集計表示 */}
                    {viewMode === 'tasks' && (
                        taskSummary.length > 0 ? (
                            taskSummary.map((t, idx) => (
                                <div key={idx} className="flex flex-col bg-sky-50 p-1.5 rounded border border-sky-100">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className="text-[10px] font-bold text-sky-800 truncate">{t.name}</span>
                                        <span className="text-[10px] font-bold text-white bg-sky-400 px-1.5 rounded-full">{t.count}名</span>
                                    </div>
                                    <div className="text-[9px] text-sky-600 leading-tight">
                                        {t.members.join(' ')}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-[10px] text-slate-400 text-center py-2">稼働なし</div>
                        )
                    )}
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
