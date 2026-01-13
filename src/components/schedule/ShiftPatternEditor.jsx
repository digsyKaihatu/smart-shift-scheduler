import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ShiftPatternEditor = ({ pattern, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  
  // 9:00開始のパターンを除外し、有効なパターンのみをリスト化
  const validPatterns = patterns.filter(p => p.startTime !== '9:00' && p.startTime !== '09:00');
  
  const [bulkPatternId, setBulkPatternId] = useState(validPatterns[0]?.id || 'シフト休');
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

  // パターンの休憩時間を取得するヘルパー
  const getBreakHours = (pid) => {
      if (pid === 'シフト休') return 0;
      const p = patterns.find(x => x.id === pid);
      return p ? p.breakHours : 0;
  };

  // パターン表示用のフォーマット関数
  const formatPatternLabel = (p) => {
      const breakLabel = p.breakHours > 0 ? `(休${p.breakHours}h)` : '(休なし)';
      return `${p.name} ${p.startTime}-${p.endTime} ${breakLabel}`;
  };

  // モーダル部分
  const editorPopup = isOpen ? createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onMouseDown={handleCancel}
    >
        <div
            className="w-full max-w-lg bg-white rounded-md shadow-lg border border-slate-200 p-4" // 幅を少し広げました
            onMouseDown={(e) => e.stopPropagation()}
        >
            <h4 className="font-bold text-md mb-4 text-slate-800">基本シフトパターン編集</h4>
            
            {/* 一括設定エリア */}
            <div className="mb-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                <label className="font-semibold text-xs text-slate-600 block mb-1">月〜金 一括設定</label>
                <div className="flex items-center gap-2">
                    <select
                        value={bulkPatternId}
                        onChange={(e) => setBulkPatternId(e.target.value)}
                        className="flex-grow text-xs p-1.5 border border-slate-300 rounded-md"
                    >
                         <option value="シフト休">シフト休</option>
                         {validPatterns.map(p => (
                             <option key={p.id} value={p.id}>{formatPatternLabel(p)}</option>
                         ))}
                    </select>
                    
                    {/* 休憩ありチェックボックス (確認用) */}
                    <label className="flex items-center gap-1 whitespace-nowrap cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={getBreakHours(bulkPatternId) > 0} 
                            readOnly 
                            className="h-4 w-4 text-slate-500 border-gray-300 rounded focus:ring-0 cursor-not-allowed bg-gray-100"
                        />
                        <span className="text-xs text-slate-600">休憩1h</span>
                    </label>

                    <button onClick={handleBulkApply} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680] ml-2">適用</button>
                </div>
            </div>

            {/* 個別設定エリア */}
            <div className="space-y-2">
                {DAY_NAMES.map((dayName, index) => {
                    const value = editedPattern[index];
                    const hasBreak = getBreakHours(value) > 0;

                    return (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                            <label className="col-span-1 font-semibold text-xs text-slate-600">{dayName}</label>
                            
                            <div className="col-span-8">
                                <select 
                                    value={value}
                                    onChange={(e) => handlePatternChange(index, e.target.value)}
                                    className="w-full text-xs p-1 border border-slate-300 rounded-md"
                                >
                                    <option value="シフト休">シフト休</option>
                                    {validPatterns.map(p => (
                                        <option key={p.id} value={p.id}>{formatPatternLabel(p)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 休憩ありチェックボックス (確認用) */}
                            <div className="col-span-3 flex justify-end">
                                <label className="flex items-center gap-1 whitespace-nowrap cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={hasBreak} 
                                        readOnly 
                                        className="h-4 w-4 text-slate-500 border-gray-300 rounded focus:ring-0 cursor-not-allowed bg-gray-100"
                                    />
                                    <span className="text-xs text-slate-600">休憩1h</span>
                                </label>
                            </div>
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
