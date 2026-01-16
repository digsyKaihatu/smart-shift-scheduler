import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * シフト表内での基本パターン編集コンポーネント (v1)
 * 休憩の有無(hasBreakArray)も扱える点が、通常のパターンエディタと異なります。
 */
const ScheduleShiftPatternEditor_v1 = ({ pattern, hasBreakArray, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [editedHasBreak, setEditedHasBreak] = useState(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
  
  const filteredPatterns = patterns.filter(p => p.startTime !== '9:00' && p.startTime !== '09:00');
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  const [bulkBreak, setBulkBreak] = useState(true);

  useEffect(() => { 
    if (isOpen) {
        setEditedPattern(pattern || Array(5).fill('シフト休')); 
        setEditedHasBreak(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
    }
  }, [isOpen, pattern, hasBreakArray]);

  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="w-full max-w-md bg-white rounded-md shadow-lg border border-slate-200 p-4" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-md mb-4 text-slate-800 border-b pb-2">基本シフトパターン編集</h4>
            <div className="mb-4 p-3 bg-orange-50 rounded-md border border-orange-100 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="font-bold text-xs text-orange-800">月〜金 一括設定</label>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="bulk-break" checked={bulkBreak} onChange={(e) => setBulkBreak(e.target.checked)} className="h-3.5 w-3.5 text-orange-600 rounded" />
                        <label htmlFor="bulk-break" className="text-[10px] font-bold text-orange-700">休憩あり</label>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select value={bulkPatternId} onChange={(e) => setBulkPatternId(e.target.value)} className="flex-grow text-xs p-1.5 border border-slate-300 rounded bg-white">
                        <option value="シフト休">シフト休</option>
                        {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                    </select>
                    <button onClick={() => { setEditedPattern(Array(5).fill(bulkPatternId)); setEditedHasBreak(Array(5).fill(bulkBreak)); }} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded font-bold hover:bg-[#E8A680]">適用</button>
                </div>
            </div>
            <div className="space-y-2">
                {['月', '火', '水', '木', '金'].map((dayName, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-1 font-bold text-xs text-slate-600">{dayName}</label>
                        <div className="col-span-8">
                            <select value={editedPattern[index]} onChange={(e) => { const np = [...editedPattern]; np[index] = e.target.value; setEditedPattern(np); }} className="w-full text-xs p-1.5 border border-slate-300 rounded-md bg-white">
                                <option value="シフト休">シフト休</option>
                                {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                            </select>
                        </div>
                        <div className="col-span-3 flex items-center gap-1 justify-end">
                            <input type="checkbox" id={`break-${index}`} checked={editedHasBreak[index]} onChange={() => { const nb = [...editedHasBreak]; nb[index] = !nb[index]; setEditedHasBreak(nb); }} disabled={editedPattern[index] === 'シフト休'} className="h-3.5 w-3.5 text-sky-600 rounded" />
                            <label htmlFor={`break-${index}`} className="text-[10px] whitespace-nowrap cursor-pointer">休憩</label>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
                <button onClick={() => setIsOpen(false)} className="text-xs px-4 py-2 bg-slate-100 rounded font-bold">キャンセル</button>
                <button onClick={() => { onApply(editedPattern, editedHasBreak); setIsOpen(false); }} className="text-xs px-4 py-2 bg-[#F4B896] text-white rounded font-bold shadow-sm hover:bg-[#E8A680]">適用</button>
            </div>
        </div>
    </div>, document.body
  ) : null;

  return (
    <div className="h-full w-full">
      <button onClick={() => !disabled && setIsOpen(true)} className={`w-full h-full flex items-center justify-start text-left p-1 rounded transition-colors ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-200'}`} disabled={disabled}>
        <div className="text-[10px] leading-tight font-semibold whitespace-pre-wrap text-slate-700 overflow-hidden">{summary}</div>
      </button>
      {editorPopup}
    </div>
  );
};

export default ScheduleShiftPatternEditor_v1;
