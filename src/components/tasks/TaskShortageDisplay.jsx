import React from 'react';
import { DeleteIcon } from '../common/Icons.jsx';
import { EditableTaskName } from '../common/EditableCells.jsx';
import TaskStaffSelector from './TaskStaffSelector.jsx';

const TaskShortageDisplay = ({
    currentUser, isAdmin, 
    tasks, staff, days, holidays, taskCountsByDay, 
    onUpdateTask, onDeleteTask, onUpdateTaskStaff, onUpdateTaskPersonnel
}) => {
    const staffInfoWidth = "280px"; 
    
    const getDayHeaderClass = (dayOfWeek, isHoliday) => {
        let baseClasses = "sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap";
        if (dayOfWeek === '土') {
            return `${baseClasses} bg-sky-100 text-sky-800 border-sky-200`;
        }
        if (dayOfWeek === '日' || isHoliday) {
            return `${baseClasses} bg-pink-100 text-pink-800 border-pink-200`;
        }
        return `${baseClasses} bg-slate-100 text-slate-900 border-slate-300`;
    };

    const getCellBorderClass = (dayOfWeek, isHoliday) => {
        if (dayOfWeek === '土') return 'border-sky-200';
        if (dayOfWeek === '日' || isHoliday) return 'border-pink-200';
        return 'border-slate-300';
    }

    const stickyHeaderCellClass = "sticky top-0 z-40 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center";

    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-3">業務一覧</h2>
            {/* スクロール制限（overflow-auto, maxHeight）を削除しました */}
            <div>
                 <div className="min-w-max">
                    <div className="grid" style={{ gridTemplateColumns: `${staffInfoWidth} repeat(${days.length}, minmax(70px, 1fr))`}}>
                        
                        <div className={`${stickyHeaderCellClass} sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>業務</div>
                        
                         {days.map(({ day, dayOfWeek }) => {
                            const isHoliday = holidays.includes(day);
                            return (
                                <div key={day} className={getDayHeaderClass(dayOfWeek, isHoliday)}>
                                <div>{day}</div>
                                <div>{dayOfWeek}</div>
                                </div>
                            )
                        })}

                        {tasks.map((task) => {
                             const staffForTaskIds = staff.filter(s => s.possibleTasks.includes(task.id)).map(s => s.id);
                             const required = task.requiredPersonnel ?? 3;

                            return (
                                <React.Fragment key={task.id}>
                                    <div className="sticky left-0 z-20 bg-slate-50 p-2 border-b border-r border-slate-300 text-xs font-semibold text-slate-600 flex flex-col items-start justify-center gap-1 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between w-full">
                                            <EditableTaskName
                                                value={task.name}
                                                onUpdate={(newName) => onUpdateTask(task.id, newName)}
                                                disabled={!isAdmin}
                                            />
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    onMouseDown={() => onDeleteTask(task.id)}
                                                    className="group ml-2 p-1 rounded-full hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 flex-shrink-0"
                                                    aria-label={`${task.name}を削除`}
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
                                                        onChange={(e) => onUpdateTaskPersonnel(task.id, parseInt(e.target.value, 10))}
                                                        className="w-10 p-0.5 border border-slate-300 rounded text-center focus:ring-1 focus:ring-[#F4B896] outline-none"
                                                    />
                                                ) : (
                                                    <span className="font-medium">{required}名</span>
                                                )}
                                                <span className="text-slate-500">名</span>
                                            </div>

                                            <TaskStaffSelector
                                                task={task}
                                                allStaff={staff}
                                                assignedStaffIds={staffForTaskIds}
                                                onUpdate={onUpdateTaskStaff}
                                                disabled={!isAdmin}
                                            />
                                    </div>
                                    
                                    {days.map(({ day, dayOfWeek }) => {
                                        const isHoliday = holidays.includes(day);
                                        const count = taskCountsByDay?.[day]?.[task.id];
                                        let content;
                                        let className = "p-2 border-b text-center text-xs font-bold z-10 flex items-center justify-center ";

                                        if (isHoliday || dayOfWeek === '日' || dayOfWeek === '土') {
                                            content = '-';
                                            className += 'text-slate-400 bg-slate-50';
                                        } else if (count === undefined) {
                                            content = '-';
                                            className += 'text-slate-400 bg-slate-50';
                                        } else {
                                            if (count >= required) {
                                                content = `${count}人`;
                                                className += 'text-slate-800 bg-slate-50';
                                            } else {
                                                content = `不足 (${count}/${required})`;
                                                const ratio = count / required;
                                                if (ratio <= 0.3) {
                                                    className += 'text-red-600 bg-red-100';
                                                } else if (ratio <= 0.6) {
                                                    className += 'text-orange-600 bg-orange-100';
                                                } else {
                                                    className += 'text-yellow-600 bg-yellow-100';
                                                }
                                            }
                                        }
                                        className += ` border-r ${getCellBorderClass(dayOfWeek, isHoliday)}`;
                                        return <div key={`${task.id}-${day}`} className={className}>{content}</div>;
                                    })}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskShortageDisplay;
