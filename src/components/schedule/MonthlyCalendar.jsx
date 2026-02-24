import React, { useState, useMemo, useEffect, useRef } from 'react';
import { getJapaneseHolidays, formatDate } from '../../utils/dateUtils.js';
import { getColorForName } from '../../utils/styleUtils.js';
import { ChevronLeft, ChevronRight, TrashIcon } from '../common/Icons.jsx';
import DailyShiftDetailModal from './DailyShiftDetailModal.jsx';

const MonthlyCalendar = ({ schedule, staff, tasks, shiftPatterns, initialYear, initialMonth, onUpdateSchedule, isAdmin, currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date(initialYear, initialMonth - 1, 1));
  const [selectedDateDetail, setSelectedDateDetail] = useState(null);
  const [viewMode, setViewMode] = useState('active_shifts');
  const scrollContainerRef = useRef(null);

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

  // 現在の月の祝日を取得
  const holidays = useMemo(() => {
    return getJapaneseHolidays(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate]);

  // 初期表示時および月変更時にスクロール位置を調整
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const today = new Date();
    const todayStr = formatDate(today);
    
    // 表示中の月に今日が含まれているか確認
    const isCurrentMonth = today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth();

    if (isCurrentMonth) {
        // 今日が含まれる場合：今日の日付へスクロール
        setTimeout(() => {
            const container = scrollContainerRef.current;
            if (!container) return;

            const todayElement = container.querySelector(`[data-date="${todayStr}"]`);
            if (todayElement) {
                const containerWidth = container.clientWidth;
                const elementLeft = todayElement.offsetLeft;
                const elementWidth = todayElement.clientWidth;
                
                const scrollTo = elementLeft - (containerWidth / 2) + (elementWidth / 2);

                container.scrollTo({
                    left: scrollTo,
                    behavior: 'smooth'
                });
            }
        }, 100);
    } else {
        // 含まれない場合：先頭へスクロール
        scrollContainerRef.current.scrollLeft = 0;
    }
  }, [currentDate]);

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
            if (value === null || value === undefined || value === '') return;

            let displayText = value;
            let isHoliday = false;
            
            let valForCheck = value;
            if (typeof value === 'object' && value.type !== undefined) {
                 valForCheck = value.type;
            }

            const holidayKeywords = ['休', '欠', '通'];
            
            if (typeof valForCheck === 'string') {
                 if (holidayKeywords.some(kw => valForCheck.includes(kw)) || valForCheck === '0' || valForCheck === '0.0') {
                     isHoliday = true;
                 }
                 displayText = typeof value === 'object' ? 
                     (value.type === 'シフト休' ? 'シフト休' : `${value.type}${value.hours ? `(${value.hours})` : ''}`) 
                     : value;
            } else if (typeof valForCheck === 'number') {
                 if (valForCheck === 0) {
                     isHoliday = true;
                     displayText = '休';
                 } else {
                     displayText = `${valForCheck}h`;
                 }
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

  const getFilteredEvents = (dateKey) => {
      const dayEvents = events.filter(e => e.date === dateKey);
      
      if (viewMode === 'active_shifts') {
          return dayEvents.filter(e => !e.isHoliday && e.type !== '欠勤');
      } else if (viewMode === 'holidays') {
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
  
  const CELL_WIDTH = "100px"; 

  const getDayHeaderClass = (dayOfWeekIndex, isHoliday, isToday) => {
      let baseClasses = `sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b border-r whitespace-nowrap min-w-[${CELL_WIDTH}] w-[${CELL_WIDTH}] box-border flex-shrink-0 flex items-center justify-center`; 
      
      if (isToday) {
          return `${baseClasses} bg-yellow-100 text-yellow-900 border-yellow-300 shadow-inner ring-2 ring-yellow-300 ring-inset`;
      }

      if (dayOfWeekIndex === 6) {
           return `${baseClasses} bg-sky-100 text-sky-800 border-sky-200`;
      }
      if (dayOfWeekIndex === 0 || isHoliday) {
           return `${baseClasses} bg-pink-100 text-pink-800 border-pink-200`;
      }
      return `${baseClasses} bg-slate-100 text-slate-900 border-slate-300`;
  };

  const getTaskSummary = (dateKey) => {
      const dayEvents = events.filter(e => e.date === dateKey);
      const workingStaff = dayEvents.filter(e => !e.isHoliday && e.type !== '欠勤');
      
      return tasks ? tasks.map(task => {
          const assignedMembers = workingStaff.filter(ev => ev.tasks.includes(task.id));
          if (assignedMembers.length === 0) return null;
          return {
              name: task.name,
              count: assignedMembers.length,
              members: assignedMembers.map(m => m.userName)
          };
      }).filter(Boolean) : [];
  };

  const getCellBgClass = (dayOfWeekIndex, isHoliday, isToday) => {
      if (isToday) {
          return 'bg-yellow-50 hover:bg-yellow-100 ring-1 ring-inset ring-yellow-200';
      }
      if (dayOfWeekIndex === 0 || isHoliday) { 
          return 'bg-pink-50 hover:bg-pink-100';
      }
      if (dayOfWeekIndex === 6) { 
          return 'bg-sky-50 hover:bg-sky-100';
      }
      return 'bg-white hover:bg-slate-50'; 
  };

  return (
    <div className="mt-8 bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"><ChevronLeft size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight whitespace-nowrap">{currentDate.getFullYear()}年 {currentDate.getMonth()+1}月</h2>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"><ChevronRight size={24} /></button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
                onClick={() => setViewMode('active_shifts')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'active_shifts' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                出勤
            </button>
            <button
                onClick={() => setViewMode('holidays')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'holidays' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                休み
            </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="overflow-x-auto border border-slate-200 rounded-lg"
      >
        <div className="inline-block min-w-full align-middle">
            <div className="flex border-b border-slate-200">
                <div className="sticky left-0 z-40 bg-slate-200 p-2 border-r border-slate-300 font-semibold text-xs text-center min-w-[100px] w-[100px] flex-shrink-0 flex items-center justify-center box-border">
                    日付
                </div>
                {daysInMonth.map((d) => {
                    const dateKey = formatDate(d);
                    const dayOfWeekIndex = d.getDay();
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeekIndex];
                    const isHoliday = holidays.includes(d.getDate());
                    const isToday = dateKey === formatDate(new Date());

                    return (
                        <div 
                            key={d.toISOString()} 
                            data-date={dateKey}
                            className={getDayHeaderClass(dayOfWeekIndex, isHoliday, isToday)}
                        >
                            <div>{d.getDate()}</div>
                            <div className="ml-1">({dayOfWeek})</div>
                        </div>
                    );
                })}
            </div>

            <div className="flex">
                <div className="sticky left-0 z-30 bg-slate-50 p-2 border-r border-slate-300 font-semibold text-xs text-center min-w-[100px] w-[100px] flex-shrink-0 flex items-center justify-center border-b border-slate-200 box-border">
                    メンバー
                </div>
                
                {daysInMonth.map((d) => {
                    const dateKey = formatDate(d);
                    const isToday = dateKey === formatDate(new Date());
                    const dayOfWeekIndex = d.getDay();
                    const isHoliday = holidays.includes(d.getDate());
                    
                    let targetEvents = [];
                    let taskSummary = [];

                    if (viewMode === 'tasks') {
                        taskSummary = getTaskSummary(dateKey);
                    } else {
                        targetEvents = getFilteredEvents(dateKey);
                    }

                    const bgClass = getCellBgClass(dayOfWeekIndex, isHoliday, isToday);
                    
                    return (
                        <div 
                            key={dateKey} 
                            className={`border-r border-slate-200 min-w-[${CELL_WIDTH}] w-[${CELL_WIDTH}] p-1 valign-top transition-colors border-b border-slate-200 flex-shrink-0 box-border ${bgClass}`}
                            onClick={() => viewMode === 'tasks' ? handleDateClick(d, taskSummary) : handleDateClick(d, targetEvents)}
                        >
                            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto scrollbar-thin">
                                {viewMode === 'tasks' ? (
                                    taskSummary.length > 0 ? (
                                        taskSummary.map((t, idx) => (
                                            <div key={idx} className="p-1 bg-sky-50 rounded border border-sky-100 text-[9px]">
                                                <div className="font-bold text-sky-800 truncate">{t.name}</div>
                                                <div className="text-right text-xs font-bold text-sky-600">{t.count}名</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-[10px] text-slate-300 text-center py-4">-</div>
                                    )
                                ) : (
                                    targetEvents.length > 0 ? (
                                        targetEvents.map(ev => {
                                            const colors = getColorForName(ev.userName);
                                            const isDeletable = canDelete(ev);
                                            return (
                                                <div 
                                                    key={ev.id} 
                                                    className={`group relative flex items-center justify-between p-1.5 rounded text-[10px] border-l-2 shadow-sm hover:shadow-md transition-all cursor-pointer ${isToday ? 'bg-opacity-90' : 'bg-opacity-80 bg-white'}`}
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
                                                            <TrashIcon size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="text-[10px] text-slate-300 text-center py-4">-</div>
                                    )
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      <DailyShiftDetailModal 
          detail={selectedDateDetail}
          viewMode={viewMode}
          onClose={() => setSelectedDateDetail(null)}
          onDelete={handleDelete}
          canDelete={canDelete}
      />
    </div>
  );
};

export default MonthlyCalendar;
