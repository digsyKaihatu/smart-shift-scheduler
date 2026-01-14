import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

// -----------------------------------------------------------------------------
// Utils & Icons (Inlined to avoid import errors)
// -----------------------------------------------------------------------------

const summarizePattern = (pattern, patterns, hasBreak) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];
    const breakText = hasBreak ? "休憩: あり" : "休憩: なし";

    const groups = {};
    const order = [];

    pattern.forEach((p, index) => {
        const key = p;
        if (!groups[key]) {
            groups[key] = [];
            order.push(key);
        }
        groups[key].push(DAY_NAMES[index]);
    });

    const lines = order.map(key => {
        const days = groups[key].join('');
        if (key === 'シフト休') {
            return `${days}:シフト休`;
        }
        const patternDetail = patterns.find(p => p.id === key);
        if (!patternDetail) {
            return `${days}:不明なパターン`;
        }
        return `${days} ${patternDetail.name} ${patternDetail.startTime}～${patternDetail.endTime} ${patternDetail.workHours.toFixed(1)}`;
    });

    return `${breakText}\n${lines.join('\n')}`;
};

const formatValue = (value) => {
    if (typeof value === 'number') {
        return value % 1 === 0 ? Math.floor(value) : value;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object' && 'type' in value) {
        if ('locked' in value) { 
            return value.type;
        }
      return `${value.type}(${value.hours})`;
    }
    return '';
};

// Icons
const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: '20px', minWidth: '20px' }} className="text-slate-400 group-hover:text-red-600 transition-colors pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const SetHolidayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500 group-hover:text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const UnlockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500 group-hover:text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v3m-6 2h12a2 2 0 002-2v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2z" />
    </svg>
);

const LockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 0118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" />
    </svg>
);

// -----------------------------------------------------------------------------
// Sub-Components (EditableCells, ShiftPatternEditor)
// -----------------------------------------------------------------------------

const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false, isToday = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const cellRef = useRef(null);
  const inputRef = useRef(null);
  const selectRef = useRef(null);

  const isLocked = typeof value === 'object' && value !== null && 'locked' in value && value.locked;
  const isEffectivelyDisabled = disabled || (isLocked && !isAdmin);

  useEffect(() => {
    if (mode === 'input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (mode === 'select' && selectRef.current) {
        selectRef.current.focus();
    }
  }, [mode]);

  const handleUpdate = (newValue) => {
    if (JSON.stringify(newValue) !== JSON.stringify(value)) {
      onUpdate(newValue);
    }
  };

  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (isNaN(hours) || hours < 0) return;
    if (editingSpecialShift) {
        handleUpdate({ type: editingSpecialShift, hours });
    } else {
        handleUpdate(hours);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mode !== 'view' && cellRef.current && !cellRef.current.contains(event.target)) {
        if (mode === 'input') commitInput();
        setMode('view');
        setEditingSpecialShift(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mode, inputValue, editingSpecialShift, value]);

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    const specialShiftOptions = ['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'];
    const TIME_INPUT_OPTION = '稼働時間入力';

    if (specialShiftOptions.includes(selected)) {
        const type = selected;
        const currentHours = (typeof value === 'object' && value?.type === type) ? value.hours : 4.0;
        setEditingSpecialShift(type);
        setInputValue(String(currentHours));
        setMode('input');
        return;
    }

    if (selected === TIME_INPUT_OPTION) {
        const currentHours = typeof value === 'number' ? value : 8.0;
        setEditingSpecialShift(null);
        setInputValue(String(currentHours));
        setMode('input');
    } else {
        handleUpdate(selected);
        setMode('view');
        setEditingSpecialShift(null);
    }
  };

  const handleInputBlur = () => {
    commitInput();
    setMode('view');
    setEditingSpecialShift(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
        setMode('view');
        setEditingSpecialShift(null);
    }
  };

  const getBackgroundColor = () => {
    const hoverClass = isEffectivelyDisabled ? '' : 'hover:bg-opacity-80';
    
    // 今日の場合は特別な背景色をベースにする
    const todayClass = isToday && value === '' ? 'bg-yellow-50' : '';

    if (typeof value === 'number' && value > 0) return `bg-green-200 ${hoverClass}`;
    if (typeof value === 'object' && value !== null && 'type' in value) {
        switch (value.type) {
            case 'シフト休': return `bg-slate-300 ${hoverClass}`;
            case '遅刻': return `bg-orange-200 ${hoverClass}`;
            case '早退': return `bg-purple-200 ${hoverClass}`;
            case '午前有休': case '午後有休': return `bg-yellow-200 ${hoverClass}`;
            case '午前休': return `bg-slate-300 ${hoverClass}`;
            case '午後休': case '午前通休': case '午後通休': return `bg-blue-200 ${hoverClass}`;
            default: break;
        }
    }
    switch(value) {
      case '有休': return `bg-yellow-200 ${hoverClass}`;
      case '通休': return `bg-blue-200 ${hoverClass}`;
      case 'シフト休': return `bg-slate-300 ${hoverClass}`;
      case '欠勤': return `bg-red-200 ${hoverClass}`;
      // 値がない場合、今日ならハイライト、そうでなければ白
      default: return `${todayClass || 'bg-white'} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const handleClick = () => {
      if (isEffectivelyDisabled) return;
      setMode('select');
  }
  
  // 今日の場合は枠線を強調し、スクロール時に重なり順を下げるため z-index を低く設定
  const todayBorderClass = isToday ? 'ring-1 ring-inset ring-yellow-300 z-[1]' : '';
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-9 flex items-center justify-center w-[6em] min-w-[6em] max-w-[6em] ${todayBorderClass}`;

  if (mode === 'view') {
    return (
      <div onClick={handleClick} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        {isLocked && <div className="absolute top-0.5 right-0.5 pointer-events-none"><LockIcon /></div>}
        <span className="truncate w-full px-0.5">{formatValue(value)}</span>
      </div>
    );
  }

  if (mode === 'select') {
    const statusOptions = ['有休', 'シフト休', '通休', '欠勤'];
    const specialShiftOptions = ['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'];
    const TIME_INPUT_OPTION = '稼働時間入力';
    return (
         <div ref={cellRef} className={`${baseClasses} bg-white relative`}>
            <select
                ref={selectRef}
                onChange={handleSelectChange}
                onBlur={() => setMode('view')}
                className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-xs cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-sky-500"
                defaultValue=""
            >
                <option value="" disabled hidden>選択...</option>
                <option value={TIME_INPUT_OPTION}>{TIME_INPUT_OPTION}</option>
                <optgroup label="ステータス">
                    {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </optgroup>
                <optgroup label="時間単位">
                    {specialShiftOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </optgroup>
                 <option value="">(クリア)</option>
            </select>
        </div>
    )
  }

  // mode === 'input'
  return (
    <div ref={cellRef} className={`${baseClasses} bg-white w-full max-w-full overflow-hidden relative`}>
      {editingSpecialShift && <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-slate-600 z-10 pointer-events-none">{editingSpecialShift}:</span>}
      <input
        ref={inputRef}
        type="number"
        step="0.5"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none focus:outline-sky-500 focus:-outline-offset-2 min-w-0 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        style={{ paddingLeft: editingSpecialShift ? '2.5rem' : '0' }}
      />
    </div>
  );
};

const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleBlur = () => {
    if (currentValue.trim() !== value) {
      onUpdate(currentValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };
  
  const handleClick = () => {
    if (!disabled) setIsEditing(true);
  }
  
  const wrapperClass = `h-9 text-xs border-b border-r border-slate-300 flex items-center px-2 bg-white overflow-hidden ${className}`;

  if (isEditing) {
    return (
      <div className={wrapperClass}>
        <input
          type="text"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full h-full bg-transparent outline-none"
        />
      </div>
    );
  }

  return (
    <div onClick={handleClick} className={`${wrapperClass} transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-100'}`}>
        <div className="font-semibold truncate w-full">{value}</div>
    </div>
  );
};

const ShiftPatternEditor = ({ pattern, hasBreak, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [editedHasBreak, setEditedHasBreak] = useState(hasBreak || false);
  
  // 9:00スタートのパターンを除外するフィルタリング
  const filteredPatterns = patterns.filter(p => p.startTime !== '09:00' && p.startTime !== '9:00');
  
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  const buttonRef = useRef(null);
  const DAY_NAMES = ['月', '火', '水', '木', '金'];

  useEffect(() => {
    setEditedPattern(pattern || Array(5).fill('シフト休'));
    setEditedHasBreak(hasBreak || false);
  }, [pattern, hasBreak]);

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
    onApply(editedPattern, editedHasBreak);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setEditedPattern(pattern);
    setEditedHasBreak(hasBreak);
    setIsOpen(false);
  };
  
  const handleBulkApply = () => {
      setEditedPattern(Array(5).fill(bulkPatternId));
  };

  const editorPopup = isOpen ? createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
      onMouseDown={handleCancel}
    >
        <div
            className="w-full max-w-sm bg-white rounded-md shadow-lg border border-slate-200 p-4"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <h4 className="font-bold text-md mb-4 text-slate-800">基本シフトパターン編集</h4>
            
            <div className="mb-4 p-3 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="has-break-checkbox"
                        checked={editedHasBreak}
                        onChange={(e) => setEditedHasBreak(e.target.checked)}
                        className="h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]"
                    />
                    <label htmlFor="has-break-checkbox" className="font-semibold text-sm text-slate-700 cursor-pointer">1時間休憩あり</label>
                </div>
                
                <div className="border-t border-slate-200 pt-2">
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

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

const ShiftSchedule = ({ 
    currentUser, isAdmin, 
    schedule, staff, days, holidays, shiftPatterns, year, month,
    onUpdateSchedule, onDeleteStaff, onUpdateStaffInfo, onApplyStaffPattern, 
    onToggleShiftSubmitted, onToggleShiftApproved, onToggleShiftRemanded, 
    onSetDayAsHolidayForAll 
}) => {
  const staffInfoWidth = "60px 100px 120px 150px 60px 60px 60px 40px";
  const scrollContainerRef = useRef(null);
  
  const patternSummary = (staffMember) => {
      return summarizePattern(staffMember.defaultShift.pattern, shiftPatterns, staffMember.defaultShift.hasBreak);
  }

  // スタッフを社員番号順にソート
  const sortedStaff = useMemo(() => {
      return [...staff].sort((a, b) => {
          const idA = a.employeeId || '';
          const idB = b.employeeId || '';
          return String(idA).localeCompare(String(idB), undefined, { numeric: true });
      });
  }, [staff]);

  const getDayHeaderClass = (dayOfWeek, isHoliday, isToday) => {
      let baseClasses = "sticky top-0 z-10 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap";
      if (isToday) {
          // 今日のヘッダーハイライト
          return `${baseClasses} bg-yellow-100 text-yellow-900 border-yellow-300 ring-2 ring-yellow-300 ring-inset`;
      }
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

  // ヘッダーセルの共通クラス
  const headerCellClass = "sticky top-0 z-10 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center";
  
  // データセルの共通クラス
  const dataCellClass = "bg-white border-b border-r border-slate-300 flex items-center h-9";

  // スクロール処理: マウント時/月変更時に今日の日付へ
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const today = new Date();
    const currentDay = today.getDate();
    const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;

    if (isCurrentMonth) {
        setTimeout(() => {
            const container = scrollContainerRef.current;
            if (!container) return;

            const todayElement = container.querySelector(`[data-day="${currentDay}"]`);
            if (todayElement) {
                const containerWidth = container.clientWidth;
                const elementLeft = todayElement.offsetLeft;
                const elementWidth = todayElement.clientWidth;
                const scrollTo = elementLeft - (containerWidth / 2) + (elementWidth / 2);
                container.scrollTo({ left: scrollTo, behavior: 'smooth' });
            }
        }, 100);
    } else {
        scrollContainerRef.current.scrollLeft = 0;
    }
  }, [year, month]);

  return (
    <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-hidden flex flex-col" style={{maxHeight: '70vh'}}>
      {/* 縦スクロールを有効にするためのコンテナ */}
      <div className="flex overflow-y-auto overflow-x-hidden">
        
        {/* --- 左側：固定エリア (役職〜削除) --- */}
        <div className="flex-shrink-0 z-20 bg-white border-r-2 border-slate-300 shadow-xl">
          <div className="grid" style={{ gridTemplateColumns: staffInfoWidth }}>
            {/* ヘッダー行 */}
            <div className={headerCellClass}>役職</div>
            <div className={headerCellClass}>社員番号</div>
            <div className={headerCellClass}>稼働名前</div>
            <div className={headerCellClass}>基本シフト設定</div>
            <div className={headerCellClass}>提出☑</div>
            <div className={headerCellClass}>差戻☑</div>
            <div className={headerCellClass}>承認☑</div>
            <div className={headerCellClass}>削除</div>

            {/* スタッフデータ行 */}
            {sortedStaff.map((staffMember) => {
              const isEditable = isAdmin || currentUser.id === staffMember.id;
              return (
                <React.Fragment key={staffMember.id}>
                  <EditableStaffInfoCell value={staffMember.role} onUpdate={(val) => onUpdateStaffInfo(staffMember.id, 'role', val)} disabled={!isEditable} />
                  <EditableStaffInfoCell value={staffMember.employeeId} onUpdate={(val) => onUpdateStaffInfo(staffMember.id, 'employeeId', val)} disabled={!isEditable} />
                  <EditableStaffInfoCell value={staffMember.name} onUpdate={(val) => onUpdateStaffInfo(staffMember.id, 'name', val)} disabled={!isEditable} />
                  <div className={`${dataCellClass} text-xs px-1`}>
                    <ShiftPatternEditor
                      pattern={staffMember.defaultShift.pattern}
                      hasBreak={staffMember.defaultShift.hasBreak}
                      patterns={shiftPatterns}
                      onApply={(newPattern, newHasBreak) => onApplyStaffPattern(staffMember.id, newPattern, newHasBreak)}
                      summary={patternSummary(staffMember)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className={`${dataCellClass} justify-center`}>
                    <input
                      type="checkbox"
                      checked={staffMember.shiftSubmitted?.[`${year}-${month}`] || false}
                      onChange={() => onToggleShiftSubmitted(staffMember.id)}
                      className="h-5 w-5 rounded border-slate-400 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200"
                      disabled={!isEditable}
                    />
                  </div>
                  <div className={`${dataCellClass} justify-center`}>
                    <input
                      type="checkbox"
                      checked={staffMember.shiftRemanded?.[`${year}-${month}`] || false}
                      onChange={() => onToggleShiftRemanded(staffMember.id)}
                      className="h-5 w-5 rounded border-slate-400 text-red-600 focus:ring-red-500 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className={`${dataCellClass} justify-center`}>
                    <input
                      type="checkbox"
                      checked={staffMember.shiftApproved?.[`${year}-${month}`] || false}
                      onChange={() => onToggleShiftApproved(staffMember.id)}
                      className="h-5 w-5 rounded border-slate-400 text-green-600 focus:ring-green-500 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className={`${dataCellClass} justify-center`}>
                    {isAdmin && (
                      <button
                        type="button"
                        onMouseDown={() => onDeleteStaff(staffMember.id)}
                        className="group p-1 rounded-full hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 flex items-center justify-center"
                        style={{ width: '28px', height: '28px' }}
                      >
                        <DeleteIcon />
                      </button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* --- 右側：スクロールエリア (日付部分) --- */}
        <div ref={scrollContainerRef} className="overflow-x-auto flex-grow bg-white">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(70px, 1fr))` }}>
            {/* 日付ヘッダー行 */}
            {days.map(({ day, dayOfWeek }) => {
              const isHoliday = holidays.includes(day);
              const today = new Date();
              const isToday = today.getFullYear() === year && (today.getMonth() + 1) === month && today.getDate() === day;
              const isDayFullyLocked = staff.length > 0 && staff.every(s => {
                  const entry = schedule[s.id]?.[day];
                  return typeof entry === 'object' && entry !== null && 'type' in entry && entry.type === 'シフト休' && 'locked' in entry && entry.locked;
              });
              
              return (
                  <div key={day} className={getDayHeaderClass(dayOfWeek, isHoliday, isToday)} data-day={day}>
                    <div>{day}</div>
                    <div>{dayOfWeek}</div>
                    {isAdmin && (
                      <button
                          onClick={() => onSetDayAsHolidayForAll(day)}
                          className="group absolute bottom-1 right-1 p-0.5 bg-white/50 rounded-full hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500"
                      >
                          {isDayFullyLocked ? <UnlockIcon /> : <SetHolidayIcon />}
                      </button>
                    )}
                  </div>
              )
            })}

            {/* 日付セル行 */}
            {sortedStaff.map((staffMember) => {
              const isEditable = isAdmin || currentUser.id === staffMember.id;
              return days.map(({ day, dayOfWeek }) => {
                const isHoliday = holidays.includes(day);
                const today = new Date();
                const isToday = today.getFullYear() === year && (today.getMonth() + 1) === month && today.getDate() === day;

                return (
                    <EditableCell 
                      key={`${staffMember.id}-${day}`}
                      value={isHoliday ? 'シフト休' : (schedule[staffMember.id]?.[day] ?? '')}
                      onUpdate={(value) => onUpdateSchedule(staffMember.id, day, value)}
                      borderClass={`${getCellBorderClass(dayOfWeek, isHoliday)}`}
                      disabled={!isEditable}
                      isAdmin={isAdmin}
                      isToday={isToday}
                    />
                )
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShiftSchedule;
