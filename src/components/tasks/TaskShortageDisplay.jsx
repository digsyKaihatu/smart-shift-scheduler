import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DailyShiftDetailModal from '../schedule/DailyShiftDetailModal';
import { formatValue } from '../../utils/dateUtils';

// -----------------------------------------------------------------------------
// インライン定義: 内部コンポーネントも安全に修正
// -----------------------------------------------------------------------------

const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: '20px', minWidth: '20px' }} className="text-slate-400 group-hover:text-red-600 transition-colors pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
    </svg>
);

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
        className="text-xs font-semibold text-slate-600 bg-white border border-sky-500 rounded p-1 w-full"
      />
    );
  }

  return (
    <div
      onClick={() => !disabled && setIsEditing(true)}
      className={`text-xs font-semibold text-slate-600 p-1 rounded ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-200'}`}
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

  const buttonText = assignedStaffNames || '担当者を追加...';
  const textColor = assignedStaffNames ? 'text-slate-800' : 'text-slate-400';
  
  const editorModal = isOpen ? createPortal(
    <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
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
    <div className="w-full">
       <button
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`w-full text-left p-1 rounded border flex justify-between items-center transition-colors ${disabled ? 'cursor-not-allowed bg-slate-100 border-slate-200' : 'bg-white border-slate-300 hover:border-[#F4B896] hover:bg-slate-50'}`}
      >
        <span className={`text-xs font-medium truncate ${textColor}`} title={assignedStaffNames || '担当者なし'}>
          {buttonText}
        </span>
        {!disabled && <ChevronDownIcon />}
      </button>
      {editorModal}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

const TaskShortageDisplay = ({
    tasks = [], staff = [], days = [], holidays = [], taskCountsByDay = {}, 
    isAdmin = false,
    onUpdateTask, onDeleteTask, onUpdateTaskStaff, onUpdateTaskPersonnel,
    year, month,
    schedule // MainContentから渡されるスケジュールデータ
}) => {
    const staffInfoWidth = "280px"; 
    const scrollContainerRef = useRef(null); 
    const [selectedDetail, setSelectedDetail] = useState(null);

    // 追加: 自動スクロールロジック
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        if (!days || days.length === 0) return;

        const today = new Date();
        // 現在の年月と表示中の年月が一致する場合のみスクロールを実行
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
        // スケジュールデータがなければ処理中断
        if (!schedule) return;

        // そのタスクを担当している（possibleTasksに含まれる）スタッフIDリスト
        const possibleStaffIds = staff
            .filter(s => (s.possibleTasks || []).includes(task.id))
            .map(s => s.id);

        const workingMembers = [];

        // 全スタッフをループして、出勤判定を行う
        staff.forEach(s => {
            // 担当可能でなければスキップ
            if (!possibleStaffIds.includes(s.id)) return;

            const entry = schedule[s.id]?.[day];
            
            // 出勤判定（MainContent等のロジックと同様）
            const isWorking = (typeof entry === 'number' && entry > 0) || (typeof entry === 'object' && entry?.hours > 0);

            if (isWorking) {
                // 表示用のデータを構築
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

        // モーダル表示用のデータをセット
        setSelectedDetail({
            date: new Date(year, month - 1, day),
            title: `${task.name} - 出勤者リスト`, // モーダルタイトル用（DailyShiftDetailModal側で対応が必要だが、簡易的に既存プロップを使う）
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
                                    <div className="sticky left-0 z-20 bg-slate-50 p-2 border-b border-r border-slate-300 text-xs font-semibold text-slate-600 flex flex-col items-start justify-center gap-1 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between w-full">
                                                <EditableTaskName
                                                    value={task.name}
                                                    onUpdate={(newName) => onUpdateTask?.(task.id, newName)}
                                                    disabled={!isAdmin}
                                                />
                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onDeleteTask?.(task.id)}
                                                        className="group ml-2 p-1 rounded-full hover:bg-red-100"
                                                    >
                                                        <DeleteIcon />
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-1 text-[10px] w-full mb-1">
                                                <span className="text-slate-500 whitespace-nowrap">定員:</span>
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

                                            <TaskStaffSelector
                                                task={task}
                                                allStaff={sortedStaff}
                                                assignedStaffIds={staffForTaskIds}
                                                onUpdate={onUpdateTaskStaff}
                                                disabled={!isAdmin}
                                            />
                                    </div>
                                    
                                    {days.map(({ day, dayOfWeek }) => {
                                        const isHoliday = holidays.includes(day);
                                        const count = taskCountsByDay?.[day]?.[task.id];
                                        let content;
                                        let className = "p-2 border-b text-center text-xs font-bold z-10 flex items-center justify-center border-r ";
                                        // クリック可能なセルにはカーソルポインターを追加
                                        let isClickable = false;

                                        if (isHoliday || dayOfWeek === '日' || dayOfWeek === '土') {
                                            content = '-';
                                            className += 'text-slate-400 bg-slate-50 border-slate-200';
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

            {/* 詳細表示モーダル */}
            <DailyShiftDetailModal 
                detail={selectedDetail}
                viewMode="active_shifts"
                onClose={() => setSelectedDetail(null)}
                onDelete={() => {}} // 削除機能は無効化（または必要に応じて実装）
                canDelete={() => false}
            />
        </div>
    );
};

export default TaskShortageDisplay;
