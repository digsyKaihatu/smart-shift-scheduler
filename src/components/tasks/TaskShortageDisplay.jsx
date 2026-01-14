import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

// -----------------------------------------------------------------------------
// インライン定義: インポートエラー回避のためコンポーネントを直接定義
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
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef(null);
  useEffect(() => { setCurrentValue(value); }, [value]);
  useEffect(() => { if (isEditing && !disabled) { inputRef.current?.focus(); } }, [isEditing]);
  const handleBlur = () => { if (currentValue.trim() !== value && currentValue.trim() !== '') { onUpdate(currentValue.trim()); } else { setCurrentValue(value); } setIsEditing(false); };
  if (isEditing) {
    return (
      <input ref={inputRef} type="text" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()} className="text-xs font-semibold text-slate-600 bg-white border border-sky-500 rounded p-1 w-full" />
    );
  }
  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`text-xs font-semibold text-slate-600 p-1 rounded ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-200'}`}>{value}</div>
  );
};

const TaskStaffSelector = ({ task, allStaff, assignedStaffIds, onUpdate, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const handleToggleStaff = (staffId) => {
    const newAssignedStaffIds = assignedStaffIds.includes(staffId) ? assignedStaffIds.filter(id => id !== staffId) : [...assignedStaffIds, staffId];
    onUpdate(task.id, newAssignedStaffIds);
  };
  const assignedStaffNames = allStaff.filter(s => assignedStaffIds.includes(s.id)).map(s => s.name).join(', ');
  const editorModal = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onMouseDown={(e) => e.stopPropagation()}>
            <header className="p-4 border-b border-slate-200"><h3 className="font-bold text-slate-800">{`「${task.name}」の担当者`}</h3></header>
            <main className="p-4 overflow-y-auto">
                <div className="flex gap-4 mb-3">
                    <button onClick={() => onUpdate(task.id, allStaff.map(s => s.id))} className="text-sm font-semibold text-[#D9824D] hover:underline">全て選択</button>
                    <button onClick={() => onUpdate(task.id, [])} className="text-sm font-semibold text-[#D9824D] hover:underline">全て解除</button>
                </div>
                <div className="space-y-1">
                    {allStaff.map(member => (
                        <label key={member.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                            <input type="checkbox" checked={assignedStaffIds.includes(member.id)} onChange={() => handleToggleStaff(member.id)} className="form-checkbox h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]" />
                            <span className="text-sm font-medium text-slate-700">{member.name}</span>
                        </label>
                    ))}
                </div>
            </main>
            <footer className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">完了</button>
            </footer>
        </div>
    </div>, document.body
  ) : null;
  return (
    <div className="w-full">
       <button onClick={() => !disabled && setIsOpen(true)} disabled={disabled} className={`w-full text-left p-1 rounded border flex justify-between items-center transition-colors ${disabled ? 'cursor-not-allowed bg-slate-100 border-slate-200' : 'bg-white border-slate-300 hover:border-[#F4B896] hover:bg-slate-50'}`}>
        <span className={`text-xs font-medium truncate ${assignedStaffNames ? 'text-slate-800' : 'text-slate-400'}`} title={assignedStaffNames || '担当者なし'}>{assignedStaffNames || '担当者を追加...'}</span>
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
    isAdmin, tasks, staff, days, holidays, taskCountsByDay, 
    onUpdateTask, onDeleteTask, onUpdateTaskStaff, onUpdateTaskPersonnel
}) => {
    const scrollContainerRef = useRef(null);
    const sortedStaff = useMemo(() => [...staff].sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true })), [staff]);

    // 今日の日付へ中央スクロールするロジック
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        
        // 外部から渡された days の情報を使って現在の表示年月を確認
        // (本来は props で year/month を受け取るのが望ましいが、days の先頭要素から推測可能)
        if (days.length > 0) {
            setTimeout(() => {
                const container = scrollContainerRef.current;
                const target = container?.querySelector(`[data-day-task="${today.getDate()}"]`);
                if (container && target) {
                    const containerWidth = container.clientWidth;
                    const targetLeft = target.offsetLeft;
                    const targetWidth = target.clientWidth;
                    const scrollLeft = targetLeft - (containerWidth / 2) + (targetWidth / 2);
                    container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
                }
            }, 150);
        }
    }, [days]);

    const getDayHeaderClass = (dayOfWeek, isHoliday, isToday) => {
        let baseClasses = "sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap";
        if (isToday) return `${baseClasses} bg-yellow-100 text-yellow-900 border-yellow-300 ring-2 ring-yellow-300 ring-inset`;
        if (dayOfWeek === '土') return `${baseClasses} bg-sky-100 text-sky-800 border-sky-200`;
        if (dayOfWeek === '日' || isHoliday) return `${baseClasses} bg-pink-100 text-pink-800 border-pink-200`;
        return `${baseClasses} bg-slate-100 text-slate-900 border-slate-300`;
    };

    const headerCellClass = "sticky top-0 z-40 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center";

    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-3">業務一覧</h2>
            <div className="flex overflow-hidden border border-slate-200 rounded-lg">
                {/* 固定エリア */}
                <div className="flex-shrink-0 z-20 bg-white border-r-2 border-slate-300 shadow-xl">
                    <div className="grid" style={{ gridTemplateColumns: '280px' }}>
                        <div className={headerCellClass}>業務</div>
                        {tasks.map((task) => {
                            const staffForTaskIds = staff.filter(s => s.possibleTasks.includes(task.id)).map(s => s.id);
                            const required = task.requiredPersonnel ?? 3;
                            return (
                                <div key={task.id} className="bg-slate-50 p-2 border-b border-slate-300 text-xs font-semibold text-slate-600 flex flex-col items-start justify-center gap-1 h-[88px]">
                                    <div className="flex items-center justify-between w-full">
                                        <EditableTaskName value={task.name} onUpdate={(newName) => onUpdateTask(task.id, newName)} disabled={!isAdmin} />
                                        {isAdmin && <button onMouseDown={() => onDeleteTask(task.id)} className="group ml-2 p-1 rounded-full hover:bg-red-100 flex-shrink-0"><DeleteIcon /></button>}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] w-full mb-1">
                                        <span className="text-slate-500">定員:</span>
                                        {isAdmin ? <input type="number" min="1" value={required} onChange={(e) => onUpdateTaskPersonnel(task.id, parseInt(e.target.value, 10))} className="w-10 p-0.5 border border-slate-300 rounded text-center" /> : <span className="font-medium">{required}名</span>}
                                        <span className="text-slate-500">名</span>
                                    </div>
                                    <TaskStaffSelector task={task} allStaff={sortedStaff} assignedStaffIds={staffForTaskIds} onUpdate={onUpdateTaskStaff} disabled={!isAdmin} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* スクロールエリア */}
                <div ref={scrollContainerRef} className="overflow-x-auto flex-grow bg-white">
                    <div className="grid relative" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(70px, 1fr))` }}>
                        {days.map(({ day, dayOfWeek }) => {
                            const isH = holidays.includes(day);
                            const today = new Date();
                            // 表示している年月が今日かどうかは App から props をもらうのが理想的ですが、days を基準に判定
                            const isT = today.getDate() === day; // 簡易判定。正確には年月一致が必要

                            return (
                                <div key={day} className={getDayHeaderClass(dayOfWeek, isH, isT)} data-day-task={day}>
                                    <div>{day}</div><div>{dayOfWeek}</div>
                                </div>
                            )
                        })}
                        {tasks.map((task) => (
                            <React.Fragment key={task.id}>
                                {days.map(({ day, dayOfWeek }) => {
                                    const isHoliday = holidays.includes(day);
                                    const count = taskCountsByDay?.[day]?.[task.id];
                                    const required = task.requiredPersonnel ?? 3;
                                    let content = '-';
                                    let className = "p-2 border-b border-r text-center text-xs font-bold flex items-center justify-center h-[88px] ";

                                    if (!(isHoliday || dayOfWeek === '日' || dayOfWeek === '土') && count !== undefined) {
                                        if (count >= required) {
                                            content = `${count}人`;
                                            className += 'text-slate-800 bg-slate-50';
                                        } else {
                                            content = `不足 (${count}/${required})`;
                                            const ratio = count / required;
                                            className += ratio <= 0.3 ? 'text-red-600 bg-red-100' : ratio <= 0.6 ? 'text-orange-600 bg-orange-100' : 'text-yellow-600 bg-yellow-100';
                                        }
                                    } else {
                                        className += 'text-slate-400 bg-slate-50';
                                    }
                                    className += dayOfWeek === '土' ? ' border-sky-200' : (dayOfWeek === '日' || isHoliday) ? ' border-pink-200' : ' border-slate-300';
                                    return <div key={`${task.id}-${day}`} className={className}>{content}</div>;
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskShortageDisplay;
