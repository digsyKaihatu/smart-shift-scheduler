// src/MainContent.jsx
import React, { useState, useMemo } from 'react';

// Hooks & Services
import { useShiftData } from './hooks/useShiftData.js';
import { useUserStatus } from './hooks/useUserStatus.js';
import { useShiftActions } from './hooks/useShiftActions.js';
import { useTaskCounts } from './hooks/useTaskCounts.js';
import { chatService } from './services/chatService.js';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils.js';
import { downloadScheduleCSV } from './utils/csvExporter.js';
import { checkPatternHasBreak, generateScheduleForMonth } from './utils/scheduleUtils.js';

// Components
import LoadingScreen from './components/common/LoadingScreen.jsx';
import Header from './components/layout/Header.jsx';
import ShiftSchedule from './components/schedule/ShiftSchedule.jsx';
import MonthlyCalendar from './components/schedule/MonthlyCalendar.jsx';
import ShiftPatternDisplay from './components/schedule/ShiftPatternDisplay.jsx';
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay.jsx';
import GlobalModals from './components/containers/GlobalModals.jsx';

const MainContent = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // --- 状態管理フックの呼び出し ---
  const {
    staff, setStaff, schedule, updateShiftItem, updateShiftItems, updateLocalShiftItem,
    updateIndividualStatus, approveMemberShift,
    tasks, setTasks, shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData(year, month);

  const { currentUser, isAdmin } = useUserStatus(staff, adminConfig, initialDataLoaded);

  const actions = useShiftActions({
    staff, setStaff, schedule, year, month, adminConfig, shiftPatterns,
    setIsLoading, setLoadingMessage, updateShiftItems,
    updateIndividualStatus, approveMemberShift
  });

  // UI状態管理
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMemberManagementOpen, setIsMemberManagementOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [holidayConfirmation, setHolidayConfirmation] = useState(null);

  // --- 定数・メモ化 ---
  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  const taskCountsByDay = useTaskCounts(initialDataLoaded, daysInMonth, tasks, staff, schedule, key);
  const currentMonthSchedule = schedule[key] || {};

  // --- イベントハンドラー ---
  
  // 個別シフト更新
  const handleUpdateSchedule = (staffId, day, value) => {
    const targetStaff = staff.find(s => s.id === staffId);
    if (!targetStaff) return;

    const isApproved = targetStaff.shiftApproved?.[key];

    const currentVal = currentMonthSchedule[staffId]?.[day];
    const existingChange = actions.pendingChanges.find(c => c.staffId === staffId && c.day === day);
    const originalValue = existingChange ? existingChange.originalValue : currentVal;

    const normOrg = (originalValue === undefined || originalValue === null) ? '' : originalValue;
    const normVal = (value === undefined || value === null) ? '' : value;
    const isSameAsOriginal = JSON.stringify(normOrg) === JSON.stringify(normVal);

    if (JSON.stringify(currentVal) === JSON.stringify(value)) return;

    let newValue = value;

    if (isApproved) {
        if (isSameAsOriginal) {
            actions.setPendingChanges(prev => {
                const newChanges = prev.filter(c => !(c.staffId === staffId && c.day === day));
                if (newChanges.length === 0) actions.setShowModificationConfirm(false);
                return newChanges;
            });
            updateLocalShiftItem(year, month, staffId, day, originalValue);
        } else {
            if (typeof value === 'number') newValue = { type: '稼働', hours: value, modified: true };
            else if (typeof value === 'string') newValue = { type: value, modified: true };
            else if (typeof value === 'object' && value !== null) newValue = { ...value, modified: true };
            
            actions.setPendingChanges(prev => [...prev.filter(c => !(c.staffId === staffId && c.day === day)), {
                staffId, day, displayValue: formatValue(newValue), rawYear: year, rawMonth: month, rawValue: newValue, originalValue
            }]);
            actions.setShowModificationConfirm(true);
            updateLocalShiftItem(year, month, staffId, day, newValue);
        }
    } else {
        if (isAdmin && (value === '欠勤' || value === '欠')) {
            actions.setAbsenceNotificationConfirmation({ staffMember: targetStaff, day, value });
        }
        updateShiftItem(year, month, staffId, day, newValue);
    }
  };

  // 一括休日/解除設定ロジック
  const handleConfirmHoliday = () => {
    if (!holidayConfirmation) return;
    const { day, isUnlocking } = holidayConfirmation;
    const updates = [];

    staff.forEach(s => {
      const currentVal = currentMonthSchedule[s.id]?.[day];
      if (isUnlocking) {
        if (typeof currentVal === 'object' && currentVal?.locked) {
          updates.push({ staffId: s.id, day, value: '' });
        }
      } else {
        updates.push({ staffId: s.id, day, value: { type: 'シフト休', locked: true } });
      }
    });

    if (updates.length > 0) updateShiftItems(year, month, updates);
    setHolidayConfirmation(null);
  };

  // 基本パターン適用ロジック
  const handleApplyStaffPattern = (sid, p, hb) => {
    const targetStaff = staff.find(s => s.id === sid);
    if (!targetStaff) return;

    const isApproved = targetStaff.shiftApproved?.[key];

    // 1. スタッフマスタ（基本シフト設定）の更新
    setStaff(prev => prev.map(s => s.id === sid ? { ...s, defaultShift: { pattern: p, hasBreakArray: hb } } : s));
    
    // 2. 新しいパターンで1ヶ月分のスケジュールを生成
    const newStaffMock = { ...targetStaff, defaultShift: { pattern: p, hasBreakArray: hb } };
    const newGenerated = generateScheduleForMonth(year, month, [newStaffMock], shiftPatterns, currentMonthHolidays)[sid] || {};

    const pendingNew = [];
    const updates = [];

    days.forEach(d => {
      const day = d.day;
      const newExpectedValue = newGenerated[day] ?? '';
      const currentValue = currentMonthSchedule[sid]?.[day] ?? '';

      // カレンダーの現在の値が「手動で保護すべき値」か判定
      let isProtected = false;
      if (typeof currentValue === 'object' && currentValue !== null) {
          if (currentValue.locked) isProtected = true; 
          else if (currentValue.type && currentValue.type !== '稼働' && currentValue.type !== 'シフト休') isProtected = true;
      } else if (typeof currentValue === 'string' && currentValue !== '' && currentValue !== 'シフト休') {
          if (isNaN(parseFloat(currentValue))) isProtected = true; 
      }

      // 保護されていないセルであれば上書き対象
      if (!isProtected) {
          let normCurrent = currentValue;
          if (typeof currentValue === 'object' && currentValue !== null) {
              normCurrent = currentValue.type === '稼働' ? currentValue.hours : currentValue.type;
          }
          
          if (String(normCurrent) !== String(newExpectedValue)) {
              if (isApproved) {
                  let newValue = newExpectedValue;
                  if (typeof newValue === 'number') newValue = { type: '稼働', hours: newValue, modified: true };
                  else if (typeof newValue === 'string') newValue = { type: newValue, modified: true };
                  
                  pendingNew.push({
                      staffId: sid, day, 
                      displayValue: formatValue(newValue), 
                      rawYear: year, rawMonth: month, 
                      rawValue: newValue, originalValue: currentValue
                  });
                  updates.push({ staffId: sid, day, value: newValue });
              } else {
                  updates.push({ staffId: sid, day, value: newExpectedValue });
              }
          }
      }
    });

    if (isApproved && pendingNew.length > 0) {
        actions.setPendingChanges(prev => {
            const filtered = prev.filter(c => !(c.staffId === sid && pendingNew.some(n => n.day === c.day)));
            return [...filtered, ...pendingNew];
        });
        actions.setShowModificationConfirm(true);
    }

    if (updates.length > 0) {
        updateShiftItems(year, month, updates);
    }
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'staff') setStaff(prev => prev.filter(s => s.id !== confirmDelete.id));
    else {
      setTasks(prev => prev.filter(t => t.id !== confirmDelete.id));
      setStaff(prev => prev.map(s => ({ ...s, possibleTasks: s.possibleTasks.filter(tid => tid !== confirmDelete.id) })));
    }
    setConfirmDelete(null);
  };

  // --- レンダリング ---
  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;

  const adminControls = isAdmin ? (
    <>
      <button onClick={() => setStaff(prev => [...prev, { id: `s${Date.now()}`, employeeId: 'New', name: '新規メンバー', role: 'OP', chatUserId: '', possibleTasks: [], defaultShift: { pattern: ['I','I','I','I','I'], hasBreakArray: [true, true, true, true, true] }, shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {} }])} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ メンバー</button>
      <button onClick={() => setTasks(prev => [...prev, { id: `t${Date.now()}`, name: '新業務', requiredPersonnel: 3 }])} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ 業務</button>
      <button onClick={() => setIsTaskEditorOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">業務担当</button>
      <button onClick={() => setIsMemberManagementOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">メンバー管理</button>
      <button onClick={() => setIsAdminSettingsOpen(true)} className="px-3 py-1.5 bg-slate-500 text-white text-xs font-semibold rounded-md hover:bg-slate-600 shadow-sm whitespace-nowrap">通知設定</button>
      <button onClick={() => downloadScheduleCSV(staff, schedule, shiftPatterns, year, month)} className="px-3 py-1.5 bg-slate-600 text-white text-xs font-semibold rounded-md hover:bg-slate-700 shadow-sm whitespace-nowrap">CSV</button>
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans relative">
      {/* 承認後変更の通知バー */}
      {actions.pendingChanges.length > 0 && !actions.showModificationConfirm && (
        <div className="fixed top-0 left-0 right-0 bg-orange-100 border-b border-orange-300 text-orange-800 px-4 py-2 z-[60] shadow-md flex justify-between items-center animate-slideDown">
          <div className="flex items-center gap-2">
            <span className="font-bold">承認済みシフトの変更が {actions.pendingChanges.length} 件保留されています。<span className="text-sm font-normal ml-2">※確定するまで保存されません</span></span>
          </div>
          <button onClick={actions.handleFinalizeModification} className="px-4 py-1 bg-orange-500 text-white text-sm font-bold rounded hover:bg-orange-600 shadow">変更を確定して通知</button>
        </div>
      )}

      <div className="max-w-screen-2xl mx-auto pt-2">
        <Header 
          year={year} month={month} setYear={setYear} setMonth={setMonth} 
          saveStatus={saveStatus} setIsHelpOpen={setIsHelpOpen} 
        />

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} schedule={currentMonthSchedule} staff={staff} tasks={tasks} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} 
            onDeleteStaff={(id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name })} 
            onUpdateStaffInfo={(id, f, v) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [f]: v } : s))}
            onApplyStaffPattern={handleApplyStaffPattern} 
            onToggleShiftSubmitted={actions.handleToggleShiftSubmitted}
            onToggleShiftApproved={actions.handleToggleShiftApproved} 
            onToggleShiftRemanded={actions.handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={(day) => {
               const isUnlocking = staff.every(s => typeof currentMonthSchedule[s.id]?.[day] === 'object' && currentMonthSchedule[s.id]?.[day]?.locked);
               setHolidayConfirmation({ day, isUnlocking });
            }}
          />
          
          <ShiftPatternDisplay patterns={shiftPatterns} onAddPattern={(p) => setShiftPatterns(prev => [...prev, p].sort((a,b)=>a.id.localeCompare(b.id)))} additionalControls={adminControls} />
          
          <TaskShortageDisplay 
            isAdmin={isAdmin} currentUser={currentUser} tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay} year={year} month={month} schedule={currentMonthSchedule}
            onUpdateTask={(id, updates) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))}
            onDeleteTask={(id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t => t.id === id)?.name })}
            onUpdateTaskPersonnel={(id, c) => setTasks(prev => prev.map(t => t.id === id ? { ...t, requiredPersonnel: c } : t))}
            onUpdateTaskStaff={(tid, sids) => setStaff(prev => prev.map(s => ({ ...s, possibleTasks: sids.includes(s.id) ? [...new Set([...s.possibleTasks, tid])] : s.possibleTasks.filter(id => id !== tid) })))}
          />

          <MonthlyCalendar schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month} isAdmin={isAdmin} currentUser={currentUser} onUpdateSchedule={updateShiftItem} />
        </main>

        <GlobalModals 
          flags={{ isMemberManagementOpen, isAdminSettingsOpen, isTaskEditorOpen, isHelpOpen, confirmDelete, approvalStaff: staff.find(s => s.id === actions.approvalModalStaffId), submissionConfirmation: actions.submissionConfirmation, remandConfirmation: actions.remandConfirmation, holidayConfirmation, absenceNotificationConfirmation: actions.absenceNotificationConfirmation, approvalCancellationConfirmation: actions.approvalCancellationConfirmation, showModificationConfirm: actions.showModificationConfirm }}
          data={{ staff, tasks, adminConfig, shiftPatterns, year, month, holidays: currentMonthHolidays, currentMonthSchedule }}
          actions={{ setIsMemberManagementOpen, setIsAdminSettingsOpen, setIsTaskEditorOpen, setIsHelpOpen, handleSaveMemberManagement: (updated) => { setStaff(updated); setIsMemberManagementOpen(false); }, handleSaveAdminConfig: (cfg) => { setAdminConfig(cfg); setIsAdminSettingsOpen(false); }, handleMigrateData: () => {}, handleBulkUpdateStaffTasks: (map) => { setStaff(prev => prev.map(s => ({ ...s, possibleTasks: Object.entries(map).filter(([tid, sids]) => sids.includes(s.id)).map(([tid]) => tid) }))); setIsTaskEditorOpen(false); }, executeDelete, setConfirmDelete, handleConfirmApproval: actions.handleConfirmApproval, setApprovalModalStaffId: actions.setApprovalModalStaffId, handleConfirmSubmission: actions.handleConfirmSubmission, setSubmissionConfirmation: actions.setSubmissionConfirmation, handleConfirmRemand: actions.handleConfirmRemand, setRemandConfirmation: actions.setRemandConfirmation, handleConfirmHoliday, setHolidayConfirmation, handleAbsenceNotificationResponse: (send) => { if(send) chatService.sendAbsence(actions.absenceNotificationConfirmation.staffMember.name); actions.setAbsenceNotificationConfirmation(null); }, handleConfirmApprovalCancellation: actions.handleConfirmApprovalCancellation, setApprovalCancellationConfirmation: actions.setApprovalCancellationConfirmation, handleFinalizeModification: actions.handleFinalizeModification, setShowModificationConfirm: actions.setShowModificationConfirm }}
        />

        <footer className="text-center mt-6 text-sm text-slate-500 pb-8"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default MainContent;
