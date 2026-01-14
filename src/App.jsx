import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { createPortal } from 'react-dom';

/**
 * -----------------------------------------------------------------------------
 * 1. ユーティリティ & 定数 (本来外部ファイルにあるものを統合)
 * -----------------------------------------------------------------------------
 */

const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'B', name: 'B', startTime: '9:00', endTime: '17:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'C', name: 'C', startTime: '9:00', endTime: '17:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'D', name: 'D', startTime: '9:00', endTime: '16:30', breakTime: '1:00', workHours: 6.5 },
  { id: 'E', name: 'E', startTime: '9:00', endTime: '16:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'F', name: 'F', startTime: '9:00', endTime: '15:30', breakTime: '1:00', workHours: 5.5 },
  { id: 'G', name: 'G', startTime: '9:00', endTime: '15:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'H', name: 'H', startTime: '9:00', endTime: '13:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'J', name: 'J', startTime: '9:30', endTime: '18:00', breakTime: '1:00', workHours: 7.5 },
  { id: 'K', name: 'K', startTime: '9:30', endTime: '17:30', breakTime: '1:00', workHours: 7.0 },
  { id: 'L', name: 'L', startTime: '9:30', endTime: '17:00', breakTime: '1:00', workHours: 6.5 },
  { id: 'M', name: 'M', startTime: '9:30', endTime: '16:30', breakTime: '1:00', workHours: 6.0 },
  { id: 'N', name: 'N', startTime: '9:30', endTime: '16:00', breakTime: '1:00', workHours: 5.5 },
  { id: 'O', name: 'O', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 },
  { id: 'P', name: 'P', startTime: '10:00', endTime: '18:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'Q', name: 'Q', startTime: '10:00', endTime: '18:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'R', name: 'R', startTime: '10:00', endTime: '17:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'S', name: 'S', startTime: '10:00', endTime: '16:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'T', name: 'T', startTime: '11:00', endTime: '20:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'U', name: 'U', startTime: '13:00', endTime: '20:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'V', name: 'V', startTime: '12:00', endTime: '20:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'W', name: 'W', startTime: '13:30', endTime: '18:00', breakTime: '0:00', workHours: 4.5 },
  { id: 'X', name: 'X', startTime: '10:00', endTime: '14:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'Y', name: 'Y', startTime: '10:00', endTime: '13:00', breakTime: '0:00', workHours: 3.0 },
  { id: 'Z', name: 'Z', startTime: '14:00', endTime: '20:00', breakTime: '1:00', workHours: 5.0 },
  { id: '@', name: '@', startTime: '14:30', endTime: '20:00', breakTime: '1:00', workHours: 4.5 },
  { id: '★', name: '★', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 }
];

const formatDisplayValue = (value) => {
  const mapping = {
    'シフト休': '休', '欠勤': '欠', '通休': '通',
    '有休': '有', '遅刻': '遅', '早退': '早'
  };
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (typeof value === 'string') return mapping[value] || value;
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    Object.entries(mapping).forEach(([full, short]) => {
      displayType = displayType.replace(full, short);
    });
    return `${displayType}${value.hours ? `(${value.hours})` : ''}`;
  }
  return '';
};

const summarizePattern = (pattern, patterns, hasBreakArray) => {
  if (!pattern || pattern.length !== 5) return '未設定';
  const DAY_NAMES = ['月', '火', '水', '木', '金'];
  const lines = pattern.map((pId, index) => {
    const isBreak = Array.isArray(hasBreakArray) ? hasBreakArray[index] : true;
    const breakLabel = isBreak ? "" : "×"; 
    if (pId === 'シフト休') return `${DAY_NAMES[index]}:休`;
    const p = patterns.find(x => x.id === pId);
    if (!p) return `${DAY_NAMES[index]}:?`;
    return `${DAY_NAMES[index]}:${p.name}${breakLabel}`;
  });
  return `${lines.slice(0, 3).join(' ')}\n${lines.slice(3).join(' ')}`;
};

/**
 * -----------------------------------------------------------------------------
 * 2. UIコンポーネント (ビルドエラー回避のため1ファイルに集約)
 * -----------------------------------------------------------------------------
 */

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-600" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
  </svg>
);

const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isToday = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === 'input' && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [mode]);

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
    const hoverClass = disabled ? '' : 'hover:bg-opacity-80';
    if (typeof value === 'number' && value > 0) return `bg-green-50 ${hoverClass}`;
    if (value && typeof value === 'object' && 'type' in value) {
      if (value.type.includes('有休')) return `bg-yellow-50 ${hoverClass}`;
      return `bg-slate-100 ${hoverClass}`;
    }
    switch(value) {
      case '有休': return `bg-yellow-50 ${hoverClass}`;
      case '通休': return `bg-blue-50 ${hoverClass}`;
      case 'シフト休': return `bg-slate-100 ${hoverClass}`;
      case '欠勤': return `bg-red-50 ${hoverClass}`;
      default: return `bg-white ${disabled ? '' : 'hover:bg-slate-50'}`;
    }
  };

  const cellClasses = `border-b border-r ${borderClass} text-center text-xs h-10 flex items-center justify-center w-[60px] min-w-[60px] flex-shrink-0 transition-colors`;

  if (mode === 'view') {
    return (
      <div onClick={() => !disabled && setMode('select')} className={`${cellClasses} ${getBackgroundColor()} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${isToday ? 'ring-1 ring-inset ring-yellow-400' : ''}`}>
        <span className="truncate px-0.5 font-medium text-slate-700">{formatDisplayValue(value)}</span>
      </div>
    );
  }

  return (
    <div className={`${cellClasses} bg-white relative`}>
      {mode === 'select' ? (
        <select autoFocus onChange={handleSelectChange} onBlur={() => setMode('view')} className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-[10px] cursor-pointer appearance-none outline-none focus:ring-1 focus:ring-sky-400" defaultValue="">
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
        <input ref={inputRef} type="number" step="0.5" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onBlur={() => { onUpdate(editingSpecialShift ? { type: editingSpecialShift, hours: parseFloat(inputValue) } : parseFloat(inputValue)); setMode('view'); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-full h-full text-center text-xs outline-none bg-sky-50" />
      )}
    </div>
  );
};

const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  useEffect(() => setCurrentValue(value), [value]);
  const handleBlur = () => { if (currentValue.trim() !== value) onUpdate(currentValue.trim()); setIsEditing(false); };
  const wrapperClass = `h-10 text-[11px] border-b border-r border-slate-300 flex items-center px-2 overflow-hidden ${className}`;
  if (isEditing) {
    return (
      <div className={`${wrapperClass} bg-white`}><input type="text" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()} autoFocus className="w-full h-full bg-transparent outline-none" /></div>
    );
  }
  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`${wrapperClass} bg-white transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}><div className="font-semibold truncate w-full text-slate-700">{value}</div></div>
  );
};

const ShiftPatternEditor = ({ pattern, hasBreakArray, patterns, onApply, disabled = false }) => {
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

  const summaryText = useMemo(() => summarizePattern(pattern, patterns, hasBreakArray), [pattern, patterns, hasBreakArray]);

  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in duration-200" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-lg mb-4 text-slate-800 border-b pb-2">基本シフトパターン設定</h4>
            <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
                <div className="flex items-center justify-between mb-3">
                    <label className="font-bold text-xs text-orange-800">一括設定 (月〜金)</label>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="bulk-break" checked={bulkBreak} onChange={(e) => setBulkBreak(e.target.checked)} className="h-4 w-4 text-orange-600 rounded cursor-pointer" />
                        <label htmlFor="bulk-break" className="text-xs font-bold text-orange-700 cursor-pointer">休憩あり</label>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select value={bulkPatternId} onChange={(e) => setBulkPatternId(e.target.value)} className="flex-grow text-sm p-2 border border-slate-300 rounded-md bg-white outline-none focus:ring-2 focus:ring-orange-200">
                        <option value="シフト休">シフト休</option>
                        {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                    </select>
                    <button onClick={() => { setEditedPattern(Array(5).fill(bulkPatternId)); setEditedHasBreak(Array(5).fill(bulkBreak)); }} className="px-4 py-2 bg-orange-400 text-white rounded-md font-bold hover:bg-orange-500 transition-colors shadow-sm text-sm">適用</button>
                </div>
            </div>
            <div className="space-y-3 mb-6">
                {['月', '火', '水', '木', '金'].map((dayName, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <label className="col-span-1 font-bold text-sm text-slate-500">{dayName}</label>
                        <div className="col-span-8">
                            <select value={editedPattern[index]} onChange={(e) => { const np = [...editedPattern]; np[index] = e.target.value; setEditedPattern(np); }} className="w-full text-sm p-1.5 border border-slate-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-sky-100">
                                <option value="シフト休">シフト休</option>
                                {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                            </select>
                        </div>
                        <div className="col-span-3 flex items-center gap-2 justify-end">
                            <input type="checkbox" id={`break-${index}`} checked={editedHasBreak[index]} onChange={() => { const nb = [...editedHasBreak]; nb[index] = !nb[index]; setEditedHasBreak(nb); }} disabled={editedPattern[index] === 'シフト休'} className="h-4 w-4 text-sky-600 rounded cursor-pointer disabled:opacity-30" />
                            <label htmlFor={`break-${index}`} className="text-xs font-medium text-slate-600 cursor-pointer">休憩</label>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setIsOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-md font-bold hover:bg-slate-200 text-sm">キャンセル</button>
                <button onClick={() => { onApply(editedPattern, editedHasBreak); setIsOpen(false); }} className="px-6 py-2 bg-sky-500 text-white rounded-md font-bold shadow-md hover:bg-sky-600 transition-colors text-sm">保存する</button>
            </div>
        </div>
    </div>, document.body
  ) : null;

  return (
    <div className="h-full">
      <button onClick={() => !disabled && setIsOpen(true)} className={`w-full h-full flex items-center justify-center text-left p-1 rounded transition-colors ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-100'}`} disabled={disabled}>
        <div className="text-[9px] leading-tight font-bold whitespace-pre-wrap text-slate-600 text-center">{summaryText}</div>
      </button>
      {editorPopup}
    </div>
  );
};

/**
 * -----------------------------------------------------------------------------
 * 3. シフト表 & 業務一覧
 * -----------------------------------------------------------------------------
 */

const ShiftSchedule = ({ currentUser, isAdmin, schedule, staff, days, shiftPatterns, year, month, onUpdateSchedule, onDeleteStaff, onUpdateStaffInfo, onApplyStaffPattern, onToggleShiftSubmitted, onToggleShiftApproved, onToggleShiftRemanded }) => {
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
                const fixedWidth = 715; 
                container.scrollTo({ left: target.offsetLeft - fixedWidth - ((containerWidth - fixedWidth) / 2) + (target.clientWidth / 2), behavior: 'smooth' });
            }
        }, 500);
    }
  }, [year, month, days]);

  const widths = { role: 55, empId: 85, name: 115, setting: 165, submit: 65, remand: 65, approve: 65, del: 40 };
  const pos = {
    role: 0, empId: widths.role, name: widths.role + widths.empId,
    setting: widths.role + widths.empId + widths.name,
    submit: widths.role + widths.empId + widths.name + widths.setting,
    remand: widths.role + widths.empId + widths.name + widths.setting + widths.submit,
    approve: widths.role + widths.empId + widths.name + widths.setting + widths.submit + widths.remand,
    del: widths.role + widths.empId + widths.name + widths.setting + widths.submit + widths.remand + widths.approve
  };

  const gridTemplateColumns = `${widths.role}px ${widths.empId}px ${widths.name}px ${widths.setting}px ${widths.submit}px ${widths.remand}px ${widths.approve}px ${widths.del}px repeat(${days.length}, minmax(60px, 1fr))`;

  const stickyHeaderBase = "sticky top-0 z-30 bg-slate-100 p-1.5 border-b-2 border-r border-slate-200 font-bold text-[10px] text-center h-12 flex flex-col items-center justify-center text-slate-500";
  const stickyFixedHeaderBase = "sticky top-0 z-50 bg-slate-100 p-1.5 border-b-2 border-r border-slate-200 font-bold text-[11px] text-center h-12 flex items-center justify-center text-slate-600";
  const stickyFixedColBase = "sticky z-20 border-b border-r border-slate-200 flex items-center h-10";

  return (
    <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 overflow-hidden border border-slate-200">
      <div ref={scrollContainerRef} className="overflow-auto bg-white" style={{maxHeight: '70vh'}}>
        <div className="grid relative" style={{ gridTemplateColumns }}>
          <div className={stickyFixedHeaderBase} style={{ left: pos.role }}>役職</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.empId }}>社員番号</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.name }}>稼働名前</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.setting }}>基本シフト設定</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.submit }}>提出☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.remand }}>差戻☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.approve }}>承認☑</div>
          <div className={`${stickyFixedHeaderBase} border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.05)]`} style={{ left: pos.del }}>削除</div>
          {days.map(({ day, dayOfWeek }) => (
            <div key={day} className={`${stickyHeaderBase} whitespace-nowrap ${new Date().getDate() === day && (new Date().getMonth()+1) === month ? 'bg-yellow-50 text-yellow-700' : ''}`} data-day={day}>
              <div className="text-[9px] opacity-70 mb-1">{dayOfWeek}</div><div className="text-sm font-bold">{day}</div>
            </div>
          ))}
          {sortedStaff.map(s => {
            const isEditable = isAdmin || currentUser?.id === s.id;
            const isTodayStaff = (d) => new Date().getDate() === d && (new Date().getMonth()+1) === month;
            return (
              <React.Fragment key={s.id}>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.role }}><EditableStaffInfoCell value={s.role} onUpdate={v => onUpdateStaffInfo(s.id, 'role', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.empId }}><EditableStaffInfoCell value={s.employeeId} onUpdate={v => onUpdateStaffInfo(s.id, 'employeeId', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.name }}><EditableStaffInfoCell value={s.name} onUpdate={v => onUpdateStaffInfo(s.id, 'name', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white px-1`} style={{ left: pos.setting }}>
                    <ShiftPatternEditor pattern={s.defaultShift.pattern} hasBreakArray={s.defaultShift.hasBreakArray} patterns={shiftPatterns} onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} disabled={!isEditable} />
                </div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.submit }}><input type="checkbox" checked={s.shiftSubmitted?.[`${year}-${month}`] || false} onChange={() => onToggleShiftSubmitted(s.id)} className="h-4 w-4 rounded text-sky-500 cursor-pointer" disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.remand }}><input type="checkbox" checked={s.shiftRemanded?.[`${year}-${month}`] || false} onChange={() => onToggleShiftRemanded(s.id)} className="h-4 w-4 rounded text-red-500 cursor-pointer" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.approve }}><input type="checkbox" checked={s.shiftApproved?.[`${year}-${month}`] || false} onChange={() => onToggleShiftApproved(s.id)} className="h-4 w-4 rounded text-green-500 cursor-pointer" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.05)]`} style={{ left: pos.del }}>{isAdmin && <button onClick={() => onDeleteStaff(s.id)} className="p-1.5 hover:bg-red-50 rounded-full transition-colors"><DeleteIcon /></button>}</div>
                {days.map(({ day }) => (
                  <EditableCell key={day} value={schedule[s.id]?.[day] ?? ''} onUpdate={v => onUpdateSchedule(s.id, day, v)} disabled={!isEditable} borderClass="border-slate-100" isToday={isTodayStaff(day)} />
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  );
};

const TaskShortageDisplay = ({ tasks, staff, days, taskCountsByDay }) => (
    <div className="bg-white rounded-xl shadow-lg ring-1 ring-slate-200 p-6 overflow-hidden mt-8">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-orange-400 rounded-full"></span>
          業務稼働状況
      </h2>
      <div className="overflow-x-auto flex border border-slate-100 rounded-lg">
        <div className="flex-shrink-0 z-20 bg-slate-50 border-r-2 border-slate-200">
           <div className="w-[180px] h-10 border-b border-slate-200 flex items-center px-4 font-bold text-xs text-slate-500 bg-slate-50">業務名 / 定員</div>
           {tasks.map(t => (
             <div key={t.id} className="w-[180px] h-12 border-b border-slate-200 bg-white p-3 flex flex-col justify-center">
               <div className="font-bold text-sm text-slate-700 truncate">{t.name}</div>
               <div className="text-[10px] font-bold text-slate-400">定員: {t.requiredPersonnel}名</div>
             </div>
           ))}
        </div>
        <div className="flex-grow overflow-x-auto">
          <div className="flex">
            {days.map(({ day, dayOfWeek }) => (
              <div key={day} className="min-w-[60px] flex-shrink-0">
                <div className="h-10 border-b border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center">
                  <span className="text-[9px] opacity-60 leading-none mb-1">{dayOfWeek}</span>
                  <span className="text-xs font-bold text-slate-600">{day}</span>
                </div>
                {tasks.map(t => {
                   const count = taskCountsByDay?.[day]?.[t.id] || 0;
                   const isShort = count < t.requiredPersonnel && !['土','日'].includes(dayOfWeek);
                   return (
                     <div key={`${t.id}-${day}`} className={`h-12 border-b border-r border-slate-100 flex items-center justify-center font-bold text-sm ${isShort ? 'bg-red-50 text-red-600' : 'bg-white text-slate-700'}`}>
                        {count}
                     </div>
                   );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
);

/**
 * -----------------------------------------------------------------------------
 * 4. メインアプリケーションロジック
 * -----------------------------------------------------------------------------
 */

const MainContent = () => {
  const { oktaAuth, authState } = useOktaAuth();
  const [staff, setStaff] = useState([
    { id: '1', employeeId: '001', name: '管理者', role: '管理者', email: 'admin@example.com', defaultShift: { pattern: ['I','I','I','I','I'], hasBreakArray: [true,true,true,true,true] }, possibleTasks: ['t1'], shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {} }
  ]);
  const [tasks, setTasks] = useState([{ id: 't1', name: '主要業務', requiredPersonnel: 1 }]);
  const [schedule, setSchedule] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  const taskCountsByDay = useMemo(() => {
    const counts = {};
    days.forEach(({day}) => {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const val = schedule[key]?.[s.id]?.[day];
        const isWorking = (typeof val === 'number' && val > 0) || (val?.hours > 0);
        if (isWorking) {
          s.possibleTasks.forEach(tId => counts[day][tId] = (counts[day][tId] || 0) + 1);
        }
      });
    });
    return counts;
  }, [schedule, key, staff, tasks, days]);

  const handleUpdateSchedule = (staffId, day, value) => {
    setSchedule(prev => {
      const newMonth = { ...(prev[key] || {}) };
      const newStaff = { ...(newMonth[staffId] || {}) };
      newStaff[day] = value;
      newMonth[staffId] = newStaff;
      return { ...prev, [key]: newMonth };
    });
  };

  const handleApplyStaffPattern = (staffId, newPattern, hasBreakArray) => {
    setStaff(prevStaff => prevStaff.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreakArray } } : s));
    const newMonthSchedule = {};
    days.forEach(({day, dayOfWeek}) => {
        if (['土','日'].includes(dayOfWeek)) {
            newMonthSchedule[day] = 'シフト休';
        } else {
            const pId = newPattern[['月','火','水','木','金'].indexOf(dayOfWeek)];
            if (pId === 'シフト休') {
                newMonthSchedule[day] = 'シフト休';
            } else {
                const pattern = initialShiftPatterns.find(p => p.id === pId);
                if (pattern) {
                    const isBreak = hasBreakArray[['月','火','水','木','金'].indexOf(dayOfWeek)];
                    newMonthSchedule[day] = isBreak ? pattern.workHours : (pattern.workHours + 1);
                }
            }
        }
    });
    setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [staffId]: newMonthSchedule } }));
  };

  if (!authState) return <div className="flex items-center justify-center h-screen text-slate-400 font-medium">認証状態を確認中...</div>;
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6]">
        <div className="p-8 bg-white rounded-2xl shadow-xl border border-slate-100 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">digsy シフト管理システム</h2>
            <button onClick={() => oktaAuth.signInWithRedirect()} className="px-8 py-3 bg-orange-400 text-white rounded-xl font-bold shadow-lg hover:bg-orange-500 transition-all transform hover:scale-105">Oktaでログイン</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-slate-800 p-2 sm:p-6 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-8">
        <header className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-slate-50 rounded-xl px-4 py-2 border border-slate-100 shadow-inner">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none font-bold text-slate-700 text-2xl outline-none cursor-pointer">
                {Array.from({length: 5}, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-sm font-bold text-slate-400 ml-1">年</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none font-bold text-slate-700 text-2xl outline-none ml-4 cursor-pointer">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <span className="text-sm font-bold text-slate-400 ml-1">月</span>
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500">digsy SHIFT</h1>
          </div>
        </header>

        <ShiftSchedule 
          currentUser={staff[0]} isAdmin={true} schedule={schedule[key] || {}} staff={staff} days={days} shiftPatterns={initialShiftPatterns} year={year} month={month}
          onUpdateSchedule={handleUpdateSchedule} onDeleteStaff={()=>{}} 
          onUpdateStaffInfo={(id,f,v)=>setStaff(prev=>prev.map(s=>s.id===id?{...s,[f]:v}:s))}
          onApplyStaffPattern={handleApplyStaffPattern}
          onToggleShiftSubmitted={(id)=>setStaff(prev=>prev.map(s=>s.id===id?{...s,shiftSubmitted:{...s.shiftSubmitted,[key]:!s.shiftSubmitted[key]}}:s))}
          onToggleShiftApproved={(id)=>setStaff(prev=>prev.map(s=>s.id===id?{...s,shiftApproved:{...s.shiftApproved,[key]:!s.shiftApproved[key]}}:s))}
          onToggleShiftRemanded={(id)=>setStaff(prev=>prev.map(s=>s.id===id?{...s,shiftRemanded:{...s.shiftRemanded,[key]:!s.shiftRemanded[key]}}:s))}
        />

        <TaskShortageDisplay tasks={tasks} staff={staff} days={days} taskCountsByDay={taskCountsByDay} />
        
        <footer className="text-center pt-8 text-xs font-bold text-slate-300 tracking-widest uppercase pb-10">Smart Shift Scheduler v2.0</footer>
      </div>
    </div>
  );
};

const App = () => {
  const navigate = useNavigate();
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

  const oktaAuth = new OktaAuth({
    issuer: 'https://dev-000000.okta.com/oauth2/default',
    clientId: '0oa00000000000000000',
    redirectUri: window.location.origin + '/login/callback',
  });

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      <Routes>
        <Route path="/login/callback" element={<LoginCallback />} />
        <Route path="/*" element={<MainContent />} />
      </Routes>
    </Security>
  );
};

export default App;
