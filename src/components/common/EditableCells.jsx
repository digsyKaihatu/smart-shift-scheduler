import React, { useState, useEffect, useRef } from 'react';

// -----------------------------------------------------------------------------
// インライン定義: 外部ファイルの読み込みエラーを回避するため直接定義
// -----------------------------------------------------------------------------

const LockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 0118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" />
    </svg>
);

const formatValue = (value) => {
    if (typeof value === 'number') {
        return value % 1 === 0 ? Math.floor(value) : value;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object' && 'type' in value) {
        if ('locked' in value) { // Handle LockedHoliday
            return value.type;
        }
      return `${value.type}(${value.hours})`;
    }
    return '';
};

// -----------------------------------------------------------------------------
// EditableCell: シフト表のメインセル（時間入力・プルダウン選択）
// -----------------------------------------------------------------------------
const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const cellRef = useRef(null);
  const inputRef = useRef(null);

  const isLocked = typeof value === 'object' && value !== null && 'locked' in value && value.locked;
  const isEffectivelyDisabled = disabled || (isLocked && !isAdmin);

  // フォーカス制御
  useEffect(() => {
    if (mode === 'input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  // 値更新用ラッパー
  const handleUpdate = (newValue) => {
    if (JSON.stringify(newValue) !== JSON.stringify(value)) {
      onUpdate(newValue);
    }
  };

  // 入力値のコミット処理
  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (isNaN(hours) || hours < 0) {
        // 無効な値の場合は保存しない
        return;
    }
    if (editingSpecialShift) {
        handleUpdate({ type: editingSpecialShift, hours });
    } else {
        handleUpdate(hours);
    }
  };

  // 外側クリックの検知
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mode !== 'view' && cellRef.current && !cellRef.current.contains(event.target)) {
        // inputモードなら値を保存する
        if (mode === 'input') {
            commitInput();
        }
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
        // ステータス選択などは即座に反映して閉じる
        handleUpdate(selected);
        setMode('view');
        setEditingSpecialShift(null);
    }
  };

  const handleInputBlur = () => {
    // blur時も保存を試みる
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
    if (typeof value === 'number' && value > 0) return `bg-green-200 ${hoverClass}`;
    
    if (typeof value === 'object' && value !== null && 'type' in value) {
        switch (value.type) {
            case 'シフト休': return `bg-slate-300 ${hoverClass}`;
            case '遅刻': return `bg-orange-200 ${hoverClass}`;
            case '早退': return `bg-purple-200 ${hoverClass}`;
            case '午前有休':
            case '午後有休': return `bg-yellow-200 ${hoverClass}`;
            case '午前休': return `bg-slate-300 ${hoverClass}`;
            case '午後休':
            case '午前通休':
            case '午後通休': return `bg-blue-200 ${hoverClass}`;
            default: break;
        }
    }

    switch(value) {
      case '有休': return `bg-yellow-200 ${hoverClass}`;
      case '通休': return `bg-blue-200 ${hoverClass}`;
      case 'シフト休': return `bg-slate-300 ${hoverClass}`;
      case '欠勤': return `bg-red-200 ${hoverClass}`;
      default: return `bg-white ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const handleClick = () => {
      if (isEffectivelyDisabled) return;
      setMode('select');
  }
  
  // 修正: セル幅を大文字6文字分（約6em）に固定する
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-9 flex items-center justify-center w-[6em] min-w-[6em] max-w-[6em]`;

  if (mode === 'view') {
    return (
      <div
        onClick={handleClick}
        className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}
      >
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
         <div ref={cellRef} className={`${baseClasses} bg-white`}>
            <select
                onChange={handleSelectChange}
                autoFocus
                onBlur={() => setMode('view')} // selectのblurは単に閉じる
                className="w-full h-full bg-transparent text-center outline-none focus:outline-sky-500 focus:-outline-offset-2 text-xs appearance-none"
                defaultValue=""
            >
                <option value="" disabled>選択...</option>
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


// -----------------------------------------------------------------------------
// EditableStaffInfoCell: スタッフ情報（名前、役職など）編集セル
// -----------------------------------------------------------------------------
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
    if (!disabled) {
      setIsEditing(true);
    }
  }
  
  const wrapperClass = `h-9 text-xs border-b border-r border-slate-300 flex items-center px-2 bg-slate-50 overflow-hidden ${className}`;

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
    <div
      onClick={handleClick}
      className={`${wrapperClass} transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-100'}`}
    >
        <div className="font-semibold truncate w-full">{value}</div>
    </div>
  );
};


// -----------------------------------------------------------------------------
// EditableTaskName: 業務名編集セル
// -----------------------------------------------------------------------------
const EditableTaskName = ({ value, onUpdate, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && !disabled) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (currentValue.trim() !== value && currentValue.trim() !== '') {
      onUpdate(currentValue.trim());
    } else {
        // Revert if the name is empty or unchanged
        setCurrentValue(value);
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
    if (!disabled) {
      setIsEditing(true);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="text-xs font-semibold text-slate-600 bg-white border border-sky-500 rounded p-1 w-full"
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`text-xs font-semibold text-slate-600 p-1 rounded ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-200'}`}
      title={disabled ? '' : "クリックして編集"}
    >
      {value}
    </div>
  );
};

// Explicit exports to avoid "undefined" component errors
export { EditableCell, EditableStaffInfoCell, EditableTaskName };
