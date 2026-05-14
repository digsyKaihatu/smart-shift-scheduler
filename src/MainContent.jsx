import React, { useState, useMemo, useEffect } from 'react';
import { useOktaAuth } from '@okta/okta-react';

// Hooks & Services
import { useShiftData } from './hooks/useShiftData.js';
import { useUserStatus } from './hooks/useUserStatus.js';
import { useShiftActions } from './hooks/useShiftActions.js';
import { chatService } from './services/chatService.js';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils.js';
import { downloadScheduleCSV } from './utils/csvExporter.js';
import { checkPatternHasBreak } from './utils/scheduleUtils.js';

// Components
import LoadingScreen from './components/common/LoadingScreen.jsx';
import Legend from './components/schedule/Legend.jsx';
import ShiftSchedule from './components/schedule/ShiftSchedule.jsx';
import MonthlyCalendar from './components/schedule/MonthlyCalendar.jsx';
import ShiftPatternDisplay from './components/schedule/ShiftPatternDisplay.jsx';
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay.jsx';
import GlobalModals from './components/containers/GlobalModals.jsx';

const MainContent = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // データ取得フック
  const {
    staff, setStaff, schedule, updateShiftItem, updateShiftItems, updateLocalShiftItem, updateShiftUserMonth,
    tasks, setTasks, shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData(year, month);

  // ユーザー状態・権限フック (initialDataLoaded を渡すように修正)
  const { currentUser, isAdmin, isAuthenticated } = useUserStatus(staff, adminConfig, initialDataLoaded);

  // シフトアクションフック
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
    
    // すでに保留中の変更があるか確認し、最初の承認済みデータ（originalValue）を取得する
    const existingChange = actions.pendingChanges.find(c => c.staffId === staffId && c.day === day);
    const originalValue = existingChange ? existingChange.originalValue : currentVal;

    // 現在入力された値と元の値が同一か判定
    const normOrg = (originalValue === undefined || originalValue === null) ? '' : originalValue;
    const normVal = (value === undefined || value === null) ? '' : value;
    const isSameAsOriginal = JSON.stringify(normOrg) === JSON.stringify(normVal);

    if (JSON.stringify(currentVal) === JSON.stringify(value)) return;

    const isApproved = staff.find(s => s.id === staffId)?.shiftApproved?.[key];
    let newValue = value;

    if (isApproved) {
        if (isSameAsOriginal) {
            // 元の値に戻った場合は保留リストから削除し、通知対象外とする
            actions.setPendingChanges(prev => {
                const newChanges = prev.filter(c => !(c.staffId === staffId && c.day === day));
                if (newChanges.length === 0) {
                    actions.setShowModificationConfirm(false);
                }
                return newChanges;
            });
            // ローカル状態も元の値に戻す (modifiedフラグを消す)
            updateLocalShiftItem(year, month, staffId, day, originalValue);
        } else {
            // 新しい変更として扱う
            if (typeof value === 'number') newValue = { type: '稼働', hours: value, modified: true };
            else if (typeof value === 'string') newValue = { type: value, modified: true };
            else if (typeof value === 'object' && value !== null) newValue = { ...value, modified: true };
            
            actions.setPendingChanges(prev => [...prev.filter(c => !(c.staffId === staffId && c.day === day)), {
                staffId, day, displayValue: formatValue(newValue), rawYear: year, rawMonth: month, rawValue: newValue, originalValue
            }]);
            actions.setShowModificationConfirm(true);
            
            // Firestoreには保存せず、ローカルStateのみ更新
            updateLocalShiftItem(year, month, staffId, day, newValue);
        }
    } else {
        // 未承認時・承認解除時の欠勤入力チェック ('欠勤'と'欠'両方に対応)
        if (isAdmin && (value === '欠勤' || value === '欠')) {
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
              // 変更前のスタッフデータを取得
              const targetStaff = staff.find(s => s.id === sid);
              const oldPattern = targetStaff?.defaultShift?.pattern || Array(5).fill('シフト休');
              const oldHbArray = targetStaff?.defaultShift?.hasBreakArray;

              // 基本シフトパターンを更新
              setStaff(prev => prev.map(s => s.id === sid ? { ...s, defaultShift: { pattern: p, hasBreakArray: hb } } : s));
              
              const updates = [];
              days.forEach(d => {
                const date = new Date(year, month - 1, d.day);
                const dw = date.getDay();
                
                // --- 【古いパターン】での本来の予定値を計算 ---
                let oldExpectedValue = '';
                if (currentMonthHolidays.includes(d.day) || dw === 0 || dw === 6) {
                    oldExpectedValue = 'シフト休';
                } else if (oldPattern[dw-1] === 'シフト休') {
                    oldExpectedValue = 'シフト休';
                } else {
                    const oldPat = shiftPatterns.find(pat => pat.id === oldPattern[dw-1]);
                    if (oldPat) {
                        let workH = Number(oldPat.workHours) || 0;
                        const hasBreak = Array.isArray(oldHbArray) ? oldHbArray[dw-1] : checkPatternHasBreak(oldPat.id, shiftPatterns);
                        if (!hasBreak) {
                            let breakH = Number(oldPat.breakHours) || 0;
                            if (breakH === 0 && oldPat.breakTime && oldPat.breakTime !== '0:00' && oldPat.breakTime !== '00:00') {
                                const [h, m] = oldPat.breakTime.split(':').map(Number);
                                breakH = h + (m / 60);
                            }
                            if (breakH > 0) workH += breakH;
                        }
                        oldExpectedValue = workH;
                    }
                }

                // --- 【新しいパターン】での予定値を計算 ---
                let newExpectedValue = '';
                if (currentMonthHolidays.includes(d.day) || dw === 0 || dw === 6) {
                    newExpectedValue = 'シフト休';
                } else if (p[dw-1] === 'シフト休') {
                    newExpectedValue = 'シフト休';
                } else {
                    const newPat = shiftPatterns.find(pat => pat.id === p[dw-1]);
                    if (newPat) {
                        let workH = Number(newPat.workHours) || 0;
                        const hasBreak = Array.isArray(hb) ? hb[dw-1] : checkPatternHasBreak(newPat.id, shiftPatterns);
                        if (!hasBreak) {
                            let breakH = Number(newPat.breakHours) || 0;
                            if (breakH === 0 && newPat.breakTime && newPat.breakTime !== '0:00' && newPat.breakTime !== '00:00') {
                                const [h, m] = newPat.breakTime.split(':').map(Number);
                                breakH = h + (m / 60);
                            }
                            if (breakH > 0) workH += breakH;
                        }
                        newExpectedValue = workH;
                    }
                }

                // 現在シフト表に入力されている値を取得
                const currentValue = currentMonthSchedule[sid]?.[d.day] ?? '';
                
                // ★ 判定: 現在の値が「変更前のパターン通りの値」だった場合のみ、新しいパターンで上書きする
                // (手入力で「有休」や「別の時間」に変更されている日は上書きせず保護する)
                const normCurrent = (typeof currentValue === 'object' && currentValue !== null) ? (currentValue.type || currentValue.hours) : currentValue;
                if (String(normCurrent) === String(oldExpectedValue) || normCurrent === '') {
                    updates.push({ staffId: sid, day: d.day, value: newExpectedValue });
                }
              });

              if (updates.length > 0) {
                  updateShiftItems(year, month, updates);
              }
            }} 
            onToggleShiftSubmitted={actions.handleToggleShiftSubmitted}
            onToggleShiftApproved={actions.handleToggleShiftApproved} 
            onToggleShiftRemanded={actions.handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={(day) => setHolidayConfirmation({ day, isUnlocking: false, onConfirm: () => {} })}
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
          actions={{ setIsMemberManagementOpen, setIsAdminSettingsOpen, setIsTaskEditorOpen, setIsHelpOpen, handleSaveMemberManagement: (updated) => { setStaff(updated); setIsMemberManagementOpen(false); }, handleSaveAdminConfig: (cfg) => { setAdminConfig(cfg); setIsAdminSettingsOpen(false); }, handleMigrateData: () => {}, handleBulkUpdateStaffTasks: (map) => { setStaff(prev => prev.map(s => ({ ...s, possibleTasks: Object.entries(map).filter(([tid, sids]) => sids.includes(s.id)).map(([tid]) => tid) }))); setIsTaskEditorOpen(false); }, executeDelete, setConfirmDelete, handleConfirmApproval: actions.handleConfirmApproval, setApprovalModalStaffId: actions.setApprovalModalStaffId, handleConfirmSubmission: actions.handleConfirmSubmission, setSubmissionConfirmation: actions.setSubmissionConfirmation, handleConfirmRemand: actions.handleConfirmRemand, setRemandConfirmation: actions.setRemandConfirmation, handleConfirmHoliday: () => {}, setHolidayConfirmation, handleAbsenceNotificationResponse: (send) => { if(send) chatService.sendAbsence(actions.absenceNotificationConfirmation.staffMember.name); actions.setAbsenceNotificationConfirmation(null); }, handleConfirmApprovalCancellation: actions.handleConfirmApprovalCancellation, setApprovalCancellationConfirmation: actions.setApprovalCancellationConfirmation, handleFinalizeModification: actions.handleFinalizeModification, setShowModificationConfirm: actions.setShowModificationConfirm }}
        />

        <footer className="text-center mt-6 text-sm text-slate-500 pb-8"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default MainContent;
