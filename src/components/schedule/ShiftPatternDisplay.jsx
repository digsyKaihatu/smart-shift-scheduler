import React, { useState } from 'react';

// -----------------------------------------------------------------------------
// AddShiftPatternModal: 新規パターン追加用モーダル
// -----------------------------------------------------------------------------
const AddShiftPatternModal = ({ onClose, onSave, existingPatterns }) => {
  const [id, setId] = useState('');
  const [startTime, setStartTime] = useState('09:30'); // デフォルトを09:30に変更
  const [endTime, setEndTime] = useState('18:30'); // デフォルトを18:30に変更
  const [breakHours, setBreakHours] = useState('1.0');
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');

    if (!id.trim()) {
      setError('記号を入力してください。');
      return;
    }
    // 重複チェックは全パターン（非表示含む）に対して行う
    if (existingPatterns.some(p => p.id.trim().toLowerCase() === id.trim().toLowerCase())) {
      setError('この記号は既に使用されています。');
      return;
    }
    const breakHoursNum = parseFloat(breakHours);
    if (isNaN(breakHoursNum) || breakHoursNum < 0) {
      setError('休憩時間は有効な数値で入力してください。');
      return;
    }
    
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
          setError('時間は HH:MM 形式で入力してください。');
        return;
    }

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    if (startH > 23 || startM > 59 || endH > 23 || endM > 59) {
        setError('無効な時間です。');
        return;
    }

    const startTotalMinutes = startH * 60 + startM;
    const endTotalMinutes = endH * 60 + endM;

    if (endTotalMinutes <= startTotalMinutes) {
      setError('終了時間は開始時間より後に設定してください。');
      return;
    }

    const durationHours = (endTotalMinutes - startTotalMinutes) / 60;
    const workHours = durationHours - breakHoursNum;

    if (workHours <= 0) {
      setError('実働時間が0時間以下になります。入力値を確認してください。');
      return;
    }

    const newPattern = {
      id: id.trim().toUpperCase(),
      name: id.trim().toUpperCase(),
      startTime,
      endTime,
      breakHours: breakHoursNum,
      workHours,
      displayTime: `${startTime} - ${endTime}`,
    };
    onSave(newPattern);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">新規シフトパターンを追加</h2>
        </header>

        <main className="p-6 space-y-4">
          <div>
            <label htmlFor="pattern-id" className="block text-sm font-medium text-slate-700">記号</label>
            <input
              type="text"
              id="pattern-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-[#F4B896] focus:ring-1 focus:ring-[#F4B896]"
              placeholder="例: A, B, Z"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label htmlFor="start-time" className="block text-sm font-medium text-slate-700">開始時間</label>
                <input
                  type="time"
                  id="start-time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                />
            </div>
            <div>
                <label htmlFor="end-time" className="block text-sm font-medium text-slate-700">終了時間</label>
                <input
                  type="time"
                  id="end-time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
                />
            </div>
          </div>
          <div>
            <label htmlFor="break-hours" className="block text-sm font-medium text-slate-700">休憩時間 (h)</label>
            <input
              type="number"
              id="break-hours"
              step="0.25"
              min="0"
              value={breakHours}
              onChange={(e) => setBreakHours(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm"
              placeholder="例: 1.0"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </main>
        
        <footer className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">
            キャンセル
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">
            保存
          </button>
        </footer>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// ShiftPatternDisplay: パターン一覧表示コンポーネント
// -----------------------------------------------------------------------------
const ShiftPatternDisplay = ({ patterns, onAddPattern }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const toggleOpen = () => setIsOpen(!isOpen);

    const handleSavePattern = (newPattern) => {
        onAddPattern(newPattern);
        setIsAddModalOpen(false);
    };

    // 9:00～を非表示にするフィルタリング
    const visiblePatterns = patterns.filter(p => p.startTime !== '9:00' && p.startTime !== '09:00');

    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <div className="flex justify-between items-center">
                <button 
                    onClick={toggleOpen}
                    className="flex-grow flex justify-between items-center text-left"
                    aria-expanded={isOpen}
                    aria-controls="shift-pattern-table"
                >
                    <h2 className="text-lg font-bold text-slate-800">シフトパターン一覧</h2>
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-6 w-6 text-slate-600 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="ml-4 px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F4B896] shadow-sm transition-colors"
                >
                    + パターンを追加
                </button>
            </div>
            
            {isOpen && (
                <div id="shift-pattern-table" className="overflow-x-auto mt-3">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">記号</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">勤務時間</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">休憩</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">実働時間</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {visiblePatterns.map(pattern => (
                                <tr key={pattern.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-slate-900">{pattern.name}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-600">{pattern.startTime} - {pattern.endTime}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-600">{pattern.breakHours.toFixed(1)}h</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-600">{pattern.workHours.toFixed(1)}h</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isAddModalOpen && (
                <AddShiftPatternModal
                    onClose={() => setIsAddModalOpen(false)}
                    onSave={handleSavePattern}
                    existingPatterns={patterns} // バリデーション用には全パターンを渡す
                />
            )}
        </div>
    );
};

export default ShiftPatternDisplay;
