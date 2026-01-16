import React, { useState, useEffect, useRef } from 'react';

/**
 * 閲覧モードでの表記を短縮するヘルパー関数
 * インポートエラー回避のため、ファイル内に定義します。
 */
const formatValue = (value) => {
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

/**
 * シフト入力セル
 */
export const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false, isToday = false, isHoliday = false, isWeekend = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const cellRef = useRef(null);
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
    const todayClass = isToday && value === '' ? 'bg-yellow-50' : '';

    if (typeof value === 'number' && value > 0) return `bg-green-100 ${hoverClass}`;
    if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type.includes('有休')) return `bg-yellow-100 ${hoverClass}`;
        // オブジェクト形式のシフト休の場合
        if (value.type === 'シフト休') {
             if (!isHoliday && !isWeekend) {
                 return `bg-white text-black ${hoverClass}`; // 平日シフト休
             }
             return `bg-slate-200 ${hoverClass}`; // 土日祝シフト休
        }
        return `bg-slate-200 ${hoverClass}`;
    }
    switch(value) {
      case '有休': return `bg-yellow-100 ${hoverClass}`;
      case '通休': return `bg-blue-100 ${hoverClass}`;
      case 'シフト休': 
          if (!isHoliday && !isWeekend) {
              return `bg-white text-black ${hoverClass}`; // 平日シフト休
          }
          return `bg-slate-200 ${hoverClass}`; // 土日祝シフト休
      case '欠勤': return `bg-red-100 ${hoverClass}`;
      default: return `${todayClass || 'bg-white'} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  // 幅を w-[75px] に固定してヘッダーと一致させる
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-10 flex items-center justify-center w-[75px] min-w-[75px] max-w-[75px]`;

  if (mode === 'view') {
    return (
      <div onClick={() => !isEffectivelyDisabled && setMode('select')} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        <span className="truncate w-full px-0.5">{formatValue(value)}</span>
      </div>
    );
  }

  return (
    <div ref={cellRef} className={`${baseClasses} bg-white relative`}>
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
          {editingSpecialShift && <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[8px] text-slate-500 pointer-events-none scale-75">入力:</span>}
          <input
            ref={inputRef}
            type="number"
            step="0.5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => e.key === 'Enter' && commitInput()}
            className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none"
            style={{ paddingLeft: editingSpecialShift ? '1.5rem' : '0' }}
          />
        </>
      )}
    </div>
  );
};

/**
 * スタッフ情報編集セル
 */
export const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
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

  const wrapperClass = `h-10 text-[11px] border-b border-r border-slate-300 flex items-center px-1.5 overflow-hidden ${className}`;

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
};
