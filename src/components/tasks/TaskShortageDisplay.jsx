import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', minWidth: '16px' }} className="text-slate-400 group-hover:text-red-600 transition-colors pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
    </svg>
);

const CalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 hover:text-[#D9824D] transition-colors">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
);

const XIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// インラインモーダル（外部ファイルのインポートエラーを回避するため追加）
const TaskDetailModal = ({ detail, onClose }) => {
    if (!detail) return null;
    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4" onMouseDown={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]" onMouseDown={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">{detail.title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XIcon size={20} />
                    </button>
                </header>
                <main className="p-4 overflow-y-auto">
                    {detail.events && detail.events.length > 0 ? (
                        <ul className="space-y-2">
                            {detail.events.map(ev => (
                                <li key={ev.id} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-200 rounded">
                                    <span className="font-medium text-slate-700">{ev.userName}</span>
                                    <span className="text-xs font-bold px-2 py-1 bg-sky-100 text-sky-800 rounded">{ev.type}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">該当する出勤者はいません</p>
                    )}
                </main>
            </div>
        </div>,
        document.body
    );
};

const isTaskActiveOnDay = (task, day, month, year, isHoliday, dayOfWeekIndex) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const config = task.scheduleConfig;
    
    if (!config) {
        return !(isHoliday || dayOfWeekIndex === 0 || dayOfWeekIndex === 6);
    }
    
    if (config.excludeDates?.includes(dateStr)) return false;
    if (config.specificDates?.includes(dateStr)) return true;
    if (isHoliday && !config.includeHolidays) return false;
    
    return config.daysOfWeek.includes(dayOfWeekIndex);
};

const TaskScheduleConfigModal = ({ task, onClose, onSave }) => {
    const defaultConfig = {
        daysOfWeek: [1, 2, 3, 4, 5],
        includeHolidays: false,
        specificDates: [],
        excludeDates: []
    };
    
    const [config, setConfig] = useState(task.scheduleConfig || defaultConfig);
    const [specificDateInput, setSpecificDateInput] = useState('');
    const [excludeDateInput, setExcludeDateInput] = useState('');
    
    const handleDayToggle = (dayIndex) => {
        setConfig(prev => ({
            ...prev,
            daysOfWeek: prev.daysOfWeek.includes(dayIndex)
                ? prev.daysOfWeek.filter(d => d !== dayIndex)
                : [...prev.daysOfWeek, dayIndex].sort()
        }));
    };
    
    const handleAddDate = (type, dateStr, setInput) => {
        if (!dateStr) return;
        setConfig(prev => {
            const list = prev[type] || [];
            if (list.includes(dateStr)) return prev;
            return { ...prev, [type]: [...list, dateStr].sort() };
        });
        setInput('');
    };
    
    const handleRemoveDate = (type, dateStr) => {
        setConfig(prev => ({
            ...prev,
            [type]: prev[type].filter(d => d !== dateStr)
        }));
    };

    const daysList = ['日', '月', '火', '水', '木', '金', '土'];
    
    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" onMouseDown={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">「{task.name}」の稼働日設定</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XIcon size={20} />
                    </button>
                </header>
                <main className="p-5 overflow-y-auto space-y-6">
                    <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2">基本の稼働曜日</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {daysList.map((day, idx) => (
                                <label key={idx} className={`flex items-center justify-center w-10 h-10 rounded-full border cursor-pointer transition-colors ${config.daysOfWeek.includes(idx) ? 'bg-[#F4B896] border-[#F4B896] text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="hidden" 
                                        checked={config.daysOfWeek.includes(idx)}
                                        onChange={() => handleDayToggle(idx)}
                                    />
                                    <span className="text-sm font-bold">{day}</span>
                                </label>
                            ))}
                        </div>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={config.includeHolidays}
                                onChange={(e) => setConfig(prev => ({ ...prev, includeHolidays: e.target.checked }))}
                                className="form-checkbox h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]"
                            />
                            <span className="text-sm text-slate-700 font-medium">祝日も稼働する</span>
                        </label>
                    </div>
                    
                    <div className="border-t border-slate-200 pt-4">
                        <h4 className="text-sm font-bold text-slate-700 mb-1">特定日の追加稼働</h4>
                        <p className="text-xs text-slate-500 mb-2">基本設定で休みの日でも、指定した日は稼働扱いになります。</p>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="date" 
                                value={specificDateInput}
                                onChange={e => setSpecificDateInput(e.target.value)}
                                className="flex-1 p-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-[#F4B896]"
                            />
                            <button 
                                onClick={() => handleAddDate('specificDates', specificDateInput, setSpecificDateInput)}
                                className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-bold rounded hover:bg-slate-300"
                            >
                                追加
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {config.specificDates.map(d => (
                                <span key={d} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    {d}
                                    <button onClick={() => handleRemoveDate('specificDates', d)} className="hover:text-red-600"><XIcon size={12} /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                        <h4 className="text-sm font-bold text-slate-700 mb-1">特定日の除外（休み）</h4>
                        <p className="text-xs text-slate-500 mb-2">基本設定で稼働の日でも、指定した日は休み扱いになります。</p>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="date" 
                                value={excludeDateInput}
                                onChange={e => setExcludeDateInput(e.target.value)}
                                className="flex-1 p-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-[#F4B896]"
                            />
                            <button 
                                onClick={() => handleAddDate('excludeDates', excludeDateInput, setExcludeDateInput)}
                                className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-bold rounded hover:bg-slate-300"
                            >
                                追加
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {config.excludeDates.map(d => (
                                <span key={d} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                                    {d}
                                    <button onClick={() => handleRemoveDate('excludeDates', d)} className="hover:text-red-600"><XIcon size={12} /></button>
                                </span>
                            ))}
                        </div>
                    </div>
                </main>
                <footer className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">キャンセル</button>
                    <button onClick={() => onSave(config)} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">保存</button>
                </footer>
            </div>
        </div>,
        document.body
    );
};

const EditableTaskName = ({ value, onUpdate, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setCurrentValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && !disabled) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (currentValue.trim() !== value && currentValue.trim() !== '') {
      onUpdate(currentValue.trim());
    } else {
        setCurrentValue(value || '');
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setCurrentValue(value || '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="text-sm font-bold text-slate-700 bg-white border border-sky-500 rounded p-1 w-full"
      />
    );
  }

  return (
    <div
      onClick={() => !disabled && setIsEditing(true)}
      className={`text-sm font-bold text-slate-700 p-1 rounded truncate w-full ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-200'}`}
      title={value || '名称未設定'}
    >
      {value || '名称未設定'}
    </div>
  );
};

const TaskStaffSelector = ({ task, allStaff = [], assignedStaffIds = [], onUpdate, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeAssignedStaffIds = assignedStaffIds || [];

  const handleToggleStaff = (staffId) => {
    const newAssignedStaffIds = safeAssignedStaffIds.includes(staffId)
      ? safeAssignedStaffIds.filter(id => id !== staffId)
      : [...safeAssignedStaffIds, staffId];
    onUpdate(task.id, newAssignedStaffIds);
  };

  const handleSelectAll = () => {
    const allStaffIds = allStaff.map(s => s.id);
    onUpdate(task.id, allStaffIds);
  };

  const handleDeselectAll = () => {
    onUpdate(task.id, []);
  };

  const assignedStaffNames = allStaff
    .filter(s => safeAssignedStaffIds.includes(s.id))
    .map(s => s.name)
    .join(', ');

  const buttonText = assignedStaffNames || '担当追加...';
  const textColor = assignedStaffNames ? 'text-slate-800' : 'text-slate-400';
  
  const editorModal = isOpen ? createPortal(
    <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
        onMouseDown={() => setIsOpen(false)}
    >
        <div 
            className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <header className="p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">{`「${task.name}」の担当者`}</h3>
            </header>
            <main className="p-4 overflow-y-auto">
                <div className="flex gap-4 mb-3">
                    <button onClick={handleSelectAll} className="text-sm font-semibold text-[#D9824D] hover:underline">全て選択</button>
                    <button onClick={handleDeselectAll} className="text-sm font-semibold text-[#D9824D] hover:underline">全て解除</button>
                </div>
                <div className="space-y-1">
                    {allStaff.map(member => (
                        <label key={member.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={safeAssignedStaffIds.includes(member.id)}
                                onChange={() => handleToggleStaff(member.id)}
                                className="form-checkbox h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]"
                            />
                            <span className="text-sm font-medium text-slate-700">{member.name}</span>
                        </label>
                    ))}
                </div>
            </main>
            <footer className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">
                    完了
                </button>
            </footer>
        </div>
    </div>,
    document.body
  ) : null;
  
  return (
    <div className="w-full h-full flex items-center">
       <button
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`w-full text-left px-1.5 py-0.5 rounded border flex justify-between items-center transition-colors ${disabled ? 'cursor-not-allowed bg-slate-100 border-slate-200' : 'bg-white border-slate-300 hover:border-[#F4B896] hover:bg-slate-50'}`}
      >
        <span className={`text-[10px] font-medium truncate ${textColor}`} title={assignedStaffNames || '担当者なし'}>
          {buttonText}
        </span>
        {!disabled && <ChevronDownIcon />}
      </button>
      {editorModal}
    </div>
  );
};

const TaskShortageDisplay = ({
    tasks = [], staff = [], days = [], holidays = [], taskCountsByDay = {}, 
    isAdmin = false,
    onUpdateTask, onDeleteTask, onUpdateTaskStaff, onUpdateTaskPersonnel,
    year, month,
    schedule 
}) => {
    const staffInfoWidth = "280px"; 
    const scrollContainerRef = useRef(null); 
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [configModalTask, setConfigModalTask] = useState(null);

    // 自動スクロールロジック
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        if (!days || days.length === 0) return;

        const today = new Date();
        if (today.getFullYear() === year && (today.getMonth() + 1) === month) {
            const todayDate = today.getDate();
            const targetElement = scrollContainerRef.current.querySelector(`[data-day="${todayDate}"]`);
            
            if (targetElement) {
                const fixedColumnWidth = 280;
                const elementLeft = targetElement.offsetLeft;
                const elementWidth = targetElement.offsetWidth;
                const containerWidth = scrollContainerRef.current.clientWidth;
                const visibleWidth = containerWidth - fixedColumnWidth;
                const scrollLeft = (elementLeft - fixedColumnWidth) - (visibleWidth / 2 - elementWidth / 2);
                
                scrollContainerRef.current.scrollTo({
                    left: Math.max(0, scrollLeft),
                    behavior: 'smooth'
                });
            }
        }
    }, [year, month, days]);
    
    const sortedStaff = useMemo(() => {
        return [...staff].sort((a, b) => {
            const idA = a.employeeId || '';
            const idB = b.employeeId || '';
            return String(idA).localeCompare(String(idB), undefined, { numeric: true });
        });
    }, [staff]);
    
    const handleCellClick = (day, task) => {
        if (!schedule) return;

        const possibleStaffIds = staff
            .filter(s => (s.possibleTasks || []).includes(task.id))
            .map(s => s.id);

        const workingMembers = [];

        staff.forEach(s => {
            if (!possibleStaffIds.includes(s.id)) return;

            const entry = schedule[s.id]?.[day];
            const isWorking = (typeof entry === 'number' && entry > 0) || (typeof entry === 'object' && entry?.hours > 0);

            if (isWorking) {
                let displayText = '';
                if (typeof entry === 'object' && entry.type) {
                    displayText = entry.type === 'シフト休' ? 'シフト休' : `${entry.type}${entry.hours ? `(${entry.hours})` : ''}`;
                } else if (typeof entry === 'number') {
                    displayText = `${entry}h`;
                }

                workingMembers.push({
                    id: `${s.id}-${day}`,
                    staffId: s.id,
                    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                    userName: s.name,
                    type: displayText,
                    rawValue: entry
                });
            }
        });

        setSelectedDetail({
            date: new Date(year, month - 1, day),
            title: `${task.name} - 出勤者リスト`, 
            events: workingMembers
        });
    };

    const getDayHeaderClass = (dayOfWeek, isHoliday) => {
        let baseClasses = "sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap";
        if (dayOfWeek === '土') return `${baseClasses} bg-sky-100 text-sky-800 border-sky-200`;
        if (dayOfWeek === '日' || isHoliday) return `${baseClasses} bg-pink-100 text-pink-800 border-pink-200`;
        return `${baseClasses} bg-slate-100 text-slate-900 border-slate-300`;
    };

    const stickyHeaderCellClass = "sticky top-0 z-40 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center";

    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-3">業務一覧</h2>
            <div 
                className="overflow-x-auto" 
                ref={scrollContainerRef} 
            >
                 <div className="min-w-max">
                    <div className="grid" style={{ gridTemplateColumns: `${staffInfoWidth} repeat(${days.length}, minmax(70px, 1fr))`}}>
                        <div className={`${stickyHeaderCellClass} sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>業務</div>
                         {days.map(({ day, dayOfWeek }) => (
                            <div 
                                key={day} 
                                className={getDayHeaderClass(dayOfWeek, holidays.includes(day))}
                                data-day={day} 
                            >
                                <div>{day}</div>
                                <div>{dayOfWeek}</div>
                            </div>
                        ))}

                        {tasks.map((task) => {
                             const staffForTaskIds = staff
                                .filter(s => (s.possibleTasks || []).includes(task.id))
                                .map(s => s.id);
                             const required = task.requiredPersonnel ?? 3;

                            return (
                                <React.Fragment key={task.id}>
                                    <div className="sticky left-0 z-20 bg-slate-50 p-2 border-b border-r border-slate-300 text-xs font-semibold text-slate-600 flex flex-col justify-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            
                                            {/* 1段目: 業務名と削除ボタン */}
                                            <div className="flex items-center justify-between w-full mb-1.5 gap-1">
                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfigModalTask(task)}
                                                        className="p-1 rounded hover:bg-slate-200 flex-shrink-0"
                                                        title="稼働日・曜日設定"
                                                    >
                                                        <CalendarIcon />
                                                    </button>
                                                )}
                                                <div className="flex-1 min-w-0 pr-1">
                                                    <EditableTaskName
                                                        value={task.name}
                                                        onUpdate={(newName) => onUpdateTask?.(task.id, { name: newName })}
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onDeleteTask?.(task.id)}
                                                        className="group p-1 rounded-full hover:bg-red-100 flex-shrink-0"
                                                    >
                                                        <DeleteIcon />
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {/* 2段目: 定員と担当者プルダウンを1列に */}
                                            <div className="flex items-center justify-between w-full gap-2">
                                                <div className="flex items-center gap-1 text-[10px] whitespace-nowrap flex-shrink-0">
                                                    <span className="text-slate-500">定員:</span>
                                                    {isAdmin ? (
                                                        <input 
                                                            type="number" 
                                                            min="1"
                                                            value={required}
                                                            onChange={(e) => onUpdateTaskPersonnel?.(task.id, parseInt(e.target.value, 10))}
                                                            className="w-10 p-0.5 border border-slate-300 rounded text-center"
                                                        />
                                                    ) : (
                                                        <span className="font-medium">{required}名</span>
                                                    )}
                                                    <span className="text-slate-500">名</span>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <TaskStaffSelector
                                                        task={task}
                                                        allStaff={sortedStaff}
                                                        assignedStaffIds={staffForTaskIds}
                                                        onUpdate={onUpdateTaskStaff}
                                                        disabled={!isAdmin}
                                                    />
                                                </div>
                                            </div>

                                    </div>
                                    
                                    {days.map(({ day, dayOfWeek }) => {
                                        const isHoliday = holidays.includes(day);
                                        const dayOfWeekIndex = ['日', '月', '火', '水', '木', '金', '土'].indexOf(dayOfWeek);
                                        const count = taskCountsByDay?.[day]?.[task.id];
                                        
                                        const isTaskActive = isTaskActiveOnDay(task, day, month, year, isHoliday, dayOfWeekIndex);
                                        
                                        let content;
                                        let className = "p-2 border-b text-center text-xs font-bold z-10 flex items-center justify-center border-r ";
                                        // クリック可能なセルにはカーソルポインターを追加
                                        let isClickable = false;

                                        if (!isTaskActive) {
                                            content = '-';
                                            className += 'text-slate-400 bg-slate-200 border-slate-300 shadow-inner opacity-70';
                                        } else if (count === undefined) {
                                            content = '-';
                                            className += 'text-slate-400 bg-slate-50 border-slate-300';
                                        } else {
                                            isClickable = true;
                                            if (count >= required) {
                                                content = `${count}人`;
                                                className += 'text-slate-800 bg-slate-50 border-slate-300 hover:bg-slate-100 cursor-pointer';
                                            } else {
                                                content = `不足 (${count}/${required})`;
                                                className += count/required <= 0.3 ? 'text-red-600 bg-red-100 hover:bg-red-200' : count/required <= 0.6 ? 'text-orange-600 bg-orange-100 hover:bg-orange-200' : 'text-yellow-600 bg-yellow-100 hover:bg-yellow-200';
                                                className += ' border-slate-300 cursor-pointer';
                                            }
                                        }
                                        return (
                                            <div 
                                                key={`${task.id}-${day}`} 
                                                className={className}
                                                onClick={() => isClickable && handleCellClick(day, task)}
                                            >
                                                {content}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* 詳細表示モーダル（インラインに置換） */}
            <TaskDetailModal 
                detail={selectedDetail}
                onClose={() => setSelectedDetail(null)}
            />

            {/* 稼働日設定モーダル */}
            {configModalTask && (
                <TaskScheduleConfigModal
                    task={configModalTask}
                    onClose={() => setConfigModalTask(null)}
                    onSave={(newConfig) => {
                        onUpdateTask?.(configModalTask.id, { scheduleConfig: newConfig });
                        setConfigModalTask(null);
                    }}
                />
            )}
        </div>
    );
};

export default TaskShortageDisplay;
