import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ShiftPatternEditor = ({ pattern, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  // パターンが未設定の場合は「シフト休」×5日で初期化
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  
  // 9:00スタートのパターンを除外するフィルタリング
  const filteredPatterns = patterns.filter(p => p.startTime !== '09:00' && p.startTime !== '9:00');
  
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  const buttonRef = useRef(null);
  const DAY_NAMES = ['月', '火', '水', '木', '金'];

  useEffect(() => {
    setEditedPattern(pattern || Array(5).fill('シフト休'));
  }, [pattern]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const handlePatternChange = (dayIndex, value) => {
    const newPattern = [...editedPattern];
    newPattern[dayIndex] = value;
    setEditedPattern(newPattern);
  };
  
  const handleApply = () => {
    onApply(editedPattern);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setEditedPattern(pattern);
    setIsOpen(false);
  };
  
  const handleBulkApply = () => {
      setEditedPattern(Array(5).fill(bulkPatternId));
  };

  // モーダル部分（Portalを使用してbody直下にレンダリング）
  const editorPopup = isOpen ? createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onMouseDown={handleCancel}
    >
        <div
            className="w-full max-w-sm bg-white rounded-md shadow-lg border border-slate-200 p-4"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <h4 className="font-bold text-md mb-4 text-slate-800">基本シフトパターン編集</h4>
            
            <div className="mb-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                <label className="font-semibold text-xs text-slate-600 block mb-1">月〜金 一括設定</label>
                <div className="flex items-center gap-2">
                    <select
                        value={bulkPatternId}
                        onChange={(e) => setBulkPatternId(e.target.value)}
                        className="flex-grow text-xs p-1.5 border border-slate-300 rounded-md"
                    >
                         <option value="シフト休">シフト休</option>
                         {filteredPatterns.map(p => (
                             <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime}, ${p.workHours}h)`}</option>
                         ))}
                    </select>
                    <button onClick={handleBulkApply} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">適用</button>
                </div>
            </div>

            <div className="space-y-2">
                {DAY_NAMES.map((dayName, index) => {
                    const value = editedPattern[index];
                    return (
                        <div key={index} className="grid grid-cols-4 gap-2 items-center">
                            <label className="font-semibold text-xs text-slate-600">{dayName}</label>
                            <select 
                                value={value}
                                onChange={(e) => handlePatternChange(index, e.target.value)}
                                className="col-span-3 text-xs p-1 border border-slate-300 rounded-md"
                            >
                                <option value="シフト休">シフト休</option>
                                {filteredPatterns.map(p => (
                                    <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime}, ${p.workHours}h)`}</option>
                                ))}
                            </select>
                        </div>
                    )
                })}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200">
                <button onClick={handleCancel} className="text-sm px-4 py-1.5 bg-slate-100 rounded-md hover:bg-slate-200">キャンセル</button>
                <button onClick={handleApply} className="text-sm px-4 py-1.5 bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">基本シフトを適用</button>
            </div>
        </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="h-full">
      <button 
        ref={buttonRef}
        onClick={handleOpen}
        className={`w-full h-full flex items-center justify-start text-left p-1 rounded ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-200'}`}
        disabled={disabled}
      >
        <div className={`text-xs font-semibold whitespace-pre-wrap ${disabled ? 'text-slate-500' : 'text-slate-700'}`} title={summary}>
           {summary}
        </div>
      </button>
      {editorPopup}
    </div>
  );
};

export default ShiftPatternEditor;
