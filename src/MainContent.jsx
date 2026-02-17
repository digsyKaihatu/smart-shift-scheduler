import React, { useState, useMemo, useEffect, useCallback } from 'react';
// import { useOktaAuth } from '@okta/okta-react'; 

// Hooks & Services & Utils (拡張子.jsを明記)
import { useShiftData } from './hooks/useShiftData.js';
import { chatService } from './services/chatService.js';
import { downloadScheduleCSV } from './utils/csvExporter.js';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils.js';
import { generateScheduleForMonth, summarizePattern } from './utils/scheduleUtils.js';

// Components (拡張子.jsxを明記)
import LoadingScreen from './components/common/LoadingScreen.jsx';
import HelpGuideModal from './components/common/HelpGuideModal.jsx';
import { ConfirmationModal, ConfirmDeleteModal } from './components/common/Modal.jsx';
import Legend from './components/schedule/Legend.jsx';
import ShiftSchedule from './components/schedule/ShiftSchedule.jsx';
import MonthlyCalendar from './components/schedule/MonthlyCalendar.jsx';
import ShiftPatternDisplay from './components/schedule/ShiftPatternDisplay.jsx';
import ShiftApprovalModal from './components/schedule/ShiftApprovalModal.jsx';
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay.jsx';
import TaskStaffMappingEditor from './components/tasks/TaskStaffMappingEditor.jsx';
import MemberManagementModal from './components/admin/MemberManagementModal.jsx';
import AdminSettingsModal from './components/admin/AdminSettingsModal.jsx';

// --- Mock Okta Auth for Preview Environment ---
const useOktaAuthMock = () => {
  return {
    oktaAuth: {
      getUser: async () => ({
        name: 'Admin User',
        email: 'admin@example.com' 
      })
    },
    authState: {
      isAuthenticated: true
    }
  };
};
// ----------------------------------------------

const MainContent = () => {
  // const { oktaAuth, authState } = useOktaAuth();
  const { oktaAuth, authState } = useOktaAuthMock(); 

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const {
    staff, setStaff, 
    schedule, 
    updateShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns, 
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData(year, month);

  const [currentUser, setCurrentUser] = useState(null);
  const [taskCountsByDay, setTaskCountsByDay] = useState({});
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMemberManagementOpen, setIsMemberManagementOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [approvalModalStaffId, setApprovalModalStaffId] = useState(null);
  const [submissionConfirmation, setSubmissionConfirmation] = useState(null);
  const [holidayConfirmation, setHolidayConfirmation] = useState(null);
  const [absenceNotificationConfirmation, setAbsenceNotificationConfirmation] = useState(null);
  const [remandConfirmation, setRemandConfirmation] = useState(null);
  const [approvalCancellationConfirmation, setApprovalCancellationConfirmation] = useState(null);
  const [shiftChangeConfirmation, setShiftChangeConfirmation] = useState(null);

  useEffect(() => {
    const identifyUser = async () => {
      if (authState?.isAuthenticated) {
        const userInfo = await oktaAuth.getUser();
        // staffがまだロードされていない場合は一旦デフォルトユーザーとして設定
        if (staff.length > 0) {
            const matchedStaff = staff.find(s => s.email === userInfo.email);
            if (matchedStaff) {
                setCurrentUser({ ...matchedStaff, email: userInfo.email });
            } else {
                setCurrentUser({ id: 'okta-user', name: userInfo.name || 'Okta User', email: userInfo.email, role: 'OP' });
            }
        } else {
            // 初期ロード中でstaffが空の場合の安全策
            setCurrentUser({ id: 'temp-user', name: 'Loading...', email: userInfo.email, role: 'OP' });
        }
      }
    };
    identifyUser();
  }, [authState, oktaAuth, staff]); // staffがロードされたら再実行される

  // ハンドラの定義
  const handleMigrateData = useCallback(() => {
    if (!window.confirm("データ移行（パターンA → I）を実行しますか？\n※この操作は取り消せません。")) return;
    setStaff(prevStaff => {
      let isChanged = false;
      const newStaff = prevStaff.map(s => {
        const isAllA = s.defaultShift?.pattern?.every(p => p === 'A');
        if (isAllA) { isChanged = true; return { ...s, defaultShift: { ...s.defaultShift, pattern: ['I', 'I', 'I', 'I', 'I'] } }; }
        return s;
      });
      if (isChanged) alert("データの移行が完了しました。");
      else alert("移行対象のデータはありませんでした。");
      return newStaff;
    });
  }, [setStaff]);

  const firebaseAdminEmails = useMemo(() => {
    if (!adminConfig?.adminEmails) return [];
    return adminConfig.adminEmails.split(',').map(email => email.trim());
  }, [adminConfig]);

  const isAdmin = currentUser?.id === 'admin' || (currentUser?.email && (firebaseAdminEmails.includes(currentUser.email) || currentUser.email === 'admin@example.com'));
  
  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  // タスクカウント計算
  useEffect(() => {
    if (!initialDataLoaded) return;
    const currentMonthSchedule = schedule[key] || {};
    const counts = {};
    for (let day = 1; day <= daysInMonth; day++) {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const entry = currentMonthSchedule[s.id]?.[day];
        const isWorking = (typeof entry === 'number' && entry > 0) || (typeof entry === 'object' && entry?.hours > 0);
        if (isWorking) {
          s.possibleTasks.forEach(tId => { if (counts[day][tId] !== undefined) counts[day][tId]++; });
        }
      });
    }
    setTaskCountsByDay(counts);
  }, [schedule, year, month, staff, tasks, daysInMonth, initialDataLoaded]);

  const handleUpdateScheduleGeneric = useCallback((targetYear, targetMonth, staffId, day, value) => {
    updateShiftItem(targetYear, targetMonth, staffId, day, value);
  }, [updateShiftItem]);

  const handleUpdateSchedule = useCallback((staffId, day, value) => {
    const currentVal = schedule[key]?.[staffId]?.[day] ?? '';
    updateShiftItem(year, month, staffId, day, value);

    const target = staff.find(s => s.id === staffId);
    if (!target) return;

    if (isAdmin) {
        const isApproved = target.shiftApproved?.[key];
        if (isApproved) {
            const strOld = formatValue(currentVal);
            const strNew = formatValue(value);
            if (strOld !== strNew) {
                setStaff(prev => prev.map(s => s.id === staffId ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: false } } : s));
                setShiftChangeConfirmation({ staffMember: target, day, oldValue: strOld, newValue: strNew });
                return; 
            }
        }
        if (value === '欠' || (typeof value === 'object' && value.type === '欠勤')) {
             setAbsenceNotificationConfirmation({ staffMember: target, day, value });
        }
    }
  }, [schedule, key, staff, year, month, isAdmin, updateShiftItem, setStaff]);

  const handleShiftChangeNotificationResponse = useCallback(async (send) => {
      if (!shiftChangeConfirmation) return;
      const { staffMember, day, oldValue, newValue } = shiftChangeConfirmation;
      if (send) {
          setIsLoading(true);
          try { await chatService.sendShiftChange(staffMember, year, month, day, oldValue, newValue); }
          catch (e) { alert('通知送信に失敗しました: ' + e.message); }
          setIsLoading(false);
      }
      setShiftChangeConfirmation(null);
  }, [shiftChangeConfirmation, year, month, setIsLoading]);

  const handleAbsenceNotificationResponse = useCallback(async (send) => {
    if (!absenceNotificationConfirmation) return;
    const { staffMember } = absenceNotificationConfirmation;
    if (send) {
      setIsLoading(true);
      try { await chatService.sendAbsence(staffMember.name); } catch (e) { alert(e.message); }
      setIsLoading(false);
    }
    setAbsenceNotificationConfirmation(null);
  }, [absenceNotificationConfirmation, setIsLoading]);

  // その他のハンドラ (useCallbackでラップ)
  const handleToggleShiftSubmitted = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (!s) return;
    if (s?.shiftSubmitted?.[key]) setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: false } } : x));
    else setSubmissionConfirmation({ staffId, name: s.name });
  }, [staff, key, setStaff]);

  const handleConfirmSubmission = useCallback(async () => {
    if (!submissionConfirmation) return;
    const { staffId, name } = submissionConfirmation;
    let mentions = '';
    if (adminConfig?.submissionNotificationIds) mentions = adminConfig.submissionNotificationIds.split(',').map(id => id.trim()).filter(id => id !== '').map(id => `<users/${id}>`).join(' ');
    setIsLoading(true);
    setLoadingMessage('提出通知を送信中...');
    try { await chatService.sendSubmission(name, year, month, mentions); } catch (e) { alert('通知送信に失敗しました'); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: true } } : x));
    setSubmissionConfirmation(null);
  }, [submissionConfirmation, adminConfig, year, month, setIsLoading, setLoadingMessage, setStaff, key]);

  const handleToggleShiftRemanded = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (!s) return;
    if (s?.shiftRemanded?.[key]) setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: false } } : x));
    else setRemandConfirmation({ staffId, name: s.name });
  }, [staff, key, setStaff]);

  const handleConfirmRemand = useCallback(async () => {
    if (!remandConfirmation) return;
    const { staffId, name } = remandConfirmation;
    const s = staff.find(x => x.id === staffId);
    setIsLoading(true);
    setLoadingMessage('差戻通知を送信中...');
    try { await chatService.sendRemand(name, s.chatUserId); } catch (e) { alert('通知送信に失敗しました'); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: true } } : x));
    setRemandConfirmation(null);
  }, [remandConfirmation, staff, setIsLoading, setLoadingMessage, setStaff, key]);

  const handleConfirmApproval = useCallback(async (remarks) => {
    if (!approvalModalStaffId) return;
    const s = staff.find(x => x.id === approvalModalStaffId);
    const irregularities = [];
    // ...特記事項生成ロジック(省略せず実装)...
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isHoliday = currentMonthHolidays.includes(day);
        let expected = (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) ? 'シフト休' : '';
        if (expected === '') {
             const pIdx = dayOfWeek - 1;
             const pId = s.defaultShift.pattern[pIdx];
             if (pId === 'シフト休') expected = 'シフト休';
             else { const p = shiftPatterns.find(x => x.id === pId); expected = p ? p.workHours : ''; }
        }
        const actual = schedule[key]?.[s.id]?.[day] ?? '';
        let actualCompare = (typeof actual === 'object' && actual !== null) ? actual.type || '' : actual;
        let isEffectivelySame = (actualCompare === expected);
        if (!isEffectivelySame) {
            if (expected === 'シフト休') { if (['', 0, '0', '休', 'シフト休', null, undefined].includes(actualCompare)) isEffectivelySame = true; }
            else if (expected !== '') { if (parseFloat(actualCompare) === parseFloat(expected)) isEffectivelySame = true; }
        }
        if (!isEffectivelySame) {
            const wStr = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeek];
            irregularities.push(`${month}/${day}(${wStr}): ${formatValue(actual) || '未入力'}`);
        }
    }
    
    setIsLoading(true);
    setLoadingMessage('承認通知を送信中...');
    try { await chatService.sendApproval(s, year, month, summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray), irregularities.join('\n') || 'なし', remarks); } catch (e) { alert('通知送信に失敗しました'); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === approvalModalStaffId ? { ...x, shiftApproved: { ...x.shiftApproved, [key]: true } } : x));
    setApprovalModalStaffId(null);
  }, [approvalModalStaffId, staff, daysInMonth, year, month, currentMonthHolidays, schedule, key, shiftPatterns, setIsLoading, setLoadingMessage, setStaff]);

  const handleToggleShiftApproved = useCallback((staffId) => {
      const s = staff.find(x => x.id === staffId);
      if (!s) return;
      if (s?.shiftApproved && s.shiftApproved[key]) setApprovalCancellationConfirmation({ staffId, name: s.name });
      else setApprovalModalStaffId(staffId);
  }, [staff, key]);

  const handleConfirmApprovalCancellation = useCallback(() => {
    if (!approvalCancellationConfirmation) return;
    const { staffId } = approvalCancellationConfirmation;
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftApproved: { ...x.shiftApproved, [key]: false } } : x));
    setApprovalCancellationConfirmation(null);
  }, [approvalCancellationConfirmation, setStaff, key]);

  const handleUpdateStaffInfo = useCallback((id, field, val) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s)), [setStaff]);
  const handleDeleteStaff = useCallback((id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name }), [staff]);
  const handleDeleteTask = useCallback((id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t => t.id === id)?.name }), [tasks]);
  const handleExportCSV = useCallback(() => downloadScheduleCSV(staff, schedule, shiftPatterns, year, month), [staff, schedule, shiftPatterns, year, month]);
  const handleBulkUpdateStaffTasks = useCallback((taskStaffMap) => {
      const staffTaskMap = {}; staff.forEach(s => staffTaskMap[s.id] = []);
      Object.entries(taskStaffMap).forEach(([taskId, staffIds]) => { staffIds.forEach(staffId => { if (staffTaskMap[staffId]) staffTaskMap[staffId].push(taskId); }); });
      setStaff(prev => prev.map(s => ({ ...s, possibleTasks: staffTaskMap[s.id] || [] })));
      setIsTaskEditorOpen(false);
  }, [staff, setStaff]);
  const handleUpdateSingleTaskStaff = useCallback((taskId, newStaffIds) => {
    setStaff(prev => prev.map(s => {
      const isAssigned = newStaffIds.includes(s.id);
      const currentTasks = s.possibleTasks || [];
      const newTasks = isAssigned ? (currentTasks.includes(taskId) ? currentTasks : [...currentTasks, taskId]) : currentTasks.filter(tid => tid !== taskId);
      return { ...s, possibleTasks: newTasks };
    }));
  }, [setStaff]);
  const handleApplyStaffPattern = useCallback((staffId, newPattern, hasBreak) => {
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreak } } : s));
    const newMonthScheduleForStaff = {};
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); const isHoliday = currentMonthHolidays.includes(day);
        let shiftValue = (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) ? 'シフト休' : '';
        if (shiftValue === '') {
            const patternId = newPattern[dayOfWeek - 1];
            shiftValue = patternId === 'シフト休' ? 'シフト休' : (shiftPatterns.find(p => p.id === patternId)?.workHours || '');
        }
        newMonthScheduleForStaff[day] = shiftValue;
    }
    updateShiftUserMonth(year, month, staffId, newMonthScheduleForStaff);
  }, [setStaff, daysInMonth, year, month, currentMonthHolidays, shiftPatterns, updateShiftUserMonth]);
  
  const executeDelete = useCallback(() => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'staff') setStaff(prev => prev.filter(s => s.id !== confirmDelete.id));
    else {
        setTasks(prev => prev.filter(t => t.id !== confirmDelete.id));
        setStaff(prev => prev.map(s => ({ ...s, possibleTasks: s.possibleTasks.filter(tid => tid !== confirmDelete.id) })));
    }
    setConfirmDelete(null);
  }, [confirmDelete, setStaff, setTasks]);

  const handleAddStaff = useCallback(() => {
      const newId = `s${Date.now()}`;
      setStaff(prev => [...prev, {
          id: newId, employeeId: 'New', name: '新規メンバー', role: 'OP', chatUserId: '', possibleTasks: [],
          defaultShift: { pattern: ['I','I','I','I','I'], hasBreak: true }, shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {}
      }]);
      const newMemberSchedule = {};
      for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const isHoliday = currentMonthHolidays.includes(day);
          if (date.getDay() === 0 || date.getDay() === 6 || isHoliday) newMemberSchedule[day] = 'シフト休';
      }
      updateShiftUserMonth(year, month, newId, newMemberSchedule);
  }, [setStaff, daysInMonth, year, month, currentMonthHolidays, updateShiftUserMonth]);

  const handleSetDayAsHolidayForAll = useCallback((day) => {
      if(!isAdmin) return;
      const isAlreadyLockedHoliday = staff.length > 0 && staff.every(s => {
        const entry = (schedule[key] || {})[s.id]?.[day];
        return typeof entry === 'object' && entry?.locked === true;
      });
      if (isAlreadyLockedHoliday) {
        setHolidayConfirmation({ day, isUnlocking: true, onConfirm: () => {
                const updates = [];
                staff.forEach(s => {
                    const date = new Date(year, month - 1, day);
                    let restoredValue = (currentMonthHolidays.includes(day) || date.getDay() === 0 || date.getDay() === 6) ? 'シフト休' : '';
                    if (restoredValue === '' && date.getDay() > 0 && date.getDay() < 6) {
                        const pId = s.defaultShift.pattern[date.getDay() - 1];
                        restoredValue = pId === 'シフト休' ? 'シフト休' : (shiftPatterns.find(p => p.id === pId)?.workHours || '');
                    }
                    updates.push({ staffId: s.id, day, value: restoredValue });
                });
                updateShiftItems(year, month, updates);
                setHolidayConfirmation(null);
            },
        });
    } else {
        setHolidayConfirmation({ day, isUnlocking: false, onConfirm: () => {
                const updates = staff.map(s => ({ staffId: s.id, day, value: { type: 'シフト休', locked: true } }));
                updateShiftItems(year, month, updates);
                setHolidayConfirmation(null);
            },
        });
    }
  }, [isAdmin, staff, schedule, key, year, month, currentMonthHolidays, shiftPatterns, updateShiftItems]);

  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;
  
  const currentMonthSchedule = schedule[key] || {};
  const approvalStaff = approvalModalStaffId ? staff.find(s => s.id === approvalModalStaffId) : null;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-4 bg-[#F4B896] text-white rounded-md shadow-lg p-3 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black focus:ring-2 focus:ring-white">
              {Array.from({length: 10}, (_, i) => 2020 + i).map(y => <option key={y} value={y} className="text-black">{y}</option>)}
            </select>
            <span className="text-xl">年</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none rounded p-1 text-2xl font-bold text-black focus:ring-2 focus:ring-white">
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-black">{m}</option>)}
            </select>
            <span className="text-xl">月</span>
            <h1 className="text-2xl font-bold tracking-wider hidden sm:block">digsyシフト表</h1>
          </div>
          <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold w-36 justify-center ${saveStatus === 'saved' ? 'text-white/80' : 'text-yellow-300'}`}>
                <span>{saveStatus === 'saved' ? '自動保存済み' : saveStatus === 'saving' ? '保存中...' : '編集中...'}</span>
              </div>
              <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold whitespace-nowrap flex items-center gap-1 transition-colors" title="最新のデータを取得します">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>更新
              </button>
              <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold whitespace-nowrap">ガイド</button>
              <div className="hidden md:block"><Legend /></div>
          </div>
        </header>
        <div className="md:hidden mb-4"><Legend /></div>

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} 
            schedule={currentMonthSchedule} staff={staff} tasks={tasks} 
            days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} 
            year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} onDeleteStaff={handleDeleteStaff} onUpdateStaffInfo={handleUpdateStaffInfo}
            onApplyStaffPattern={handleApplyStaffPattern} onToggleShiftSubmitted={handleToggleShiftSubmitted}
            onToggleShiftApproved={handleToggleShiftApproved} onToggleShiftRemanded={handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={handleSetDayAsHolidayForAll}
          />
          <ShiftPatternDisplay patterns={shiftPatterns} onAddPattern={(p) => setShiftPatterns(prev => [...prev, p].sort((a,b)=>a.id.localeCompare(b.id)))} additionalControls={adminControls} />
          <TaskShortageDisplay 
            isAdmin={isAdmin} currentUser={currentUser} tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay}
            onUpdateTask={useCallback((id, name) => setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t)), [setTasks])} 
            onDeleteTask={handleDeleteTask}
            onUpdateTaskPersonnel={useCallback((id, count) => setTasks(prev => prev.map(t => t.id === id ? { ...t, requiredPersonnel: count } : t)), [setTasks])}
            onUpdateTaskStaff={handleUpdateSingleTaskStaff}
            year={year} month={month} schedule={currentMonthSchedule} 
          />
          <MonthlyCalendar
            schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month}
            onUpdateSchedule={handleUpdateScheduleGeneric} isAdmin={isAdmin} currentUser={currentUser}
          />
        </main>

        {isAdmin && isMemberManagementOpen && <MemberManagementModal staff={staff} onClose={() => setIsMemberManagementOpen(false)} onSave={(updated) => { setStaff(updated); setIsMemberManagementOpen(false); }} />}
        {isAdmin && isAdminSettingsOpen && (
          <AdminSettingsModal 
            adminConfig={adminConfig} onClose={() => setIsAdminSettingsOpen(false)} 
            onSave={(cfg) => { setAdminConfig(cfg); setIsAdminSettingsOpen(false); }} onMigrate={handleMigrateData} 
          />
        )}
        {isAdmin && isTaskEditorOpen && <TaskStaffMappingEditor staff={staff} tasks={tasks} onClose={() => setIsTaskEditorOpen(false)} onSave={handleBulkUpdateStaffTasks} />}
        {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
        {confirmDelete && <ConfirmDeleteModal itemType={confirmDelete.type === 'staff' ? 'メンバー' : '業務'} itemName={confirmDelete.name} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />}
        {approvalStaff && <ShiftApprovalModal staffMember={approvalStaff} schedule={currentMonthSchedule[approvalStaff.id]} shiftPatterns={shiftPatterns} holidays={currentMonthHolidays} year={year} month={month} onConfirm={handleConfirmApproval} onClose={() => setApprovalModalStaffId(null)} />}
        {submissionConfirmation && <ConfirmationModal title="シフトの提出" message="提出しますか？" onConfirm={handleConfirmSubmission} onCancel={() => setSubmissionConfirmation(null)} />}
        {remandConfirmation && <ConfirmationModal title="差戻の確認" message="本当に差し戻しますか？" onConfirm={handleConfirmRemand} onCancel={() => setRemandConfirmation(null)} />}
        {holidayConfirmation && <ConfirmationModal title={holidayConfirmation.isUnlocking ? "休日設定解除" : "休日設定"} message="全メンバーに適用しますか？" onConfirm={holidayConfirmation.onConfirm} onCancel={() => setHolidayConfirmation(null)} />}
        {absenceNotificationConfirmation && <ConfirmationModal title="欠勤の周知" message={`${absenceNotificationConfirmation.staffMember.name}さんの欠勤をチャットで周知しますか？`} onConfirm={() => handleAbsenceNotificationResponse(true)} onCancel={() => handleAbsenceNotificationResponse(false)} />}
        {approvalCancellationConfirmation && <ConfirmationModal title="承認の取り消し" message={`${approvalCancellationConfirmation.name}さんの承認を取り消しますか？`} onConfirm={handleConfirmApprovalCancellation} onCancel={() => setApprovalCancellationConfirmation(null)} />}
        {shiftChangeConfirmation && (
            <ConfirmationModal 
                title="承認済みシフトの変更" 
                message={`${shiftChangeConfirmation.staffMember.name}さんの承認済みシフトを変更しました。\n変更内容を本人に通知しますか？\n\n変更日: ${month}/${shiftChangeConfirmation.day}\n変更: ${shiftChangeConfirmation.oldValue} → ${shiftChangeConfirmation.newValue}`}
                onConfirm={() => handleShiftChangeNotificationResponse(true)} 
                onCancel={() => handleShiftChangeNotificationResponse(false)} 
            />
        )}
        <footer className="text-center mt-6 text-sm text-slate-500 pb-8"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default MainContent;
