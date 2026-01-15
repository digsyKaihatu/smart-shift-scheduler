import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../common/Icons';

const TaskStaffSelector = ({ task, allStaff, assignedStaffIds, onUpdate, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggleStaff = (staffId) => {
    const newAssignedStaffIds = assignedStaffIds.includes(staffId)
      ? assignedStaffIds.filter(id => id !== staffId)
      : [...assignedStaffIds, staffId];
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
    .filter(s => assignedStaffIds.includes(s.id))
    .map(s => s.name)
    .join(', ');

  const buttonText = assignedStaffNames || '担当者を追加...';
  const textColor = assignedStaffNames ? 'text-slate-800' : 'text-slate-400';
  
  // ポータルを使用したドロップダウン（モーダル）部分
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
                                checked={assignedStaffIds.includes(member.id)}
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
        aria-haspopup="true"
        aria-expanded={isOpen}
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

export default TaskStaffSelector;
