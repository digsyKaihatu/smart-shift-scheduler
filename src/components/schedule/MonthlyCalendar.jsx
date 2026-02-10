import React, { useState, useMemo } from 'react';

/**
 * MonthlyCalendar Component
 * * 不具合修正: 
 * - 「出勤日/休暇日」の切り替えロジックを実装。
 * - 有休・通休・欠勤のメンバーを「休暇日」表示時に正しく抽出。
 * * デザイン再現:
 * - スクリーンショットに基づいた横スクロール・タイムライン形式。
 * - 左側ラベルを「メンバー一覧」に変更。
 */

const MonthlyCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 10)); // 画像に合わせて2026年2月に設定
  const [viewMode, setViewMode] = useState('work'); // 'work' (出勤日) or 'holiday' (休暇日)

  // メンバーとステータスのモックデータ
  const membersList = [
    { id: 1, name: '中村有志', color: 'bg-yellow-100 border-yellow-200 text-yellow-800' },
    { id: 2, name: '小林勇稀', color: 'bg-orange-100 border-orange-200 text-orange-800' },
    { id: 3, name: '池田学司', color: 'bg-yellow-100 border-yellow-200 text-yellow-800' },
    { id: 4, name: '中村理緒', color: 'bg-pink-100 border-pink-200 text-pink-800' },
    { id: 5, name: '安田絢美', color: 'bg-green-100 border-green-200 text-green-800' },
    { id: 6, name: '渡部翔太', color: 'bg-blue-100 border-blue-200 text-blue-800' },
    { id: 7, name: '竹内瑞保', color: 'bg-green-100 border-green-200 text-green-800' },
    { id: 8, name: '鈴木健大', color: 'bg-purple-100 border-purple-200 text-purple-800' },
    { id: 9, name: '山下大空', color: 'bg-blue-100 border-blue-200 text-blue-800' },
    { id: 10, name: '工藤大生', color: 'bg-pink-100 border-pink-200 text-pink-800' },
    { id: 11, name: '神前匠', color: 'bg-orange-100 border-orange-200 text-orange-800' },
    { id: 12, name: '市田進也', color: 'bg-green-100 border-green-200 text-green-800' },
    { id: 13, name: '坂井剛', color: 'bg-red-100 border-red-200 text-red-800' },
  ];

  const STATUS = {
    WORK: '出勤',
    PAID_LEAVE: '有休',
    SPECIAL_LEAVE: '通休',
    ABSENCE: '欠勤',
  };

  // 特定の日付のシフトデータを生成
  const getDailyData = (day) => {
    return membersList.map(member => {
      let status = STATUS.WORK;
      if (day % 11 === 0 && member.id === 1) status = STATUS.PAID_LEAVE;
      if (day === 11 && member.id === 2) status = STATUS.SPECIAL_LEAVE;
      if (day === 15 && member.id === 4) status = STATUS.ABSENCE;
      
      return { ...member, status };
    });
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayOfWeek = (day) => {
    const d = new Date(year, month, day);
    return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 p-4 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-lg shadow-sm border">
        <div className="flex items-center gap-4 ml-2">
          <button className="p-1 hover:bg-gray-100 rounded">&lt;</button>
          <h1 className="text-lg font-bold">{year}年 {month + 1}月</h1>
          <button className="p-1 hover:bg-gray-100 rounded">&gt;</button>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('work')}
            className={`px-4 py-1 text-xs rounded-md transition-all ${viewMode === 'work' ? 'bg-white shadow-sm text-orange-600 font-bold' : 'text-gray-500'}`}
          >
            出勤日
          </button>
          <button 
            onClick={() => setViewMode('holiday')}
            className={`px-4 py-1 text-xs rounded-md transition-all ${viewMode === 'holiday' ? 'bg-white shadow-sm text-orange-600 font-bold' : 'text-gray-500'}`}
          >
            休暇日
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden border rounded-xl bg-white shadow-sm">
        {/* Fixed Sidebar */}
        <div className="flex flex-col w-24 flex-shrink-0 border-r bg-gray-50">
          <div className="h-10 border-b flex items-center justify-center font-bold text-gray-600 text-xs">日付</div>
          <div className="flex-1 flex items-center justify-center font-bold text-gray-600 text-xs tracking-widest" style={{ writingMode: 'vertical-rl' }}>
            メンバー一覧
          </div>
        </div>

        {/* Scrollable Timeline */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-300">
          <div className="flex min-w-max h-full">
            {daysArray.map(day => {
              const dayOfWeek = getDayOfWeek(day);
              const isWeekend = dayOfWeek === '日' || dayOfWeek === '土';
              const isToday = day === 10;

              const allData = getDailyData(day);
              const filteredMembers = allData.filter(m => {
                const isLeaver = m.status === STATUS.PAID_LEAVE || m.status === STATUS.SPECIAL_LEAVE || m.status === STATUS.ABSENCE;
                return viewMode === 'work' ? !isLeaver : isLeaver;
              });

              return (
                <div key={day} className={`w-32 border-r flex flex-col ${isToday ? 'bg-yellow-50' : ''}`}>
                  {/* Date Header */}
                  <div className={`h-10 border-b flex items-center justify-center text-xs font-bold ${isToday ? 'bg-yellow-200 border-yellow-300' : isWeekend ? 'bg-pink-50 text-pink-600' : 'bg-blue-50/30'}`}>
                    {day} ({dayOfWeek})
                  </div>

                  {/* Members List */}
                  <div className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
                    {filteredMembers.length > 0 ? (
                      filteredMembers.map((m, i) => (
                        <div 
                          key={`${day}-${m.id}`} 
                          className={`flex-shrink-0 px-2 py-1 rounded text-[10px] border shadow-sm truncate font-medium ${m.color}`}
                        >
                          {m.name}
                          {viewMode === 'holiday' && <span className="ml-1 opacity-70">[{m.status}]</span>}
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] text-gray-300 text-center mt-4">なし</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Footer Scroll Indicator */}
      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-gray-400 w-1/3 rounded-full"></div>
      </div>
    </div>
  );
};

export default MonthlyCalendar;
