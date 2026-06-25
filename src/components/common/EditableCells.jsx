import React, { useState, useEffect, useRef } from 'react';

/**
 * 閲覧モードでの表記を短縮するヘルパー関数
 */
const formatValue = (value) => {
  const mapping = {
    'シフト休': '休',
    '欠勤': '欠',
    '通休': '通',
    '有休': '有',
    '夏季休暇': '夏', // これを追加
    '遅刻': '遅',
    '早退': '早'
  };

  if (typeof value === 'number') {
    return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  }

  if (value && typeof value === 'object' && 'type' in value) {
    if (value.type === '稼働' && 'hours' in value) {
      const num = value.hours;
      return num % 1 === 0 ? Math.floor(num) : num.toFixed(1);
    }

    let displayType = value.type;
    if (mapping[value.type]) {
      displayType = mapping[value.type];
    } else {
      Object.entries(mapping).forEach(([full, short]) => {
        displayType = displayType.replace(full, short);
      });
    }

    if ('locked' in value) {
      return displayType;
    }
    return `${displayType}${value.hours ? `(${value.hours})` : ''}`;
  }

  if (typeof value === 'string') {
    return mapping[value] || value;
  }

  return value;
};

/**
 * シフト入力セル
 */
export const EditableCell = React.memo(({ 
  value, onUpdate, borderClass, disabled = false, isAdmin = false, 
  isToday = false, isHoliday = false, isWeekend = false, dayOfWeek, 
  rowIndex, colIndex, isSelected, onMouseDown, onMouseEnter, onContextMenu, onFocus,
  className = "" 
}) => {
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

  const moveFocus = (direction, e) => {
    let nextRow = rowIndex;
    let nextCol = colIndex;

    if (direction === 'ArrowUp') nextRow--;
    if (direction === 'ArrowDown') nextRow++;
    if (direction === 'ArrowLeft') nextCol--;
    if (direction === 'ArrowRight') nextCol++;
    
    if (direction === 'Tab') {
        if (e && e.shiftKey) {
            nextCol--;
        } else {
            nextCol++;
        }
    }

    const target = document.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"]`);
    if (target) {
        if (e) e.preventDefault();
        target.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (mode !== 'view') {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (mode === 'input') {
                commitInput();
            } else if (mode === 'select' && selectRef.current) {
                 const val = selectRef.current.value;
                 if (val && val !== '稼働時間入力' && !['遅刻', '早退', '午前有休', '午後有休', '午前夏季休暇', '午後夏季休暇', '午前休', '午後休', '午前通休', '午後通休'].includes(val)) {
                     onUpdate(val);
                     setMode('view');
                 } else if (val === '稼働時間入力') {
                     return; 
                 }
            }
            const moveDir = e.key === 'Tab' ? 'Tab' : 'ArrowDown';
            setTimeout(() => moveFocus(moveDir, e), 0);
        }
        if (e.key === 'Escape') {
            setMode('view');
            setTimeout(() => cellRef.current?.focus(), 0);
        }
        return;
    }

    const isNavigationKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key);
    
    if (isNavigationKey) {
        moveFocus(e.key, e);
        return;
    }

    if (isEffectivelyDisabled) return;

    switch (e.key) {
        case 'Enter':
        case 'F2':
            e.preventDefault();
            setMode('select');
            break;
        case 'Backspace':
        case 'Delete':
            e.preventDefault();
            onUpdate('');
            break;
        default:
            if (/^[0-9.]$/.test(e.key)) {
                e.preventDefault();
                setMode('input');
                setInputValue(e.key);
            }
            break;
    }
  };

  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (!isNaN(hours) && hours >= 0) {
      onUpdate(editingSpecialShift ? { type: editingSpecialShift, hours } : hours);
    }
    setMode('view');
    setEditingSpecialShift(null);
    setTimeout(() => cellRef.current?.focus(), 0);
  };

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    const specialShiftOptions = ['遅刻', '早退', '午前有休', '午後有休', '午前夏季休暇', '午後夏季休暇', '午前休', '午後休', '午前通休', '午後通休'];

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
        setTimeout(() => cellRef.current?.focus(), 0);
    }
  };

  const getBackgroundColor = () => {
    if (isSelected) {
        return `bg-sky-200 ring-2 ring-inset ring-sky-500 z-20 ${isEffectivelyDisabled ? '' : 'hover:bg-sky-300'}`;
    }

    if (typeof value === 'object' && value?.modified) {
        return `bg-orange-50 ring-2 ring-inset ring-orange-400 ${isEffectivelyDisabled ? '' : 'hover:bg-orange-100'}`;
    }

    const hoverClass = isEffectivelyDisabled ? '' : 'hover:bg-opacity-80';
    let baseBg = 'bg-white';
    if (isToday && value === '') baseBg = 'bg-yellow-50';
    else if (isHoliday || dayOfWeek === '日') baseBg = 'bg-pink-50';
    else if (dayOfWeek === '土') baseBg = 'bg-sky-50';

    if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === '稼働') return `bg-green-100 ${hoverClass}`;
        // 修正前: if (value.type.includes('有休')) return `bg-yellow-100 ${hoverClass}`;
        if (value.type.includes('有休') || value.type.includes('夏季休暇')) return `bg-yellow-100 ${hoverClass}`;
        if (value.type === 'シフト休') {
             if (!isHoliday && !isWeekend) return `bg-white text-black ${hoverClass}`;
             return `bg-slate-200 ${hoverClass}`;
        }
        return `bg-slate-200 ${hoverClass}`;
    }

    if (typeof value === 'number' && value > 0) {
        return `bg-green-100 ${hoverClass}`;
    }
    
    switch(value) {
      case '有休': 
      case '夏季休暇': // 追加
          return `bg-yellow-100 ${hoverClass}`;
      case '通休': return `bg-blue-100 ${hoverClass}`;
      case 'シフト休': 
          if (!isHoliday && !isWeekend) return `bg-white text-black ${hoverClass}`;
          return `bg-slate-200 ${hoverClass}`;
      case '欠勤': return `bg-red-100 ${hoverClass}`;
      default: return `${baseBg} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const baseClasses = `border-b border-r ${borderClass} text-center text-sm h-10 flex items-center justify-center w-[80px] min-w-[80px] max-w-[80px] flex-shrink-0 outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 z-10 overflow-hidden ${className}`;

  if (mode === 'view') {
    return (
      <div 
        ref={cellRef}
        tabIndex={isEffectivelyDisabled ? -1 : 0}
        onClick={() => {}}
        onDoubleClick={() => { if (!isEffectivelyDisabled) setMode('select'); }}
        onFocus={(e) => { if (!isEffectivelyDisabled && onFocus) onFocus(e); }}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => !isEffectivelyDisabled && onMouseDown && onMouseDown(e)}
        onMouseEnter={() => !isEffectivelyDisabled && onMouseEnter && onMouseEnter()}
        onContextMenu={(e) => !isEffectivelyDisabled && onContextMenu && onContextMenu(e)}
        className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}
        data-row={rowIndex}
        data-col={colIndex}
      >
        <span className="truncate w-full px-0.5 pointer-events-none block">{formatValue(value)}</span>
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-white relative`} data-row={rowIndex} data-col={colIndex}>
      {mode === 'select' ? (
        <select
          ref={selectRef}
          onKeyDown={handleKeyDown}
          onChange={handleSelectChange}
          onBlur={() => {
              if (mode !== 'input') setMode('view');
          }}
          className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-sm cursor-pointer appearance-none outline-none focus:ring-2 focus:ring-sky-500"
          defaultValue=""
        >
          <option value="稼働時間入力">稼働時間入力</option>
          <optgroup label="ステータス">
              <option value="有休">有休</option>
              <option value="夏季休暇">夏季休暇</option> {/* 追加 */}
              <option value="シフト休">シフト休</option>
              <option value="通休">通院休暇</option>
              <option value="欠勤">欠勤</option>
          </optgroup>
         <optgroup label="時間単位">
             {['遅刻', '早退', '午前有休', '午後有休', '午前夏季休暇', '午後夏季休暇', '午前休', '午後休', '午前通休', '午後通休'].map(opt => (
                   <option key={opt} value={opt}>{opt.replace('通休', '通院休暇')}</option>
              ))}
         </optgroup>
          <option value="">(クリア)</option>
        </select>
      ) : (
        <>
          {editingSpecialShift && <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none scale-75">入力:</span>}
          <input
            ref={inputRef}
            type="number"
            step="0.5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    commitInput();
                    const moveDir = e.key === 'Tab' ? 'Tab' : 'ArrowDown';
                    setTimeout(() => moveFocus(moveDir, e), 0);
                }
            }}
            className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-sm outline-none"
            style={{ paddingLeft: editingSpecialShift ? '1.5rem' : '0' }}
          />
        </>
      )}
    </div>
  );
});

export const EditableStaffInfoCell = React.memo(({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  // 編集中は外部からの変更（リアルタイム同期による上書き）を無視して入力内容を保護する
  useEffect(() => {
    if (!isEditing) {
      setCurrentValue(value);
    }
  }, [value, isEditing]);

  const handleBlur = () => {
    if (currentValue.trim() !== value) {
      onUpdate(currentValue.trim());
    }
    setIsEditing(false);
  };

  const wrapperClass = `h-10 text-sm border-b border-r border-slate-300 flex items-center px-2 overflow-hidden ${className}`;

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

  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`${wrapperClass} bg-white transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-50'}`}>
        <div className="font-semibold truncate w-full">{value}</div>
    </div>
  );
});
