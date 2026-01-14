import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { EditableCell, EditableStaffInfoCell } from '../common/EditableCells';

// パターンサマリー生成
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

// パターン編集コンポーネント（インライン定義）
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
    <div className="h-full">
      <button onClick={() => !disabled && setIsOpen(true)} className={`w-full h-full flex items-center justify-start text-left p-1 rounded transition-colors ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-200'}`} disabled={disabled}>
        <div className="text-[10px] leading-tight font-semibold whitespace-pre-wrap text-slate-700">{summary}</div>
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
                const fixedWidth = 715; 
                const scrollLeft = target.offsetLeft - fixedWidth - ((containerWidth - fixedWidth) / 2) + (target.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }, 300);
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

  const gridTemplateColumns = `${widths.role}px ${widths.empId}px ${widths.name}px ${widths.setting}px ${widths.submit}px ${widths.remand}px ${widths.approve}px ${widths.del}px repeat(${days.length}, minmax(70px, 1fr))`;

  const stickyHeaderBase = "sticky top-0 z-30 bg-slate-200 p-1.5 border-b-2 border-r border-slate-300 font-bold text-[11px] text-center h-12 flex flex-col items-center justify-center";
  const stickyFixedHeaderBase = "sticky top-0 z-50 bg-slate-200 p-1.5 border-b-2 border-r border-slate-300 font-bold text-[11px] text-center h-12 flex items-center justify-center";
  const stickyFixedColBase = "sticky z-20 border-b border-r border-slate-300 flex items-center h-10";

  return (
    <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-hidden border border-slate-200">
      <div ref={scrollContainerRef} className="overflow-auto bg-white" style={{maxHeight: '75vh'}}>
        <div className="grid relative" style={{ gridTemplateColumns }}>
          <div className={stickyFixedHeaderBase} style={{ left: pos.role }}>役職</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.empId }}>社員番号</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.name }}>稼働名前</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.setting }}>基本シフト設定</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.submit }}>提出☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.remand }}>差戻☑</div>
          <div className={stickyFixedHeaderBase} style={{ left: pos.approve }}>承認☑</div>
          <div className={`${stickyFixedHeaderBase} border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.1)]`} style={{ left: pos.del }}>削除</div>
          
          {days.map(({ day, dayOfWeek }) => {
            const isToday = new Date().getDate() === day && (new Date().getMonth()+1) === month;
            const isH = holidays.includes(day);
            return (
              <div key={day} className={`${stickyHeaderBase} whitespace-nowrap ${isToday ? 'bg-yellow-50' : ''}`} data-day={day}>
                <div className="text-[9px] opacity-70 mb-1">{dayOfWeek}</div><div className="text-sm font-bold">{day}</div>
                {isAdmin && <button onClick={() => onSetDayAsHolidayForAll(day)} className="group absolute bottom-0.5 right-0.5 p-0.5 bg-white/50 rounded-full hover:bg-sky-100">{staff.every(s => typeof (schedule[s.id]?.[day]) === 'object' && (schedule[s.id]?.[day])?.locked) ? <UnlockIcon /> : <SetHolidayIcon />}</button>}
              </div>
            );
          })}

          {sortedStaff.map(s => {
            const isEditable = isAdmin || currentUser?.id === s.id;
            return (
              <React.Fragment key={s.id}>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.role }}><EditableStaffInfoCell value={s.role} onUpdate={v => onUpdateStaffInfo(s.id, 'role', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.empId }}><EditableStaffInfoCell value={s.employeeId} onUpdate={v => onUpdateStaffInfo(s.id, 'employeeId', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white`} style={{ left: pos.name }}><EditableStaffInfoCell value={s.name} onUpdate={v => onUpdateStaffInfo(s.id, 'name', v)} disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white px-1`} style={{ left: pos.setting }}>
                    <ShiftPatternEditor 
                        pattern={s.defaultShift.pattern} 
                        hasBreakArray={s.defaultShift.hasBreakArray} 
                        patterns={shiftPatterns} 
                        onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} 
                        summary={summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray)} 
                        disabled={!isEditable} 
                    />
                </div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.submit }}><input type="checkbox" checked={s.shiftSubmitted?.[`${year}-${month}`] || false} onChange={() => onToggleShiftSubmitted(s.id)} className="h-4 w-4 rounded text-sky-600" disabled={!isEditable} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.remand }}><input type="checkbox" checked={s.shiftRemanded?.[`${year}-${month}`] || false} onChange={() => onToggleShiftRemanded(s.id)} className="h-4 w-4 rounded text-red-600" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center`} style={{ left: pos.approve }}><input type="checkbox" checked={s.shiftApproved?.[`${year}-${month}`] || false} onChange={() => onToggleShiftApproved(s.id)} className="h-4 w-4 rounded text-green-600" disabled={!isAdmin} /></div>
                <div className={`${stickyFixedColBase} bg-white justify-center border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.1)]`} style={{ left: pos.del }}>{isAdmin && <button onClick={() => onDeleteStaff(s.id)} className="p-1 hover:bg-red-50 rounded-full"><DeleteIcon /></button>}</div>
                {days.map(({ day }) => (
                  <EditableCell key={day} value={schedule[s.id]?.[day] ?? ''} onUpdate={v => onUpdateSchedule(s.id, day, v)} isAdmin={isAdmin} disabled={!isEditable} borderClass="border-slate-200" isToday={new Date().getDate() === day && (new Date().getMonth()+1) === month} />
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  );
};

export default ShiftSchedule;
