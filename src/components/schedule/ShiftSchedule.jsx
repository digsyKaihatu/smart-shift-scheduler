import React, { useRef, useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { summarizePattern } from '../../utils/scheduleUtils';
import { EditableCell, EditableStaffInfoCell } from '../common/EditableCells';
import { DeleteIcon, SetHolidayIcon, UnlockIcon } from '../common/Icons';
import ScheduleShiftPatternEditor from './ScheduleShiftPatternEditor';

// -----------------------------------------------------------------------------
// Context Menu Component
// -----------------------------------------------------------------------------
const ContextMenu = ({ position, onClose, onAction }) => {
    if (!position) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999]" 
            onMouseDown={onClose}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div 
                className="absolute bg-white border border-slate-200 rounded-md shadow-lg py-1 min-w-[160px]"
                style={{ top: position.y, left: position.x }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="px-3 py-2 border-b border-slate-100 text-xs font-bold text-slate-500 bg-slate-50">
                    一括操作
                </div>
                <button onClick={() => onAction('シフト休')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">シフト休</button>
                <button onClick={() => onAction('有休')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">有休</button>
                <button onClick={() => onAction('欠勤')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">欠勤</button>
                <div className="border-t border-slate-100 my-1"></div>
                <button onClick={() => onAction('')} className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-100">クリア</button>
            </div>
        </div>,
        document.body
    );
};

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
  const hasScrolledRef = useRef(false);
  
  // 選択範囲管理用ステート
  const [selection, setSelection] = useState(null); // { start: {row, col}, end: {row, col} }
  const [isSelecting, setIsSelecting] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y }

  // マウスアップで選択終了
  useEffect(() => {
      const handleWindowMouseUp = () => setIsSelecting(false);
      window.addEventListener('mouseup', handleWindowMouseUp);
      return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  const safeDays = useMemo(() => Array.isArray(days) ? days : [], [days]);
  const sortedStaff = useMemo(() => {
    if (!Array.isArray(staff)) return [];
    return [...staff].sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true }));
  }, [staff]);
  
  const widths = { 
    role: 60, empId: 90, name: 120, setting: 170, 
    submit: 65, remand: 65, approve: 65, del: 45 
  };

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

  useEffect(() => {
    if (!containerRef.current || safeDays.length === 0 || hasScrolledRef.current) return;

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

  // セル選択ロジック
  const handleCellMouseDown = (row, col, e) => {
      if (e.button !== 0) return; // 左クリックのみ
      setSelection({ start: { row, col }, end: { row, col } });
      setIsSelecting(true);
      setContextMenu(null);
  };

  const handleCellMouseEnter = (row, col) => {
      if (isSelecting) {
          setSelection(prev => ({ ...prev, end: { row, col } }));
      }
  };

  // 追加: フォーカス移動時（矢印キー等）に選択状態を同期する
  const handleCellFocus = (row, col) => {
      // マウスでの範囲選択中は更新しない（ドラッグ操作を優先）
      if (!isSelecting) {
          setSelection({ start: { row, col }, end: { row, col } });
      }
  };

  const handleCellContextMenu = (row, col, e) => {
      e.preventDefault();
      // 選択範囲外を右クリックした場合、そのセルだけを選択状態にする
      if (!isCellSelected(row, col)) {
          setSelection({ start: { row, col }, end: { row, col } });
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const isCellSelected = (row, col) => {
      if (!selection) return false;
      const { start, end } = selection;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  const handleBulkUpdate = (value) => {
      if (!selection) return;
      const { start, end } = selection;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);

      for (let r = minRow; r <= maxRow; r++) {
          const staffMember = sortedStaff[r];
          if (!staffMember) continue;
          for (let c = minCol; c <= maxCol; c++) {
              const dayObj = safeDays[c];
              if (!dayObj) continue;
              // 権限チェック
              if (isAdmin || currentUser?.id === staffMember.id) {
                  onUpdateSchedule(staffMember.id, dayObj.day, value);
              }
          }
      }
      setContextMenu(null);
  };

  const stickyHeaderStyle = (key) => ({
    position: 'sticky', left: stickyPositions[key], width: widths[key], minWidth: widths[key], maxWidth: widths[key], zIndex: 50 
  });
  const stickyCellStyle = (key) => ({
    position: 'sticky', left: stickyPositions[key], width: widths[key], minWidth: widths[key], maxWidth: widths[key], zIndex: 30 
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
            className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-auto border border-slate-200 h-[75vh] custom-scrollbar relative outline-none select-none"
        >
            <div className="min-w-max">
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
                        if (isToday) headerColorClass = "bg-yellow-100 text-yellow-900 border-yellow-300";
                        else if (dayOfWeek === '土') headerColorClass = "bg-sky-100 text-sky-800 border-sky-200";
                        else if (dayOfWeek === '日' || isHoliday) headerColorClass = "bg-pink-100 text-pink-800 border-pink-200";

                        return (
                            <div key={day} className={`${headerCellBase} ${headerColorClass} whitespace-nowrap w-[75px] min-w-[75px] max-w-[75px] flex-col`} style={{ zIndex: 40 }} data-day={day}>
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

                {sortedStaff.map((s, rowIndex) => {
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
                                <ScheduleShiftPatternEditor pattern={defaultShift.pattern} hasBreakArray={defaultShift.hasBreakArray} patterns={shiftPatterns} onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} summary={summarizePattern(defaultShift.pattern, shiftPatterns, defaultShift.hasBreakArray)} disabled={!isEditable} />
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

                            {safeDays.map(({ day, dayOfWeek }, colIndex) => {
                                const isHoliday = holidays.includes(day);
                                const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
                                const selected = isCellSelected(rowIndex, colIndex);

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
                                    rowIndex={rowIndex}
                                    colIndex={colIndex}
                                    isSelected={selected}
                                    onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                                    onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                                    onFocus={() => handleCellFocus(rowIndex, colIndex)} // 追加: フォーカス移動時の同期
                                    onContextMenu={(e) => handleCellContextMenu(rowIndex, colIndex, e)}
                                />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* コンテキストメニューの表示 */}
        <ContextMenu 
            position={contextMenu} 
            onClose={() => setContextMenu(null)} 
            onAction={handleBulkUpdate} 
        />
    </>
  );
};

export default ShiftSchedule;
