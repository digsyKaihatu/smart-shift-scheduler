import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

const summarizePattern = (pattern, patterns, hasBreak) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];
    const breakText = hasBreak ? "休憩: あり" : "休憩: なし";
    const groups = {};
    const order = [];
    pattern.forEach((p, index) => {
        const key = p;
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(DAY_NAMES[index]);
    });
    const lines = order.map(key => {
        const days = groups[key].join('');
        if (key === 'シフト休') return `${days}:休`;
        const patternDetail = patterns.find(p => p.id === key);
        if (!patternDetail) return `${days}:?`;
        return `${days} ${patternDetail.name} ${patternDetail.startTime}-${patternDetail.endTime}`;
    });
    
    return `${lines.join('\n')}\n(${breakText})`;
};

// 閲覧時の表記を短縮するヘルパー関数
const formatValue = (value) => {
    const mapping = {
        'シフト休': '休',
        '欠勤': '欠',
        '通休': '通',
        '有休': '有',
        '遅刻': '遅',
        '早退': '早'
    };

    if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value;
    
    if (typeof value === 'string') {
        return mapping[value] || value;
    }
    
    if (value && typeof value === 'object' && 'type' in value) {
        let displayType = value.type;
        // マッピングがあれば置換、なければ部分一致で置換を試みる
        if (mapping[value.type]) {
            displayType = mapping[value.type];
        } else {
            // "午前有休" -> "午前有" などの置換
            Object.entries(mapping).forEach(([full, short]) => {
                displayType = displayType.replace(full, short);
            });
        }

        if ('locked' in value) return displayType;
        return `${displayType}(${value.hours})`;
    }
    return '';
};

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
    if (mode === 'input' && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
    if (mode === 'select' && selectRef.current) { selectRef.current.focus(); }
  }, [mode]);

  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (isNaN(hours) || hours < 0) return;
    onUpdate(editingSpecialShift ? { type: editingSpecialShift, hours } : hours);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mode, inputValue, editingSpecialShift, value]);

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    if (['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'].includes(selected)) {
        setEditingSpecialShift(selected);
        setInputValue(String((typeof value === 'object' && value?.type === selected) ? value.hours : 4.0));
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
    if (typeof value === 'number' && value > 0) return `bg-green-200 ${hoverClass}`;
    if (typeof value === 'object' && value !== null && 'type' in value) {
        switch (value.type) {
            case 'シフト休': return `bg-slate-300 ${hoverClass}`;
            case '遅刻': return `bg-orange-200 ${hoverClass}`;
            case '早退': return `bg-purple-200 ${hoverClass}`;
            case '午前有休': case '午後有休': return `bg-yellow-200 ${hoverClass}`;
            case '午前休': return `bg-slate-300 ${hoverClass}`;
            case '午後休': case '午前通休': case '午後通休': return `bg-blue-200 ${hoverClass}`;
            default: return `bg-white ${hoverClass}`;
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
  
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-9 flex items-center justify-center w-[6em] min-w-[6em] max-w-[6em]`;

  if (mode === 'view') {
    return (
      <div onClick={() => !isEffectivelyDisabled && setMode('select')} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        {isLocked && <div className="absolute top-0.5 right-0.5 pointer-events-none"><LockIcon /></div>}
        <span className="truncate w-full px-0.5">{formatValue(value)}</span>
      </div>
    );
  }

  if (mode === 'select') {
    return (
         <div ref={cellRef} className={`${baseClasses} bg-white relative`}>
            <select ref={selectRef} onChange={handleSelectChange} onBlur={() => setMode('view')} className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-xs cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-sky-500" defaultValue="">
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
                        <option key={opt} value={opt}>{opt === '午前通休' ? '午前通院休暇' : opt === '午後通休' ? '午後通院休暇' : opt}</option>
                    ))}
                </optgroup>
                 <option value="">(クリア)</option>
            </select>
        </div>
    );
  }

  return (
    <div ref={cellRef} className={`${baseClasses} bg-white w-full max-w-full overflow-hidden relative`}>
      {editingSpecialShift && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 z-10 pointer-events-none">
            {editingSpecialShift.includes('通休') ? editingSpecialShift.replace('通休', '通院') : editingSpecialShift}:
        </span>
      )}
      <input ref={inputRef} type="number" step="0.5" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onBlur={() => { commitInput(); setMode('view'); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none focus:outline-sky-500 focus:-outline-offset-2" style={{ paddingLeft: editingSpecialShift ? '3rem' : '0' }} />
    </div>
  );
};

const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  useEffect(() => setCurrentValue(value), [value]);
  const handleBlur = () => { if (currentValue.trim() !== value) onUpdate(currentValue.trim()); setIsEditing(false); };
  const wrapperClass = `h-9 text-xs border-b border-r border-slate-300 flex items-center px-2 bg-white overflow-hidden ${className}`;
  if (isEditing) {
    return (
      <div className={wrapperClass}><input type="text" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()} autoFocus className="w-full h-full bg-transparent outline-none" /></div>
    );
  }
  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`${wrapperClass} transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-100'}`}><div className="font-semibold truncate w-full">{value}</div></div>
  );
};

const ShiftPatternEditor = ({ pattern, hasBreak, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [editedHasBreak, setEditedHasBreak] = useState(hasBreak || false);
  const filteredPatterns = patterns.filter(p => p.startTime !== '09:00' && p.startTime !== '9:00');
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  useEffect(() => { setEditedPattern(pattern || Array(5).fill('シフト休')); setEditedHasBreak(hasBreak || false); }, [pattern, hasBreak]);
  const handleCancel = () => { setEditedPattern(pattern); setEditedHasBreak(hasBreak); setIsOpen(false); };
  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={handleCancel}>
        <div className="w-full max-w-sm bg-white rounded-md shadow-lg border border-slate-200 p-4" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-md mb-4 text-slate-800">基本シフトパターン編集</h4>
            <div className="mb-4 p-3 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                    <input type="checkbox" id="has-break-checkbox" checked={editedHasBreak} onChange={(e) => setEditedHasBreak(e.target.checked)} className="h-4 w-4 text-[#D9824D] rounded border-slate-300 focus:ring-[#F4B896]" />
                    <label htmlFor="has-break-checkbox" className="font-semibold text-sm text-slate-700 cursor-pointer">1時間休憩あり</label>
                </div>
                <div className="border-t border-slate-200 pt-2">
                    <label className="font-semibold text-xs text-slate-600 block mb-1">月〜金 一括設定</label>
                    <div className="flex items-center gap-2">
                        <select value={bulkPatternId} onChange={(e) => setBulkPatternId(e.target.value)} className="flex-grow text-xs p-1.5 border border-slate-300 rounded-md">
                            <option value="シフト休">シフト休</option>
                            {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime}, ${p.workHours}h)`}</option>)}
                        </select>
                        <button onClick={() => setEditedPattern(Array(5).fill(bulkPatternId))} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">適用</button>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                {['月', '火', '水', '木', '金'].map((dayName, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2 items-center">
                        <label className="font-semibold text-xs text-slate-600">{dayName}</label>
                        <select value={editedPattern[index]} onChange={(e) => { const np = [...editedPattern]; np[index] = e.target.value; setEditedPattern(np); }} className="col-span-3 text-xs p-1 border border-slate-300 rounded-md">
                            <option value="シフト休">シフト休</option>
                            {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime}, ${p.workHours}h)`}</option>)}
                        </select>
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200">
                <button onClick={handleCancel} className="text-sm px-4 py-1.5 bg-slate-100 rounded-md hover:bg-slate-200">キャンセル</button>
                <button onClick={() => { onApply(editedPattern, editedHasBreak); setIsOpen(false); }} className="text-sm px-4 py-1.5 bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">基本シフトを適用</button>
            </div>
        </div>
    </div>, document.body
  ) : null;
  return (<div className="h-full"><button onClick={() => !disabled && setIsOpen(true)} className={`w-full h-full flex items-center justify-start text-left p-1 rounded ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-200'}`} disabled={disabled}><div className={`text-[10px] leading-tight font-semibold whitespace-pre-wrap ${disabled ? 'text-slate-500' : 'text-slate-700'}`} title={summary}>{summary}</div></button>{editorPopup}</div>);
};

const ShiftSchedule = ({ currentUser, isAdmin, schedule, staff, days, holidays, shiftPatterns, year, month, onUpdateSchedule, onDeleteStaff, onUpdateStaffInfo, onApplyStaffPattern, onToggleShiftSubmitted, onToggleShiftApproved, onToggleShiftRemanded, onSetDayAsHolidayForAll }) => {
  const scrollContainerRef = useRef(null);
  const sortedStaff = useMemo(() => [...staff].sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true })), [staff]);
  
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const today = new Date();
    if (today.getFullYear() === year && (today.getMonth() + 1) === month) {
        setTimeout(() => {
            const container = scrollContainerRef.current;
            const target = container?.querySelector(`[data-day="${today.getDate()}"]`);
            if (container && target) {
                const containerWidth = container.clientWidth;
                const scrollLeft = target.offsetLeft - 650 - ((containerWidth - 650) / 2) + (target.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }, 200);
    } else { scrollContainerRef.current.scrollLeft = 0; }
  }, [year, month, days]);

  const colWidths = { role: 60, empId: 100, name: 120, setting: 150, submit: 60, remand: 60, approve: 60, delete: 40 };
  const colLefts = { role: 0, empId: 60, name: 160, setting: 280, submit: 430, remand: 490, approve: 550, delete: 610 };
  const gridTemplateColumns = `${Object.values(colWidths).map(w => `${w}px`).join(' ')} repeat(${days.length}, minmax(70px, 1fr))`;

  const stickyHeaderBase = "sticky top-0 z-30 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center h-12 flex flex-col items-center justify-center";
  const stickyFixedHeaderBase = "sticky top-0 z-50 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center h-12 flex items-center justify-center";
  const stickyFixedColBase = "sticky z-20 bg-white border-b border-r border-slate-300 flex items-center h-9";

  return (
    <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-hidden">
      <div ref={scrollContainerRef} className="overflow-auto bg-white" style={{maxHeight: '70vh'}}>
        <div className="grid" style={{ gridTemplateColumns }}>
          
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.role }}>役職</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.empId }}>社員番号</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.name }}>稼働名前</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.setting }}>基本シフト設定</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.submit }}>提出☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.remand }}>差戻☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: colLefts.approve }}>承認☑</div>
          <div className={`${stickyFixedHeaderBase} border-r-2 shadow-[2px_0_5px_rgba(0,0,0,0.1)]`} style={{ left: colLefts.delete }}>削除</div>

          {days.map(({ day, dayOfWeek }) => {
            const isH = holidays.includes(day); 
            const isT = new Date().getFullYear() === year && (new Date().getMonth() + 1) === month && new Date().getDate() === day;
            return (
                <div key={day} className={`${stickyHeaderBase} whitespace-nowrap ${isT ? 'bg-yellow-100 text-yellow-900 border-yellow-300 ring-2 ring-yellow-300 ring-inset' : dayOfWeek === '土' ? 'bg-sky-100 text-sky-800 border-sky-200' : (dayOfWeek === '日' || isH) ? 'bg-pink-100 text-pink-800 border-pink-200' : 'bg-slate-100 text-slate-900 border-slate-300'}`} data-day={day}>
                  <div className="text-[10px] opacity-70 leading-none mb-1">{dayOfWeek}</div>
                  <div className="text-sm font-bold">{day}</div>
                  {isAdmin && <button onClick={() => onSetDayAsHolidayForAll(day)} className="group absolute bottom-0.5 right-0.5 p-0.5 bg-white/50 rounded-full hover:bg-sky-100">{staff.every(s => typeof (schedule[s.id]?.[day]) === 'object' && (schedule[s.id]?.[day])?.locked) ? <UnlockIcon /> : <SetHolidayIcon />}</button>}
                </div>
            )
          })}

          {sortedStaff.map(s => {
            const isEditable = isAdmin || currentUser.id === s.id;
            const summary = summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreak);
            return (
              <React.Fragment key={s.id}>
                <div className={stickyFixedColBase} style={{ left: colLefts.role }}><EditableStaffInfoCell value={s.role} onUpdate={v => onUpdateStaffInfo(s.id, 'role', v)} disabled={!isEditable} className="w-full h-full" /></div>
                <div className={stickyFixedColBase} style={{ left: colLefts.empId }}><EditableStaffInfoCell value={s.employeeId} onUpdate={v => onUpdateStaffInfo(s.id, 'employeeId', v)} disabled={!isEditable} className="w-full h-full" /></div>
                <div className={stickyFixedColBase} style={{ left: colLefts.name }}><EditableStaffInfoCell value={s.name} onUpdate={v => onUpdateStaffInfo(s.id, 'name', v)} disabled={!isEditable} className="w-full h-full" /></div>
                <div className={`${stickyFixedColBase} px-1`} style={{ left: colLefts.setting }}><ShiftPatternEditor pattern={s.defaultShift.pattern} hasBreak={s.defaultShift.hasBreak} patterns={shiftPatterns} onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} summary={summary} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} justify-center`} style={{ left: colLefts.submit }}><input type="checkbox" checked={s.shiftSubmitted?.[`${year}-${month}`] || false} onChange={() => onToggleShiftSubmitted(s.id)} className="h-5 w-5 rounded border-slate-400 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed" disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} justify-center`} style={{ left: colLefts.remand }}><input type="checkbox" checked={s.shiftRemanded?.[`${year}-${month}`] || false} onChange={() => onToggleShiftRemanded(s.id)} className="h-5 w-5 rounded border-slate-400 text-red-600 focus:ring-red-500 cursor-pointer disabled:cursor-not-allowed" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} justify-center`} style={{ left: colLefts.approve }}><input type="checkbox" checked={s.shiftApproved?.[`${year}-${month}`] || false} onChange={() => onToggleShiftApproved(s.id)} className="h-5 w-5 rounded border-slate-400 text-green-600 focus:ring-green-500 cursor-pointer disabled:cursor-not-allowed" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} justify-center border-r-2 shadow-[2px_0_5px_rgba(0,0,0,0.1)]`} style={{ left: colLefts.delete }}>{isAdmin && <button onMouseDown={() => onDeleteStaff(s.id)} className="group p-1 rounded-full hover:bg-red-100 flex items-center justify-center" style={{ width: '28px', height: '28px' }}><DeleteIcon /></button>}</div>

                {days.map(({ day, dayOfWeek }) => (
                    <EditableCell 
                      key={`${s.id}-${day}`} 
                      value={holidays.includes(day) ? 'シフト休' : (schedule[s.id]?.[day] ?? '')} 
                      onUpdate={v => onUpdateSchedule(s.id, day, v)} 
                      borderClass={`${dayOfWeek === '土' ? 'border-sky-200' : (dayOfWeek === '日' || holidays.includes(day)) ? 'border-pink-200' : 'border-slate-300'}`} 
                      disabled={!isAdmin && currentUser.id !== s.id} 
                      isAdmin={isAdmin} 
                      isToday={new Date().getFullYear() === year && (new Date().getMonth() + 1) === month && new Date().getDate() === day} 
                    />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ShiftSchedule;
