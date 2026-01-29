import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * シフト表内での基本パターン編集コンポーネント
 * 休憩の有無(hasBreakArray)も扱える点が、通常のパターンエディタと異なります。
 */
const ScheduleShiftPatternEditor = ({ pattern, hasBreakArray, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [editedHasBreak, setEditedHasBreak] = useState(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
  
  // 9:00スタートのパターンを除外するフィルタリング
  const filteredPatterns = patterns.filter(p => p.startTime !== '9:00' && p.startTime !== '09:00');
  
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  const [bulkBreak, setBulkBreak] = useState(true);

  useEffect(() => { 
    if (isOpen) {
        setEditedPattern(pattern || Array(5).fill('シフト休')); 
        setEditedHasBreak(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
    }
  }, [isOpen, pattern, hasBreakArray]);

  // パターンIDから休憩有無を判定するヘルパー
  const checkBreakExistence = (pid) => {
      if (pid === 'シフト休') return false;
      const p = patterns.find(x => x.id === pid);
      // breakHoursが0より大きければ休憩ありとみなす
      return p ? p.breakHours > 0 : false;
  };

  // 一括設定時のハンドラ
  const handleBulkChange = (newPatternId) => {
      setBulkPatternId(newPatternId);
      setBulkBreak(checkBreakExistence(newPatternId));
  };

  // 個別設定時のハンドラ
  const handlePatternChange = (index, newPatternId) => {
      const np = [...editedPattern];
      np[index] = newPatternId;
      setEditedPattern(np);

      const nb = [...editedHasBreak];
      nb[index] = checkBreakExistence(newPatternId);
      setEditedHasBreak(nb);
  };

  // 一括適用のハンドラ
  const applyBulkToAll = () => {
      const isBreak = checkBreakExistence(bulkPatternId);
      setEditedPattern(Array(5).fill(bulkPatternId));
      setEditedHasBreak(Array(5).fill(isBreak));
  };

  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="w-full max-w-md bg-white rounded-md shadow-lg border border-slate-200 p-4" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-md mb-4 text-slate-800 border-b pb-2">基本シフトパターン編集</h4>
            <div className="mb-4 p-3 bg-orange-50 rounded-md border border-orange-100 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="font-bold text-xs text-orange-800">月〜金 一括設定</label>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${bulkBreak ? 'text-orange-700' : 'text-slate-400'}`}>
                            {bulkBreak ? '休憩あり' : '休憩なし'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select value={bulkPatternId} onChange={(e) => handleBulkChange(e.target.value)} className="flex-grow text-xs p-1.5 border border-slate-300 rounded bg-white">
                        <option value="シフト休">シフト休</option>
                        {filteredPatterns.map(p => (
                            <option key={p.id} value={p.id}>
                                {`${p.name} (${p.startTime}-${p.endTime}) ${p.breakHours > 0 ? '休憩あり' : '休憩なし'}`}
                            </option>
                        ))}
                    </select>
                    <button onClick={applyBulkToAll} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded font-bold hover:bg-[#E8A680]">適用</button>
                </div>
            </div>
            <div className="space-y-2">
                {['月', '火', '水', '木', '金'].map((dayName, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-1 font-bold text-xs text-slate-600">{dayName}</label>
                        <div className="col-span-8">
                            <select value={editedPattern[index]} onChange={(e) => handlePatternChange(index, e.target.value)} className="w-full text-xs p-1.5 border border-slate-300 rounded-md bg-white">
                                <option value="シフト休">シフト休</option>
                                {filteredPatterns.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {`${p.name} (${p.startTime}-${p.endTime}) ${p.breakHours > 0 ? '休憩あり' : '休憩なし'}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-3 flex items-center gap-1 justify-end">
                            <span className={`text-[10px] whitespace-nowrap ${editedHasBreak[index] ? 'text-slate-600' : 'text-slate-300'}`}>
                                {editedPattern[index] === 'シフト休' ? '-' : (editedHasBreak[index] ? '休憩あり' : '休憩なし')}
                            </span>
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

export default ScheduleShiftPatternEditor;
