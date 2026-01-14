import React, { useState, useEffect, useRef } from 'react';

/**
 * 表示用の値を短縮表記に変換するヘルパー関数
 * (入力確定後の「観覧時」に適用されます)
 */
const getShortDisplayValue = (value) => {
  const mapping = {
    'シフト休': '休',
    '欠勤': '欠',
    '通休': '通',
    '有休': '有',
    '遅刻': '遅',
    '早退': '早'
  };

  if (typeof value === 'number') {
    return value % 1 === 0 ? Math.floor(value) : value;
  }

  // オブジェクト形式（時間単位の休暇など）の場合
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    // 完全一致での置換
    if (mapping[value.type]) {
      displayType = mapping[value.type];
    } else {
      // 部分一致（午前有休 -> 午前有 など）の置換
      Object.entries(mapping).forEach(([full, short]) => {
        displayType = displayType.replace(full, short);
      });
    }

    if ('locked' in value) {
      return displayType;
    }
    return `${displayType}(${value.hours})`;
  }

  // 文字列の場合
  if (typeof value === 'string') {
    return mapping[value] || value;
  }

  return value;
};

export const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false, isToday = false }) => {
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
      default: return `${todayClass || 'bg-white'} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const handleClick = () => {
      if (isEffectivelyDisabled) return;
      setMode('select');
  }
  
  const todayBorderClass = isToday ? 'ring-1 ring-inset ring-yellow-300 z-10' : '';
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-9 flex items-center justify-center w-[6em] min-w-[6em] max-w-[6em] ${todayBorderClass}`;

  if (mode === 'view') {
    return (
      <div onClick={handleClick} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        <span className="truncate w-full px-0.5">
          {/* ここで短縮表記関数を呼び出す */}
          {getShortDisplayValue(value)}
        </span>
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
                    {/* 入力時はわかりやすさのため正式名称を表示 */}
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

  return (
    <div ref={cellRef} className={`${baseClasses} bg-white w-full max-w-full overflow-hidden relative`}>
      {editingSpecialShift && <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 z-10 pointer-events-none">{editingSpecialShift}:</span>}
      <input
        ref={inputRef}
        type="number"
        step="0.5"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none focus:outline-sky-500 focus:-outline-offset-2 min-w-0 appearance-none"
        style={{ paddingLeft: editingSpecialShift ? '2.5rem' : '0' }}
      />
    </div>
  );
};
