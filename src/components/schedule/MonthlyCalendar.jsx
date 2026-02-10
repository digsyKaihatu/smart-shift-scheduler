import React, { useState, useEffect } from 'react';

// エラー回避のため、styleUtilsからインポートせずここで定義します
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
  
  if (!name) return colors[0];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

/**
 * MonthlyCalendar Component
 * - タイムライン形式でのメンバー稼働状況表示
 * - 出勤日/休暇日の切り替え機能
 * - 有休・通休・欠勤のステータス表示対応
 */
const MonthlyCalendar = ({ 
  schedule, 
  staff, 
  tasks, 
  shiftPatterns, 
  initialYear, 
  initialMonth,
  onUpdateSchedule, 
  isAdmin 
}) => {
  const [viewMode, setViewMode] = useState('work'); // 'work' or 'holiday'
  
  // 親コンポーネントからの年月変更を反映
  const year = initialYear;
  const month = initialMonth;

  // ステータス定義
  const STATUS = {
    WORK: '出勤',
    SHIFT_OFF: 'シフト休',
    PAID_LEAVE: '有休',
    SPECIAL_LEAVE: '通休',
    ABSENCE: '欠勤',
  };

  // スケジュールデータから値を取得・正規化するヘルパー
  const getStatus = (staffId, day) => {
    if (!schedule) return '';
    
    const monthKey = `${year}-${month}`;
    const val = schedule[monthKey]?.[staffId]?.[day];

    if (val === undefined || val === null || val === '') return '';

    // オブジェクト型 ({ type: '有休', hours: 0 } など)
    if (typeof val === 'object' && val.type) {
      return val.type;
    }

    // 数値（稼働時間）
    if (typeof val === 'number') {
      return val > 0 ? STATUS.WORK : '';
    }

    // 文字列
    return val;
  };

  // 休暇（または未出勤）判定ロジック
  const isHolidayStatus = (status) => {
    if (!status) return true; // 未入力は休み扱いとする場合
    
    const s = String(status);
    return (
      s === STATUS.SHIFT_OFF || 
      s.includes(STATUS.PAID_LEAVE) || 
      s.includes(STATUS.SPECIAL_LEAVE) || 
      s.includes(STATUS.ABSENCE) ||
      s === '遅刻' ||
      s === '早退'
    );
  };

  // 出勤判定ロジック
  const isWorkStatus = (status, val) => {
    if (status === STATUS.WORK) return true;
    
    // シフト休等の文字列でなければ出勤とみなす
    if (!isHolidayStatus(status) && status !== '') return true;
    
    // オブジェクトでhours > 0なら出勤
    if (typeof val === 'object' && val?.hours > 0) return true;

    return false;
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayOfWeek = (day) => {
    const d = new Date(year, month - 1, day);
    return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4 font-sans mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          {year}年 {month}月
          <span className="text-sm font-normal text-slate-500 ml-2">メンバー稼働状況</span>
        </h2>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('work')}
            className={`px-4 py-1.5 text-xs rounded-md transition-all font-bold ${viewMode === 'work' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            出勤日
          </button>
          <button 
            onClick={() => setViewMode('holiday')}
            className={`px-4 py-1.5 text-xs rounded-md transition-all font-bold ${viewMode === 'holiday' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            休暇日
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex border rounded-xl bg-white shadow-sm overflow-hidden h-[500px]">
        {/* Fixed Sidebar */}
        <div className="flex flex-col w-24 flex-shrink-0 border-r bg-slate-50 z-10">
          <div className="h-10 border-b flex items-center justify-center font-bold text-slate-600 text-xs bg-slate-100">日付</div>
          <div className="flex-1 flex items-center justify-center font-bold text-slate-400 text-xs tracking-widest bg-slate-50" style={{ writingMode: 'vertical-rl' }}>
            メンバー一覧
          </div>
        </div>

        {/* Scrollable Timeline */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-300">
          <div className="flex min-w-max h-full">
            {daysArray.map(day => {
              const dayOfWeek = getDayOfWeek(day);
              const isWeekend = dayOfWeek === '日' || dayOfWeek === '土';
              
              const today = new Date();
              const isToday = today.getFullYear() === year && (today.getMonth() + 1) === month && today.getDate() === day;

              // メンバーの抽出
              const dayMembers = staff.filter(member => {
                const rawVal = schedule?.[`${year}-${month}`]?.[member.id]?.[day];
                const status = getStatus(member.id, day);
                
                if (viewMode === 'work') {
                  return isWorkStatus(status, rawVal);
                } else {
                  // 休暇モード: ステータスがあり、かつ休暇ステータスの人を表示
                  return isHolidayStatus(status) && status !== '';
                }
              });

              // 表示用にソート
              const sortedMembers = dayMembers.sort((a, b) => 
                String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true })
              );

              return (
                <div key={day} className={`w-36 border-r flex flex-col ${isToday ? 'bg-yellow-50/30' : ''}`}>
                  {/* Date Header */}
                  <div className={`h-10 border-b flex items-center justify-center text-xs font-bold 
                    ${isToday ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 
                      isWeekend ? 'bg-pink-50 text-pink-600' : 'bg-slate-50 text-slate-700'}`}>
                    {day} ({dayOfWeek})
                  </div>

                  {/* Members List */}
                  <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden content-start">
                    {sortedMembers.length > 0 ? (
                      sortedMembers.map((m) => {
                        const colors = getColorForName(m.name);
                        const status = getStatus(m.id, day);
                        // 休暇モードのときはステータス詳細を表示
                        const showStatus = viewMode === 'holiday' && status !== STATUS.SHIFT_OFF;

                        return (
                          <div 
                            key={`${day}-${m.id}`} 
                            className="flex-shrink-0 px-2 py-1 rounded text-[11px] border shadow-sm truncate font-medium flex justify-between items-center"
                            style={{ 
                              backgroundColor: colors.bg, 
                              borderColor: colors.border, 
                              color: colors.text 
                            }}
                          >
                            <span className="truncate">{m.name}</span>
                            {showStatus && (
                              <span className="text-[9px] bg-white/50 px-1 rounded ml-1 font-bold whitespace-nowrap text-slate-600">
                                {status.replace('有休', '有').replace('欠勤', '欠').replace('通休', '通')}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[10px] text-slate-300 text-center mt-4">-</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Footer Scroll Indicator */}
      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
        <div className="h-full bg-slate-300 w-1/3 rounded-full opacity-50"></div>
      </div>
    </div>
  );
};

export default MonthlyCalendar;
