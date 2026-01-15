import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { summarizePattern } from '../../utils/scheduleUtils';

// -----------------------------------------------------------------------------
// ヘルパー・内部コンポーネント
// -----------------------------------------------------------------------------

/**
 * 閲覧モードでの表記を短縮するヘルパー関数
 */
const formatValue = (value) => {
  if (value === null || value === undefined) return '';

  const mapping = {
    'シフト休': '休',
    '欠勤': '欠',
    '通休': '通',
    '有休': '有',
    '遅刻': '遅',
    '早退': '早'
  };

  if (typeof value === 'number') {
    return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  }

  if (typeof value === 'string') {
    return mapping[value] || value;
  }

  if (typeof value === 'object') {
    if ('type' in value) {
      let displayType = value.type;
      if (mapping[value.type]) {
        displayType = mapping[value.type];
      } else {
        Object.entries(mapping).forEach(([full, short]) => {
          displayType = displayType.replace(full, short);
        });
      }
      if ('locked' in value && value.locked) return displayType;
      // hoursプロパティが存在する場合は時間を付記
      return value.hours !== undefined ? `${displayType}(${value.hours})` : displayType;
    }
    // 意図しないオブジェクトが渡された場合は空文字を返す（エラー防止）
    return '';
  }

  return '';
};

/**
 * シフト入力セルコンポーネント
 */
const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false, isToday = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const inputRef = useRef(null);

  const isLocked = typeof value === 'object' && value !== null && 'locked' in value && value.locked;
  const isEffectivelyDisabled = disabled || (isLocked && !isAdmin);

  useEffect(() => {
    if (mode === 'input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (!isNaN(hours) && hours >= 0) {
      onUpdate(editingSpecialShift ? { type: editingSpecialShift, hours } : hours);
    }
    setMode('view');
    setEditingSpecialShift(null);
  };

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    const specialShiftOptions = ['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'];

    if (specialShiftOptions.includes(selected)) {
        const currentHours = (typeof value === 'object' && value?.type === selected) ? value.hours : 4.0;
        setEditingSpecialShift(selected);
        setInputValue(String(currentHours));
        setMode('input');
    } else if (selected === '稼働時間入力') {
        setEditingSpecialShift(null);
        setInputValue(String(typeof value === 'number' ? value : 8.0));
        setMode('input');
    } else {
        onUpdate(selected);
        setMode('view');
    }
  };

  const getBackgroundColor = () => {
    const hoverClass = isEffectivelyDisabled ? '' : 'hover:bg-opacity-80';
    const todayClass = isToday && (value === '' || value === null || value === undefined) ? 'bg-yellow-50' : '';

    if (typeof value === 'number' && value > 0) return `bg-green-100 ${hoverClass}`;
    if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type && value.type.includes('有休')) return `bg-yellow-100 ${hoverClass}`;
        return `bg-slate-200 ${hoverClass}`;
    }
    switch(value) {
      case '有休': return `bg-yellow-100 ${hoverClass}`;
      case '通休': return `bg-blue-100 ${hoverClass}`;
      case 'シフト休': return `bg-slate-200 ${hoverClass}`;
      case '欠勤': return `bg-red-100 ${hoverClass}`;
      default: return `${todayClass || 'bg-white'} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-10 flex items-center justify-center w-[75px] min-w-[75px] max-w-[75px] box-border`;

  if (mode === 'view') {
    return (
      <div onClick={() => !isEffectivelyDisabled && setMode('select')} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        <span className="truncate w-full px-0.5">{formatValue(value)}</span>
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-white relative`}>
      {mode === 'select' ? (
        <select
          autoFocus
          onChange={handleSelectChange}
          onBlur={() => setMode('view')}
          className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-xs cursor-pointer appearance-none outline-none focus:ring-2 focus:ring-sky-500"
          defaultValue=""
        >
          <option value="" disabled hidden>選択...</option>
          <option value="稼働時間入力">稼働時間入力</option>
          <optgroup label="ステータス">
              <option value="有休">有休</option>
              <option value="シフト休">シフト休</option>
              <option value="通休">通院休暇</option>
              <option value="欠勤">欠勤</option>
          </optgroup>
          <optgroup label="時間単位">
              {['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'].map(opt => (
                  <option key={opt} value={opt}>{opt.replace('通休', '通院休暇')}</option>
              ))}
          </optgroup>
          <option value="">(クリア)</option>
        </select>
      ) : (
        <>
          <input
            ref={inputRef}
            type="number"
            step="0.5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => e.key === 'Enter' && commitInput()}
            className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none"
          />
        </>
      )}
    </div>
  );
};

/**
 * スタッフ情報編集セルコンポーネント
 */
const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleBlur = () => {
    if (typeof currentValue === 'string' && currentValue.trim() !== value) {
      onUpdate(currentValue.trim());
    } else if (currentValue !== value) {
        onUpdate(currentValue);
    }
    setIsEditing(false);
  };

  const wrapperClass = `h-10 text-[11px] border-b border-r border-slate-300 flex items-center px-1.5 overflow-hidden box-border ${className}`;

  if (isEditing) {
    return (
      <div className={`${wrapperClass} bg-white`}>
        <input
          type="text"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
          autoFocus
          className="w-full h-full bg-transparent outline-none"
        />
      </div>
    );
  }

  // valueがオブジェクトの場合の対策（基本的には文字列のはずだが念のため）
  const displayValue = (typeof value === 'object' && value !== null) ? '' : value;

  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`${wrapperClass} bg-white transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-50'}`}>
        <div className="font-semibold truncate w-full">{displayValue}</div>
    </div>
  );
};

// パターン編集コンポーネント
const ShiftPatternEditor = ({ pattern, hasBreakArray, patterns, onApply, summary, disabled = false }) => {
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

const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const SetHolidayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

const UnlockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v3m-6 2h12a2 2 0 002-2v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2z" /></svg>
);

// -----------------------------------------------------------------------------
// メインコンポーネント: ShiftSchedule
// -----------------------------------------------------------------------------

const ShiftSchedule = ({ 
    currentUser, 
    isAdmin, 
    schedule, 
    staff = [], 
    days = [], // デフォルト値を追加
    holidays = [], 
    shiftPatterns = [], 
    year, 
    month, 
    onUpdateSchedule, 
    onDeleteStaff, 
    onUpdateStaffInfo, 
    onApplyStaffPattern, 
    onToggleShiftSubmitted, 
    onToggleShiftApproved, 
    onToggleShiftRemanded, 
    onSetDayAsHolidayForAll 
}) => {
  const containerRef = useRef(null);
  
  // 安全な配列を保証
  const safeDays = useMemo(() => Array.isArray(days) ? days : [], [days]);
  const sortedStaff = useMemo(() => {
    if (!Array.isArray(staff)) return [];
    return [...staff].sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true }));
  }, [staff]);
  
  // 固定列の幅定義
  const widths = { 
    role: 60, 
    empId: 90, 
    name: 120, 
    setting: 170, 
    submit: 65, 
    remand: 65, 
    approve: 65, 
    del: 45 
  };

  // Sticky Left の位置計算
  // 順序: role -> empId -> name -> setting -> submit -> remand -> approve -> del
  const stickyPositions = useMemo(() => {
    let currentLeft = 0;
    const positions = {};
    const keys = ['role', 'empId', 'name', 'setting', 'submit', 'remand', 'approve', 'del'];
    
    keys.forEach(key => {
      positions[key] = currentLeft;
      currentLeft += widths[key];
    });
    return positions;
  }, [widths]);

  // 「今日」へスクロールする処理
  useEffect(() => {
    if (!containerRef.current) return;
    const today = new Date();
    if (today.getFullYear() === year && (today.getMonth() + 1) === month) {
        setTimeout(() => {
            const container = containerRef.current;
            const target = container.querySelector(`[data-day="${today.getDate()}"]`);
            if (container && target) {
                // 左側の固定列の合計幅
                const fixedColumnsWidth = Object.values(widths).reduce((a, b) => a + b, 0);
                
                // ターゲットが固定列に隠れないようにスクロール位置を調整
                // 要素の中央を画面の中央（ただし固定列の分を考慮）に持ってくる
                const containerWidth = container.clientWidth;
                const availableWidth = containerWidth - fixedColumnsWidth;
                
                const elementLeft = target.offsetLeft;
                const elementWidth = target.clientWidth;
                
                // 固定列の右端から、表示領域の中央あたりに来るように計算
                const scrollTo = elementLeft - fixedColumnsWidth - (availableWidth / 2) + (elementWidth / 2);

                container.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
            }
        }, 300);
    }
  }, [year, month, safeDays, widths]);

  // スタイル定義
  const stickyHeaderStyle = (key) => ({
    position: 'sticky',
    left: stickyPositions[key],
    width: widths[key],
    minWidth: widths[key],
    maxWidth: widths[key],
    zIndex: 50 // 左上の角（ヘッダー×固定列）は最前面
  });

  const stickyCellStyle = (key) => ({
    position: 'sticky',
    left: stickyPositions[key],
    width: widths[key],
    minWidth: widths[key],
    maxWidth: widths[key],
    zIndex: 30 // 固定列（データ部分）は通常のセルより前面
  });

  const headerRowClass = "flex w-max";
  const headerCellBase = "sticky top-0 bg-slate-200 p-1.5 border-b-2 border-r border-slate-300 font-bold text-[11px] text-center h-12 flex items-center justify-center flex-shrink-0 box-border";
  const cellBase = "bg-white border-b border-r border-slate-300 flex items-center h-10 flex-shrink-0 box-border";

  return (
    <>
        <style>{`
            /* スクロールバーのスタイル（必要に応じて） */
            .custom-scrollbar::-webkit-scrollbar {
                height: 12px;
                width: 12px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: #f1f5f9;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }
        `}</style>
        
        {/* 全体を1つのコンテナにする */}
        <div 
            ref={containerRef}
            className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-auto border border-slate-200 h-[75vh] custom-scrollbar relative"
        >
            <div className="min-w-max">
                {/* ヘッダー行 */}
                <div className={`${headerRowClass} sticky top-0 z-40`}>
                    {/* 左側固定ヘッダー */}
                    <div className={headerCellBase} style={stickyHeaderStyle('role')}>役職</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('empId')}>社員番号</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('name')}>稼働名前</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('setting')}>基本シフト設定</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('submit')}>提出☑</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('remand')}>差戻☑</div>
                    <div className={headerCellBase} style={stickyHeaderStyle('approve')}>承認☑</div>
                    <div className={`${headerCellBase} border-r-2`} style={stickyHeaderStyle('del')}>削除</div>

                    {/* 日付ヘッダー (スクロール) */}
                    {safeDays.map(({ day, dayOfWeek }) => {
                        const isToday = new Date().getDate() === day && (new Date().getMonth()+1) === month;
                        return (
                            <div 
                                key={day} 
                                className={`${headerCellBase} bg-slate-200 whitespace-nowrap w-[75px] min-w-[75px] max-w-[75px] flex-col ${isToday ? 'bg-yellow-100' : ''}`} 
                                style={{ zIndex: 40 }} // 通常のヘッダーはz-40
                                data-day={day}
                            >
                                <div className="text-[9px] opacity-70 mb-1">{dayOfWeek}</div>
                                <div className="text-sm font-bold">{day}</div>
                                {isAdmin && (
                                <button onClick={() => onSetDayAsHolidayForAll(day)} className="group absolute bottom-0.5 right-0.5 p-0.5 bg-white/50 rounded-full hover:bg-sky-100">
                                    {sortedStaff.every(s => typeof (schedule[s.id]?.[day]) === 'object' && (schedule[s.id]?.[day])?.locked) ? <UnlockIcon /> : <SetHolidayIcon />}
                                </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* データ行 */}
                {sortedStaff.map(s => {
                    const isEditable = isAdmin || currentUser?.id === s.id;
                    const defaultShift = s.defaultShift || { pattern: [], hasBreakArray: [] };
                    
                    return (
                        <div key={s.id} className="flex w-max group hover:bg-slate-50 transition-colors">
                            {/* 左側固定セル */}
                            <div className={cellBase} style={stickyCellStyle('role')}>
                                <EditableStaffInfoCell value={s.role} onUpdate={v => onUpdateStaffInfo(s.id, 'role', v)} disabled={!isEditable} className="border-none w-full" />
                            </div>
                            <div className={cellBase} style={stickyCellStyle('empId')}>
                                <EditableStaffInfoCell value={s.employeeId} onUpdate={v => onUpdateStaffInfo(s.id, 'employeeId', v)} disabled={!isEditable} className="border-none w-full" />
                            </div>
                            <div className={cellBase} style={stickyCellStyle('name')}>
                                <EditableStaffInfoCell value={s.name} onUpdate={v => onUpdateStaffInfo(s.id, 'name', v)} disabled={!isEditable} className="border-none w-full" />
                            </div>
                            <div className={`${cellBase} px-1`} style={stickyCellStyle('setting')}>
                                <ShiftPatternEditor 
                                    pattern={defaultShift.pattern} 
                                    hasBreakArray={defaultShift.hasBreakArray} 
                                    patterns={shiftPatterns} 
                                    onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} 
                                    summary={summarizePattern(defaultShift.pattern, shiftPatterns, defaultShift.hasBreakArray)} 
                                    disabled={!isEditable} 
                                />
                            </div>
                            <div className={`${cellBase} justify-center`} style={stickyCellStyle('submit')}>
                                <input type="checkbox" checked={s.shiftSubmitted?.[`${year}-${month}`] || false} onChange={() => onToggleShiftSubmitted(s.id)} className="h-4 w-4 rounded text-sky-600 cursor-pointer" disabled={!isEditable} />
                            </div>
                            <div className={`${cellBase} justify-center`} style={stickyCellStyle('remand')}>
                                <input type="checkbox" checked={s.shiftRemanded?.[`${year}-${month}`] || false} onChange={() => onToggleShiftRemanded(s.id)} className="h-4 w-4 rounded text-red-600 cursor-pointer" disabled={!isAdmin} />
                            </div>
                            <div className={`${cellBase} justify-center`} style={stickyCellStyle('approve')}>
                                <input type="checkbox" checked={s.shiftApproved?.[`${year}-${month}`] || false} onChange={() => onToggleShiftApproved(s.id)} className="h-4 w-4 rounded text-green-600 cursor-pointer" disabled={!isAdmin} />
                            </div>
                            <div className={`${cellBase} justify-center border-r-2`} style={stickyCellStyle('del')}>
                                {isAdmin && <button onClick={() => onDeleteStaff(s.id)} className="p-1 hover:bg-red-50 rounded-full transition-colors"><DeleteIcon /></button>}
                            </div>

                            {/* 日付セル (スクロール) */}
                            {safeDays.map(({ day }) => (
                                <EditableCell 
                                    key={day} 
                                    value={schedule[s.id]?.[day] ?? ''} 
                                    onUpdate={v => onUpdateSchedule(s.id, day, v)} 
                                    isAdmin={isAdmin} 
                                    disabled={!isEditable} 
                                    borderClass="border-slate-200" 
                                    isToday={new Date().getDate() === day && (new Date().getMonth()+1) === month} 
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    </>
  );
};

export default ShiftSchedule;
