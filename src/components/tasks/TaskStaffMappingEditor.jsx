import React, { useState, useEffect } from 'react';

const TaskStaffMappingEditor = ({ staff = [], tasks = [], onClose, onSave }) => {
  const [taskStaffMap, setTaskStaffMap] = useState({});

  useEffect(() => {
    const initialMap = {};
    tasks.forEach(task => {
      initialMap[task.id] = staff
        .filter(s => (s.possibleTasks || []).includes(task.id))
        .map(s => s.id);
    });
    setTaskStaffMap(initialMap);
  }, [staff, tasks]);

  const handleStaffToggle = (taskId, staffId) => {
    setTaskStaffMap(prevMap => {
      const currentAssigned = prevMap[taskId] || [];
      const isAssigned = currentAssigned.includes(staffId);
      const newAssigned = isAssigned
        ? currentAssigned.filter(id => id !== staffId)
        : [...currentAssigned, staffId];
      return { ...prevMap, [taskId]: newAssigned };
    });
  };

  const handleSave = () => {
    onSave(taskStaffMap);
  };
  
  const handleSelectAll = (taskId) => {
     setTaskStaffMap(prevMap => ({
         ...prevMap,
         [taskId]: staff.map(s => s.id)
     }));
  }

  const handleDeselectAll = (taskId) => {
      setTaskStaffMap(prevMap => ({
         ...prevMap,
         [taskId]: []
     }));
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">業務担当の一括設定</h2>
          <p className="text-sm text-slate-500">業務ごとに、担当可能なメンバーを選択してください。</p>
        </header>

        <main className="p-4 overflow-y-auto flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(task => (
              <div key={task.id} className="border border-slate-200 rounded-md p-3">
                <h3 className="font-bold text-sm text-slate-700 mb-2 pb-2 border-b">{task.name}</h3>
                <div className="flex gap-2 mb-2">
                    <button onClick={() => handleSelectAll(task.id)} className="text-xs text-[#D9824D] hover:underline">全て選択</button>
                    <button onClick={() => handleDeselectAll(task.id)} className="text-xs text-[#D9824D] hover:underline">全て解除</button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                  {staff.map(member => (
                    <label key={member.id} className="flex items-center space-x-2 p-1 rounded hover:bg-slate-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(taskStaffMap[task.id] || []).includes(member.id)}
                        onChange={() => handleStaffToggle(task.id, member.id)}
                        className="form-checkbox h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]"
                      />
                      <span className="text-xs font-medium text-slate-700">{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
        
        <footer className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">
            キャンセル
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">
            保存して閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TaskStaffMappingEditor;
