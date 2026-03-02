import React, { useState, useMemo, useEffect } from 'react';
import { useOktaAuth } from '@okta/okta-react';

// Hooks & Services
import { useShiftData } from './hooks/useShiftData';
import { useUserStatus } from './hooks/useUserStatus';
import { useShiftActions } from './hooks/useShiftActions';
import { chatService } from './services/chatService';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils';
import { downloadScheduleCSV } from './utils/csvExporter';

// Components
import LoadingScreen from './components/common/LoadingScreen';
import Legend from './components/schedule/Legend';
import ShiftSchedule from './components/schedule/ShiftSchedule';
import MonthlyCalendar from './components/schedule/MonthlyCalendar';
import ShiftPatternDisplay from './components/schedule/ShiftPatternDisplay';
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay';
import GlobalModals from './components/containers/GlobalModals';

const MainContent = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // データ取得フック
  const {
    staff, setStaff, schedule, updateShiftItem, updateShiftItems, updateLocalShiftItem, updateShiftUserMonth,
    tasks, setTasks, shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData(year, month);

  // ユーザー状態・権限フック (新規)
  const { currentUser, isAdmin, isAuthenticated } = useUserStatus(staff, adminConfig);

  // シフトアクションフック (新規)
  const actions = useShiftActions({
    staff, setStaff, schedule, year, month, adminConfig, shiftPatterns,
    setIsLoading, setLoadingMessage, updateShiftItems
  });

  // UI状態管理
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMemberManagementOpen, setIsMemberManagementOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [holidayConfirmation, setHolidayConfirmation] = useState(null);

  // 定数・メモ化
  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  // タスクカウント集計ロジック
  const [taskCountsByDay, setTaskCountsByDay] = useState({});
  useEffect(() => {
    if (!initialDataLoaded) return;
    const counts = {};
    for (let day = 1; day <= daysInMonth; day++) {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const entry = (schedule[key] || {})[s.id]?.[day];
        const isWorking = (typeof entry === 'number' && entry > 0) || (typeof entry === 'object' && entry?.hours > 0);
        if (isWorking) s.possibleTasks.forEach(tId => { if (counts[day][tId] !== undefined) counts[day][tId]++; });
      });
    }
    setTaskCountsByDay(counts);
  }, [schedule, key, staff, tasks, daysInMonth, initialDataLoaded]);

  // ハンドラー
  const handleUpdateSchedule = (staffId, day, value) => {
    const currentVal = schedule[key]?.[staffId]?.[day];
    if (JSON.stringify(currentVal) === JSON.stringify(value)) return;

    const isApproved = staff.find(s => s.id === staffId)?.shiftApproved?.[key];
    let newValue = value;

    if (isApproved) {
        if (typeof value === 'number') newValue = { type: '稼働', hours: value, modified: true };
        else if (typeof value === 'string') newValue = { type: value, modified: true };
        else if (typeof value === 'object' && value !== null) newValue = { ...value, modified: true };
        
        actions.setPendingChanges(prev => [...prev.filter(c => !(c.staffId === staffId && c.day === day)), {
            staffId, day, displayValue: formatValue(newValue), rawYear: year, rawMonth: month, rawValue: newValue
        }]);
        actions.setShowModificationConfirm(true);
        
        // Firestoreには保存せず、ローカルStateのみ更新
        updateLocalShiftItem(year, month, staffId, day, newValue);
    } else {
        if (isAdmin && value === '欠') {
            actions.setAbsenceNotificationConfirmation({ staffMember: staff.find(s => s.id === staffId), day, value });
        }
        updateShiftItem(year, month, staffId, day, newValue);
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

  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;

  const currentMonthSchedule = schedule[key] || {};
  const adminControls = isAdmin ? (
    <>
      <button onClick={() => setStaff(prev => [...prev, { id: `s${Date.now()}`, employeeId: 'New', name: '新規メンバー', role: 'OP', chatUserId: '', possibleTasks: [], defaultShift: { pattern: ['I','I','I','I','I'], hasBreak: true }, shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {} }])} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ メンバー</button>
      <button onClick={() => setTasks(prev => [...prev, { id: `t${Date.now()}`, name: '新業務', requiredPersonnel: 3 }])} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ 業務</button>
      <button onClick={() => setIsTaskEditorOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">業務担当</button>
      <button onClick={() => setIsMemberManagementOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">メンバー管理</button>
      <button onClick={() => setIsAdminSettingsOpen(true)} className="px-3 py-1.5 bg-slate-500 text-white text-xs font-semibold rounded-md hover:bg-slate-600 shadow-sm whitespace-nowrap">通知設定</button>
      <button onClick={() => downloadScheduleCSV(staff, schedule, shiftPatterns, year, month)} className="px-3 py-1.5 bg-slate-600 text-white text-xs font-semibold rounded-md hover:bg-slate-700 shadow-sm whitespace-nowrap">CSV</button>
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans relative">
      {actions.pendingChanges.length > 0 && !actions.showModificationConfirm && (
        <div className="fixed top-0 left-0 right-0 bg-orange-100 border-b border-orange-300 text-orange-800 px-4 py-2 z-[60] shadow-md flex justify-between items-center animate-slideDown">
          <div className="flex items-center gap-2">
            <span className="font-bold">承認済みシフトの変更が {actions.pendingChanges.length} 件保留されています。<span className="text-sm font-normal ml-2">※確定するまで保存されません</span></span>
          </div>
          <button onClick={actions.handleFinalizeModification} className="px-4 py-1 bg-orange-500 text-white text-sm font-bold rounded hover:bg-orange-600 shadow">変更を確定して通知</button>
        </div>
      )}

      <div className="max-w-screen-2xl mx-auto pt-2">
        <header className="mb-4 bg-[#F4B896] text-white rounded-md shadow-lg p-3 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black">
              {Array.from({length: 10}, (_, i) => 2020 + i).map(y => <option key={y} value={y} className="text-black">{y}</option>)}
            </select>
            <span className="text-xl">年</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black">
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-black">{m}</option>)}
            </select>
            <span className="text-xl">月</span>
            <h1 className="text-2xl font-bold hidden sm:block">digsyシフト表</h1>
          </div>
          <div className="flex items-center gap-4">
              <span className="text-sm font-semibold w-32 text-center">{saveStatus === 'saved' ? '自動保存済み' : '保存中...'}</span>
              <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold">更新</button>
              <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold">ガイド</button>
              <Legend />
          </div>
        </header>

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} schedule={currentMonthSchedule} staff={staff} tasks={tasks} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} 
            onDeleteStaff={(id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name })} 
            onUpdateStaffInfo={(id, f, v) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [f]: v } : s))}
            onApplyStaffPattern={(sid, p, hb) => {
              setStaff(prev => prev.map(s => s.id === sid ? { ...s, defaultShift: { pattern: p, hasBreak: hb } } : s));
              const updates = days.map(d => {
                const date = new Date(year, month - 1, d.day);
                const dw = date.getDay();
                let v = (currentMonthHolidays.includes(d.day) || dw === 0 || dw === 6) ? 'シフト休' : (shiftPatterns.find(pat => pat.id === p[dw-1])?.workHours || '');
                return { staffId: sid, day: d.day, value: v };
              });
              updateShiftItems(year, month, updates);
            }} 
            onToggleShiftSubmitted={actions.handleToggleShiftSubmitted}
            onToggleShiftApproved={actions.handleToggleShiftApproved} 
            onToggleShiftRemanded={actions.handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={(day) => setHolidayConfirmation({ day, isUnlocking: false, onConfirm: () => {} })}
          />
          
          <ShiftPatternDisplay patterns={shiftPatterns} onAddPattern={(p) => setShiftPatterns(prev => [...prev, p].sort((a,b)=>a.id.localeCompare(b.id)))} additionalControls={adminControls} />
          
          <TaskShortageDisplay 
            isAdmin={isAdmin} currentUser={currentUser} tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay} year={year} month={month} schedule={currentMonthSchedule}
            onUpdateTask={(id, n) => setTasks(prev => prev.map(t => t.id === id ? { ...t, name: n } : t))}
            onDeleteTask={(id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t => t.id === id)?.name })}
            onUpdateTaskPersonnel={(id, c) => setTasks(prev => prev.map(t => t.id === id ? { ...t, requiredPersonnel: c } : t))}
            onUpdateTaskStaff={(tid, sids) => setStaff(prev => prev.map(s => ({ ...s, possibleTasks: sids.includes(s.id) ? [...new Set([...s.possibleTasks, tid])] : s.possibleTasks.filter(id => id !== tid) })))}
          />

          <MonthlyCalendar schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month} isAdmin={isAdmin} currentUser={currentUser} onUpdateSchedule={updateShiftItem} />
        </main>

        <GlobalModals 
          flags={{ isMemberManagementOpen, isAdminSettingsOpen, isTaskEditorOpen, isHelpOpen, confirmDelete, approvalStaff: staff.find(s => s.id === actions.approvalModalStaffId), submissionConfirmation: actions.submissionConfirmation, remandConfirmation: actions.remandConfirmation, holidayConfirmation, absenceNotificationConfirmation: actions.absenceNotificationConfirmation, approvalCancellationConfirmation: actions.approvalCancellationConfirmation, showModificationConfirm: actions.showModificationConfirm }}
          data={{ staff, tasks, adminConfig, shiftPatterns, year, month, holidays: currentMonthHolidays, currentMonthSchedule }}
          actions={{ setIsMemberManagementOpen, setIsAdminSettingsOpen, setIsTaskEditorOpen, setIsHelpOpen, handleSaveMemberManagement: (updated) => { setStaff(updated); setIsMemberManagementOpen(false); }, handleSaveAdminConfig: (cfg) => { setAdminConfig(cfg); setIsAdminSettingsOpen(false); }, handleMigrateData: () => {}, handleBulkUpdateStaffTasks: (map) => { setStaff(prev => prev.map(s => ({ ...s, possibleTasks: Object.entries(map).filter(([tid, sids]) => sids.includes(s.id)).map(([tid]) => tid) }))); setIsTaskEditorOpen(false); }, executeDelete, setConfirmDelete, handleConfirmApproval: actions.handleConfirmApproval, setApprovalModalStaffId: actions.setApprovalModalStaffId, handleConfirmSubmission: actions.handleConfirmSubmission, setSubmissionConfirmation: actions.setSubmissionConfirmation, handleConfirmRemand: actions.handleConfirmRemand, setRemandConfirmation: actions.setRemandConfirmation, handleConfirmHoliday: () => {}, setHolidayConfirmation, handleAbsenceNotificationResponse: (send) => { if(send) chatService.sendAbsence(actions.absenceNotificationConfirmation.staffMember.name); actions.setAbsenceNotificationConfirmation(null); }, handleConfirmApprovalCancellation: actions.handleConfirmApprovalCancellation, setApprovalCancellationConfirmation: actions.setApprovalCancellationConfirmation, handleFinalizeModification: actions.handleFinalizeModification, setShowModificationConfirm: actions.setShowModificationConfirm }}
        />

        <footer className="text-center mt-6 text-sm text-slate-500 pb-8"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default MainContent;
