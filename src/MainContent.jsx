import React, { useState, useMemo, useEffect } from 'react';
import { useOktaAuth } from '@okta/okta-react';

// Hooks & Services & Utils
import { useShiftData } from './hooks/useShiftData';
import { chatService } from './services/chatService';
import { downloadScheduleCSV } from './utils/csvExporter';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils';
import { generateScheduleForMonth, summarizePattern } from './utils/scheduleUtils';

// Components
import LoadingScreen from './components/common/LoadingScreen';
import HelpGuideModal from './components/common/HelpGuideModal';
import { ConfirmationModal, ConfirmDeleteModal } from './components/common/Modal';
import Legend from './components/schedule/Legend';
import ShiftSchedule from './components/schedule/ShiftSchedule';
import MonthlyCalendar from './components/schedule/MonthlyCalendar';
import ShiftPatternDisplay from './components/schedule/ShiftPatternDisplay';
import ShiftApprovalModal from './components/schedule/ShiftApprovalModal';
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay';
import TaskStaffMappingEditor from './components/tasks/TaskStaffMappingEditor';
import MemberManagementModal from './components/admin/MemberManagementModal';
import AdminSettingsModal from './components/admin/AdminSettingsModal';

const MainContent = () => {
  const { oktaAuth, authState } = useOktaAuth();

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const {
    staff, setStaff, 
    schedule, setSchedule, 
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
  // 追加: 承認取り消し確認用のState
  const [approvalCancellationConfirmation, setApprovalCancellationConfirmation] = useState(null);

  useEffect(() => {
    const identifyUser = async () => {
      if (authState?.isAuthenticated) {
        const userInfo = await oktaAuth.getUser();
        const matchedStaff = staff.find(s => s.email === userInfo.email);
        if (matchedStaff) {
          setCurrentUser({ ...matchedStaff, email: userInfo.email });
        } else {
          setCurrentUser({
            id: 'okta-user',
            name: userInfo.name || 'Okta User',
            email: userInfo.email,
            role: 'OP'
          });
        }
      } else {
        setCurrentUser(null);
      }
    };
    if (authState?.isAuthenticated && staff.length > 0) identifyUser();
  }, [authState, oktaAuth, staff]);

  // ---------------------------------------------------------------------------
  // 追加: 既存データ移行処理 (パターンA -> I)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (initialDataLoaded && staff.length > 0) {
      setStaff(prevStaff => {
        let isChanged = false;
        const newStaff = prevStaff.map(s => {
          // デフォルトシフトが全て'A'で構成されているかチェック
          // (未編集の初期値がAだった人のみを対象とする)
          const isAllA = s.defaultShift?.pattern?.every(p => p === 'A');
          if (isAllA) {
            isChanged = true;
            return {
              ...s,
              defaultShift: {
                ...s.defaultShift,
                pattern: ['I', 'I', 'I', 'I', 'I'] // 'A'の場合は'I' (9:30始業) に置換
              }
            };
          }
          return s;
        });
        
        // 変更があった場合のみStateを更新
        return isChanged ? newStaff : prevStaff;
      });
    }
  }, [initialDataLoaded]); // 初回ロード完了時に一度だけチェック

  const firebaseAdminEmails = useMemo(() => {
    if (!adminConfig?.adminEmails) return [];
    return adminConfig.adminEmails.split(',').map(email => email.trim());
  }, [adminConfig]);

  const isAdmin = currentUser?.id === 'admin' || (currentUser?.email && firebaseAdminEmails.includes(currentUser.email));
  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  useEffect(() => {
    if (!schedule[key] && initialDataLoaded) {
      setSchedule(prev => ({ ...prev, [key]: generateScheduleForMonth(year, month, staff, shiftPatterns) }));
    }
  }, [year, month, schedule, staff, shiftPatterns, initialDataLoaded]);

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

  const handleUpdateScheduleGeneric = (targetYear, targetMonth, staffId, day, value) => {
    const targetKey = `${targetYear}-${targetMonth}`;
    setSchedule(prev => {
      const newMonth = { ...(prev[targetKey] || {}) };
      const newStaff = { ...(newMonth[staffId] || {}) };
      newStaff[day] = value;
      newMonth[staffId] = newStaff;
      return { ...prev, [targetKey]: newMonth };
    });
  };

  const handleUpdateSchedule = (staffId, day, value) => {
    handleUpdateScheduleGeneric(year, month, staffId, day, value);
    if (isAdmin && value === '欠') {
      const target = staff.find(s => s.id === staffId);
      setAbsenceNotificationConfirmation({ staffMember: target, day, value });
    }
  };

  const handleAbsenceNotificationResponse = async (send) => {
    if (!absenceNotificationConfirmation) return;
    const { staffMember, day, value } = absenceNotificationConfirmation;
    handleUpdateSchedule(staffMember.id, day, value);
    if (send) {
      setIsLoading(true);
      try { await chatService.sendAbsence(staffMember.name); } catch (e) { alert(e.message); }
      setIsLoading(false);
    }
    setAbsenceNotificationConfirmation(null);
  };

  const handleToggleShiftSubmitted = (staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftSubmitted?.[key]) {
      setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: false } } : x));
    } else {
      setSubmissionConfirmation({ staffId, name: s.name });
    }
  };

  const handleConfirmSubmission = async () => {
    if (!submissionConfirmation) return;
    const { staffId, name } = submissionConfirmation;
    let mentions = '';
    if (adminConfig?.submissionNotificationIds) {
        mentions = adminConfig.submissionNotificationIds.split(',').map(id => id.trim()).filter(id => id !== '').map(id => `<users/${id}>`).join(' ');
    }
    setIsLoading(true);
    setLoadingMessage('提出通知を送信中...');
    try { await chatService.sendSubmission(name, year, month, mentions); } catch (e) { alert('通知送信に失敗しました'); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: true } } : x));
    setSubmissionConfirmation(null);
  };

  const handleToggleShiftRemanded = (staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftRemanded?.[key]) {
        setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: false } } : x));
    } else {
        setRemandConfirmation({ staffId, name: s.name });
    }
  };

  const handleConfirmRemand = async () => {
    if (!remandConfirmation) return;
    const { staffId, name } = remandConfirmation;
    const s = staff.find(x => x.id === staffId);
    setIsLoading(true);
    setLoadingMessage('差戻通知を送信中...');
    try { await chatService.sendRemand(name, s.chatUserId); } catch (e) { alert('通知送信に失敗しました'); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: true } } : x));
    setRemandConfirmation(null);
  };

  const handleConfirmApproval = async (remarks) => {
    if (!approvalModalStaffId) return;
    const s = staff.find(x => x.id === approvalModalStaffId);
    const irregularities = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isHoliday = currentMonthHolidays.includes(day);
        let expected = (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) ? 'シフト休' : '';
        if (expected === '') {
             const pIdx = dayOfWeek - 1;
             const pId = s.defaultShift.pattern[pIdx];
             if (pId === 'シフト休') expected = 'シフト休';
             else {
                 const p = shiftPatterns.find(x => x.id === pId);
                 expected = p ? p.workHours : '';
             }
        }
        const actual = schedule[key]?.[s.id]?.[day] ?? '';
        
        let actualCompare = actual;
        if (typeof actual === 'object' && actual !== null) {
            actualCompare = actual.type || '';
        }

        let isEffectivelySame = (actualCompare === expected);

        if (!isEffectivelySame) {
            if (expected === 'シフト休') {
                const emptyOrRestValues = ['', 0, '0', '休', 'シフト休', null, undefined];
                if (emptyOrRestValues.includes(actualCompare)) {
                    isEffectivelySame = true;
                }
            } else if (expected !== '') {
                if (!isNaN(parseFloat(actualCompare)) && !isNaN(parseFloat(expected)) && parseFloat(actualCompare) === parseFloat(expected)) {
                    isEffectivelySame = true;
                }
            }
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
  };

  // 承認ボタンクリック時の処理（解除時は確認モーダルへ）
  const handleToggleShiftApproved = (staffId) => {
      const s = staff.find(x => x.id === staffId);
      if (s?.shiftApproved?.[key]) {
          // 既に承認済みの場合は、解除確認モーダルを表示
          setApprovalCancellationConfirmation({ staffId, name: s.name });
      } else {
          // 未承認の場合は、承認モーダルを表示
          setApprovalModalStaffId(staffId);
      }
  };

  // 追加: 承認取り消しの確定処理
  const handleConfirmApprovalCancellation = () => {
    if (!approvalCancellationConfirmation) return;
    const { staffId } = approvalCancellationConfirmation;
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftApproved: { ...x.shiftApproved, [key]: false } } : x));
    setApprovalCancellationConfirmation(null);
  };

  const handleUpdateStaffInfo = (id, field, val) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  const handleDeleteStaff = (id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name });
  const handleDeleteTask = (id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t => t.id === id)?.name });
  
  const handleExportCSV = () => downloadScheduleCSV(staff, schedule, shiftPatterns, year, month);
   
  const handleBulkUpdateStaffTasks = (taskStaffMap) => {
      const staffTaskMap = {};
      staff.forEach(s => staffTaskMap[s.id] = []);
      Object.entries(taskStaffMap).forEach(([taskId, staffIds]) => {
          staffIds.forEach(staffId => { if (staffTaskMap[staffId]) staffTaskMap[staffId].push(taskId); });
      });
      setStaff(prevStaff => prevStaff.map(s => ({ ...s, possibleTasks: staffTaskMap[s.id] || [] })));
      setIsTaskEditorOpen(false);
  };

  const handleUpdateSingleTaskStaff = (taskId, newStaffIds) => {
    setStaff(prevStaff => prevStaff.map(s => {
      const isAssigned = newStaffIds.includes(s.id);
      const currentTasks = s.possibleTasks || [];
      const newTasks = isAssigned ? (currentTasks.includes(taskId) ? currentTasks : [...currentTasks, taskId]) : currentTasks.filter(tid => tid !== taskId);
      return { ...s, possibleTasks: newTasks };
    }));
  };
   
  const handleApplyStaffPattern = (staffId, newPattern, hasBreak) => {
    setStaff(prevStaff => prevStaff.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreak } } : s));
    const newMonthScheduleForStaff = {};
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); 
        const isHoliday = currentMonthHolidays.includes(day);
        let shiftValue = '';
        if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) {
            shiftValue = 'シフト休';
        } else {
            const patternId = newPattern[dayOfWeek - 1];
            if (patternId === 'シフト休') shiftValue = 'シフト休';
            else {
                const pattern = shiftPatterns.find(p => p.id === patternId);
                shiftValue = pattern ? pattern.workHours : '';
            }
        }
        newMonthScheduleForStaff[day] = shiftValue;
    }
    setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [staffId]: newMonthScheduleForStaff } }));
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'staff') {
        setStaff(prev => prev.filter(s => s.id !== confirmDelete.id));
        setSchedule(prev => { const next = { ...prev }; Object.keys(next).forEach(k => delete next[k][confirmDelete.id]); return next; });
    } else {
        setTasks(prev => prev.filter(t => t.id !== confirmDelete.id));
        setStaff(prev => prev.map(s => ({ ...s, possibleTasks: s.possibleTasks.filter(tid => tid !== confirmDelete.id) })));
    }
    setConfirmDelete(null);
  };

  const handleAddStaff = () => {
      const newId = `s${Date.now()}`;
      setStaff(prev => [...prev, {
          id: newId, employeeId: 'New', name: '新規メンバー', role: 'OP', chatUserId: '', possibleTasks: [],
          // 修正: デフォルトパターンを 'I' (9:30始業) に変更
          defaultShift: { pattern: ['I','I','I','I','I'], hasBreak: true }, shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {}
      }]);
      
      const newMemberSchedule = {};
      for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          const isHoliday = currentMonthHolidays.includes(day);
          if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
              newMemberSchedule[day] = 'シフト休';
          }
      }

      setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [newId]: newMemberSchedule } }));
  };

  const handleSetDayAsHolidayForAll = (day) => {
      if(!isAdmin) return;
      const isAlreadyLockedHoliday = staff.length > 0 && staff.every(s => {
        const entry = (schedule[key] || {})[s.id]?.[day];
        return typeof entry === 'object' && entry?.locked === true;
      });

      if (isAlreadyLockedHoliday) {
        setHolidayConfirmation({ day, isUnlocking: true, onConfirm: () => {
                setSchedule(prev => {
                    const newSchedule = JSON.parse(JSON.stringify(prev));
                    const newMonthSchedule = newSchedule[key] || {};
                    staff.forEach(s => {
                        const date = new Date(year, month - 1, day);
                        const dayOfWeek = date.getDay();
                        let restoredValue = (currentMonthHolidays.includes(day) || dayOfWeek === 0 || dayOfWeek === 6) ? 'シフト休' : '';
                        if (restoredValue === '' && dayOfWeek > 0 && dayOfWeek < 6) {
                            const pId = s.defaultShift.pattern[dayOfWeek - 1];
                            restoredValue = pId === 'シフト休' ? 'シフト休' : (shiftPatterns.find(p => p.id === pId)?.workHours || '');
                        }
                        newMonthSchedule[s.id][day] = restoredValue;
                    });
                    newSchedule[key] = newMonthSchedule;
                    return newSchedule;
                });
                setHolidayConfirmation(null);
            },
        });
    } else {
        setHolidayConfirmation({ day, isUnlocking: false, onConfirm: () => {
                setSchedule(prev => {
                    const newSchedule = { ...prev };
                    const newMonthSchedule = JSON.parse(JSON.stringify(newSchedule[key] || {}));
                    staff.forEach(s => { if (!newMonthSchedule[s.id]) newMonthSchedule[s.id] = {}; newMonthSchedule[s.id][day] = { type: 'シフト休', locked: true }; });
                    newSchedule[key] = newMonthSchedule;
                    return newSchedule;
                });
                setHolidayConfirmation(null);
            },
        });
    }
  };

  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;
  if (!authState?.isAuthenticated) {
    return null;
  }
  
  const currentMonthSchedule = schedule[key] || {};
  const approvalStaff = approvalModalStaffId ? staff.find(s => s.id === approvalModalStaffId) : null;

  const adminControls = (
      <>
          {isAdmin && (
              <>
                  <button onClick={handleAddStaff} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ メンバー</button>
                  <button onClick={() => setTasks(prev => [...prev, { id: `t${Date.now()}`, name: '新業務', requiredPersonnel: 3 }])} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">+ 業務</button>
                  <button onClick={() => setIsTaskEditorOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">業務担当</button>
                  <button onClick={() => setIsMemberManagementOpen(true)} className="px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680] shadow-sm whitespace-nowrap">メンバー管理</button>
                  <button onClick={() => setIsAdminSettingsOpen(true)} className="px-3 py-1.5 bg-slate-500 text-white text-xs font-semibold rounded-md hover:bg-slate-600 shadow-sm whitespace-nowrap">通知設定</button>
              </>
          )}
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-700 shadow-sm whitespace-nowrap">CSV</button>
      </>
  );

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
              
              {/* 更新ボタンの追加 */}
              <button 
                onClick={() => window.location.reload()} 
                className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold whitespace-nowrap flex items-center gap-1 transition-colors"
                title="最新のデータを取得します"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                更新
              </button>

              <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold whitespace-nowrap">ガイド</button>
              <div className="hidden md:block">
                 <Legend />
              </div>
          </div>
        </header>
        
        <div className="md:hidden mb-4">
            <Legend />
        </div>

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} schedule={currentMonthSchedule} staff={staff} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} onDeleteStaff={handleDeleteStaff} onUpdateStaffInfo={handleUpdateStaffInfo}
            onApplyStaffPattern={handleApplyStaffPattern} onToggleShiftSubmitted={handleToggleShiftSubmitted}
            onToggleShiftApproved={handleToggleShiftApproved} onToggleShiftRemanded={handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={handleSetDayAsHolidayForAll}
          />
          
          <ShiftPatternDisplay 
            patterns={shiftPatterns} 
            onAddPattern={(p) => setShiftPatterns(prev => [...prev, p].sort((a,b)=>a.id.localeCompare(b.id)))} 
            additionalControls={adminControls}
          />
          
          <TaskShortageDisplay 
            isAdmin={isAdmin} currentUser={currentUser} tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay}
            onUpdateTask={(id, name) => setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t))} onDeleteTask={handleDeleteTask}
            onUpdateTaskPersonnel={(id, count) => setTasks(prev => prev.map(t => t.id === id ? { ...t, requiredPersonnel: count } : t))}
            onUpdateTaskStaff={handleUpdateSingleTaskStaff}
            year={year} month={month}
            schedule={currentMonthSchedule} // 案件詳細表示用
          />
          <MonthlyCalendar
            schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month}
            onUpdateSchedule={(staffId, d, v, ty, tm) => handleUpdateScheduleGeneric(ty || year, tm || month, staffId, d, v)}
            isAdmin={isAdmin} currentUser={currentUser}
          />
        </main>

        {isAdmin && isMemberManagementOpen && <MemberManagementModal staff={staff} onClose={() => setIsMemberManagementOpen(false)} onSave={(updated) => { setStaff(updated); setIsMemberManagementOpen(false); }} />}
        {isAdmin && isAdminSettingsOpen && <AdminSettingsModal adminConfig={adminConfig} onClose={() => setIsAdminSettingsOpen(false)} onSave={(cfg) => { setAdminConfig(cfg); setIsAdminSettingsOpen(false); }} />}
        {isAdmin && isTaskEditorOpen && <TaskStaffMappingEditor staff={staff} tasks={tasks} onClose={() => setIsTaskEditorOpen(false)} onSave={handleBulkUpdateStaffTasks} />}
        {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
        {confirmDelete && <ConfirmDeleteModal itemType={confirmDelete.type === 'staff' ? 'メンバー' : '業務'} itemName={confirmDelete.name} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />}
        {approvalStaff && <ShiftApprovalModal staffMember={approvalStaff} schedule={currentMonthSchedule[approvalStaff.id]} shiftPatterns={shiftPatterns} holidays={currentMonthHolidays} year={year} month={month} onConfirm={handleConfirmApproval} onClose={() => setApprovalModalStaffId(null)} />}
        {submissionConfirmation && <ConfirmationModal title="シフトの提出" message="提出しますか？" onConfirm={handleConfirmSubmission} onCancel={() => setSubmissionConfirmation(null)} />}
        {remandConfirmation && <ConfirmationModal title="差戻の確認" message="本当に差し戻しますか？" onConfirm={handleConfirmRemand} onCancel={() => setRemandConfirmation(null)} />}
        {holidayConfirmation && <ConfirmationModal title={holidayConfirmation.isUnlocking ? "休日設定解除" : "休日設定"} message="全メンバーに適用しますか？" onConfirm={holidayConfirmation.onConfirm} onCancel={() => setHolidayConfirmation(null)} />}
        {absenceNotificationConfirmation && <ConfirmationModal title="欠勤の周知" message={`${absenceNotificationConfirmation.staffMember.name}さんの欠勤をチャットで周知しますか？`} onConfirm={() => handleAbsenceNotificationResponse(true)} onCancel={() => handleAbsenceNotificationResponse(false)} />}
        {/* 追加: 承認取り消し確認モーダル */}
        {approvalCancellationConfirmation && <ConfirmationModal title="承認の取り消し" message={`${approvalCancellationConfirmation.name}さんの承認を取り消しますか？`} onConfirm={handleConfirmApprovalCancellation} onCancel={() => setApprovalCancellationConfirmation(null)} />}
        <footer className="text-center mt-6 text-sm text-slate-500 pb-8"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default MainContent;
