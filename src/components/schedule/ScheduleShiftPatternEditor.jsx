import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { checkPatternHasBreak } from '../../utils/scheduleUtils';

// ユーティリティからのインポート解決エラーを回避するため、ヘルパー関数をコンポーネント内に定義
const checkPatternHasBreak = (pId, patterns) => {
    if (pId === 'シフト休') return false;
    const p = patterns.find(x => x.id === pId);
    if (!p) return true; // デフォルト
    return p.breakHours !== undefined ? p.breakHours > 0 : (p.breakTime !== undefined && p.breakTime !== '0:00' && p.breakTime !== '00:00');
};

/**
 * シフト表内での基本パターン編集コンポーネント
 * 休憩の有無はシフトパターン(マスタ)から自動的に判定して適用・表示します
 */
const ScheduleShiftPatternEditor = ({ pattern, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  
  // 旧パターンのA〜Hのみを除外するように変更（9:00開始の新パターンは表示可能に）
  const legacyPatternIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const filteredPatterns = patterns.filter(p => !legacyPatternIds.includes(p.id));
  
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  
  // 選択中のパターンIDから休憩有無を自動計算
  const bulkBreak = checkPatternHasBreak(bulkPatternId, patterns);

  useEffect(() => { 
    if (isOpen) {
        setEditedPattern(pattern || Array(5).fill('シフト休')); 
    }
  }, [isOpen, pattern]);

  // パターンの「休憩あり/なし」テキストを取得するヘルパー
  const getBreakText = (p) => {
      const hasBreak = p.breakHours !== undefined ? p.breakHours > 0 : (p.breakTime !== undefined && p.breakTime !== '0:00' && p.breakTime !== '00:00');
      return hasBreak ? '休憩あり' : '休憩なし';
  };

  // 一括設定時のハンドラ
  const handleBulkChange = (newPatternId) => {
      setBulkPatternId(newPatternId);
  };

  // 個別設定時のハンドラ
  const handlePatternChange = (index, newPatternId) => {
      const np = [...editedPattern];
      np[index] = newPatternId;
      setEditedPattern(np);
  };

  // 一括適用のハンドラ
  const applyBulkToAll = () => {
      setEditedPattern(Array(5).fill(bulkPatternId));
  };

  // 保存処理
  const handleApply = () => {
      // 選択されたパターンIDから、自動的に休憩の有無の配列を生成
      const finalBreaks = editedPattern.map(pid => checkPatternHasBreak(pid, patterns));
      onApply(editedPattern, finalBreaks);
      setIsOpen(false);
  };

  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="w-full max-w-md bg-white rounded-md shadow-lg border border-slate-200 p-4" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-md mb-4 text-slate-800 border-b pb-2">基本シフトパターン編集</h4>
            
            {/* 一括設定エリア */}
            <div className="mb-4 p-3 bg-orange-50 rounded-md border border-orange-100 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="font-bold text-xs text-orange-800">月〜金 一括設定</label>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${bulkPatternId === 'シフト休' ? 'text-slate-400' : (bulkBreak ? 'text-orange-700' : 'text-slate-400')}`}>
                            {bulkPatternId === 'シフト休' ? '-' : (bulkBreak ? '休憩あり' : '休憩なし')}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select value={bulkPatternId} onChange={(e) => handleBulkChange(e.target.value)} className="flex-grow text-xs p-1.5 border border-slate-300 rounded bg-white">
                        <option value="シフト休">シフト休</option>
                        {filteredPatterns.map(p => (
                            <option key={p.id} value={p.id}>
                                {`${p.name} (${p.startTime}-${p.endTime}) ${getBreakText(p)}`}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={applyBulkToAll} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded font-bold hover:bg-[#E8A680] whitespace-nowrap">
                        一括反映
                    </button>
                </div>
            </div>

            {/* 曜日ごとの個別設定エリア */}
            <div className="space-y-2">
                {['月', '火', '水', '木', '金'].map((dayName, index) => {
                    const currentBreak = checkPatternHasBreak(editedPattern[index], patterns);
                    return (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                            <label className="col-span-1 font-bold text-xs text-slate-600 text-center">{dayName}</label>
                            <div className="col-span-8">
                                <select value={editedPattern[index]} onChange={(e) => handlePatternChange(index, e.target.value)} className="w-full text-xs p-1.5 border border-slate-300 rounded-md bg-white">
                                    <option value="シフト休">シフト休</option>
                                    {filteredPatterns.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {`${p.name} (${p.startTime}-${p.endTime}) ${getBreakText(p)}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-3 flex items-center gap-1 justify-end">
                                <span className={`text-[10px] whitespace-nowrap ${editedPattern[index] === 'シフト休' ? 'text-slate-300' : (currentBreak ? 'text-slate-600' : 'text-slate-300')}`}>
                                    {editedPattern[index] === 'シフト休' ? '-' : (currentBreak ? '休憩あり' : '休憩なし')}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsOpen(false)} className="text-xs px-4 py-2 bg-slate-100 rounded font-bold">キャンセル</button>
                <button type="button" onClick={handleApply} className="text-xs px-4 py-2 bg-[#F4B896] text-white rounded font-bold shadow-sm hover:bg-[#E8A680]">適用</button>
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
