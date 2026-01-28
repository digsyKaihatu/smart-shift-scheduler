import React, { useRef, useMemo, useEffect } from 'react';
import { summarizePattern } from '../../utils/scheduleUtils.js';
import { EditableCell, EditableStaffInfoCell } from '../common/EditableCells.jsx';
import { DeleteIcon, SetHolidayIcon, UnlockIcon } from '../common/Icons.jsx';
import ScheduleShiftPatternEditor from './ScheduleShiftPatternEditor.jsx';

// -----------------------------------------------------------------------------
// メインコンポーネント: ShiftSchedule
// -----------------------------------------------------------------------------

const ShiftSchedule = ({ 
    currentUser, 
    isAdmin, 
    schedule, 
    staff = [], 
    days = [],
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
  const hasScrolledRef = useRef(false); // 初回スクロール制御用フラグ
  
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
    if (safeDays.length === 0) return;
    if (hasScrolledRef.current) return;

    const today = new Date();
    if (today.getFullYear() === year && (today.getMonth() + 1) === month) {
        hasScrolledRef.current = true;
        setTimeout(() => {
            const container = containerRef.current;
            if (!container) return;

            const target = container.querySelector(`[data-day="${today.getDate()}"]`);
            if (target) {
                const fixedColumnsWidth = Object.values(widths).reduce((a, b) => a + b, 0);
                const elementLeft = target.offsetLeft;
                const scrollTo = elementLeft - fixedColumnsWidth - 50; 

                container.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
            }
        }, 300);
    } else {
        hasScrolledRef.current = true;
    }
  }, [year, month, safeDays, widths]);

  // スタイル定義
  const stickyHeaderStyle = (key) => ({
    position: 'sticky',
    left: stickyPositions[key],
    width: widths[key],
    minWidth: widths[key],
    maxWidth: widths[key],
    zIndex: 50 
  });

  const stickyCellStyle = (key) => ({
    position: 'sticky',
    left: stickyPositions[key],
    width: widths[key],
    minWidth: widths[key],
    maxWidth: widths[key],
    zIndex: 30 
  });

  const headerRowClass = "flex w-max";
  const headerCellBase = "sticky top-0 p-1.5 border-b-2 border-r border-slate-300 font-bold text-[11px] text-center h-12 flex items-center justify-center flex-shrink-0 box-border";
  const cellBase = "bg-white border-b border-r border-slate-300 flex items-center h-10 flex-shrink-0 box-border";

  return (
    <>
        <style>{`
            .custom-scrollbar::-webkit-scrollbar { height: 12px; width: 12px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        `}</style>
        
        <div 
            ref={containerRef}
            className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-auto border border-slate-200 h-[75vh] custom-scrollbar relative outline-none"
        >
            <div className="min-w-max">
                {/* ヘッダー行 */}
                <div className={`${headerRowClass} sticky top-0 z-40`}>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('role')}>役職</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('empId')}>社員番号</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('name')}>稼働名前</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('setting')}>基本シフト設定</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('submit')}>提出☑</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('remand')}>差戻☑</div>
                    <div className={`${headerCellBase} bg-slate-200`} style={stickyHeaderStyle('approve')}>承認☑</div>
                    <div className={`${headerCellBase} bg-slate-200 border-r-2`} style={stickyHeaderStyle('del')}>削除</div>

                    {safeDays.map(({ day, dayOfWeek }) => {
                        const isToday = new Date().getDate() === day && (new Date().getMonth()+1) === month;
                        const isHoliday = holidays.includes(day);

                        let headerColorClass = "bg-slate-200 text-slate-800";
                        if (isToday) {
                            headerColorClass = "bg-yellow-100 text-yellow-900 border-yellow-300";
                        } else if (dayOfWeek === '土') {
                            headerColorClass = "bg-sky-100 text-sky-800 border-sky-200";
                        } else if (dayOfWeek === '日' || isHoliday) {
                            headerColorClass = "bg-pink-100 text-pink-800 border-pink-200";
                        }

                        return (
                            <div 
                                key={day} 
                                className={`${headerCellBase} ${headerColorClass} whitespace-nowrap w-[75px] min-w-[75px] max-w-[75px] flex-col`} 
                                style={{ zIndex: 40 }}
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
                {sortedStaff.map((s, rowIndex) => { // rowIndex を取得
                    const isEditable = isAdmin || currentUser?.id === s.id;
                    const defaultShift = s.defaultShift || { pattern: [], hasBreakArray: [] };
                    
                    return (
                        <div key={s.id} className="flex w-max group hover:bg-slate-50 transition-colors">
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
                                <ScheduleShiftPatternEditor 
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

                            {/* 日付セル */}
                            {safeDays.map(({ day, dayOfWeek }, colIndex) => { // colIndex を取得
                                const isHoliday = holidays.includes(day);
                                const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
                                return (
                                <EditableCell 
                                    key={day} 
                                    value={schedule[s.id]?.[day] ?? ''} 
                                    onUpdate={v => onUpdateSchedule(s.id, day, v)} 
                                    isAdmin={isAdmin} 
                                    disabled={!isEditable} 
                                    borderClass="border-slate-200" 
                                    isToday={new Date().getDate() === day && (new Date().getMonth()+1) === month} 
                                    isHoliday={isHoliday}
                                    isWeekend={isWeekend}
                                    dayOfWeek={dayOfWeek}
                                    rowIndex={rowIndex} // 行番号を渡す
                                    colIndex={colIndex} // 列番号を渡す
                                />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    </>
  );
};

export default ShiftSchedule;
