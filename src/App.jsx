import React, { useState, useMemo, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { oktaConfig } from './config/okta';

// Hooks & Services & Utils
import { useShiftData } from './hooks/useShiftData';
import { chatService } from './services/chatService';
import { downloadScheduleCSV } from './utils/csvExporter';
import { getJapaneseHolidays, formatValue } from './utils/dateUtils';
import { summarizePattern, generateScheduleForMonth } from './utils/scheduleUtils';

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

const oktaAuth = new OktaAuth(oktaConfig);

const App = () => {
  const navigate = useNavigate();
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

  return (
    <Security oktaAuth={oktaAuth} restoreOriginalUri={restoreOriginalUri}>
      <Routes>
        <Route path="/login/callback" element={<LoginCallback />} />
        <Route path="/*" element={<MainContent />} />
      </Routes>
    </Security>
  );
};

const MainContent = () => {
  const { oktaAuth, authState } = useOktaAuth();
  
  // 年月ステートを先に定義してHookに渡す
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const {
    staff, schedule, tasks, shiftPatterns, adminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, 
    saveStatus, initialDataLoaded,
    actions // DB操作用アクション
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

  // ユーザー認証情報の特定
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

  // 人数不足カウントの計算（scheduleが変わるたびに再計算）
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

  // シフト更新ハンドラ
  const handleUpdateSchedule = (staffId, day, value) => {
    // 汎用更新アクションを呼び出し
    actions.updateSchedule(year, month, staffId, day, value);

    if (isAdmin && value === '欠') {
      const target = staff.find(s => s.id === staffId);
      setAbsenceNotificationConfirmation({ staffMember: target, day, value });
    }
  };

  const handleAbsenceNotificationResponse = async (send) => {
    if (!absenceNotificationConfirmation) return;
    const { staffMember, day, value } = absenceNotificationConfirmation;
    // 更新は既にされているので通知のみ
    if (send) {
      setIsLoading(true);
      try { await chatService.sendAbsence(staffMember.name); } catch (e) { alert(e.message); }
      setIsLoading(false);
    }
    setAbsenceNotificationConfirmation(null);
  };

  // 提出トグル
  const handleToggleShiftSubmitted = (staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftSubmitted?.[key]) {
      actions.updateShiftStatus(staffId, 'shiftSubmitted', year, month, false);
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
    
    try { 
      await chatService.sendSubmission(name, year, month, mentions);
      actions.updateShiftStatus(staffId, 'shiftSubmitted', year, month, true);
    } catch (e) { 
      alert('通知送信に失敗しました'); 
    }
    
    setIsLoading(false);
    setSubmissionConfirmation(null);
  };

  // 差戻トグル
  const handleToggleShiftRemanded = (staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftRemanded?.[key]) {
        actions.updateShiftStatus(staffId, 'shiftRemanded', year, month, false);
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
    
    try { 
      await chatService.sendRemand(name, s.chatUserId); 
      actions.updateShiftStatus(staffId, 'shiftRemanded', year, month, true);
    } catch (e) { 
      alert('通知送信に失敗しました'); 
    }
    
    setIsLoading(false);
    setRemandConfirmation(null);
  };

  // 承認トグル
  const handleToggleShiftApproved = (staffId) => {
      const s = staff.find(x => x.id === staffId);
      if (s?.shiftApproved?.[key]) {
          actions.updateShiftStatus(staffId, 'shiftApproved', year, month, false);
      } else {
          setApprovalModalStaffId(staffId);
      }
  };

  const handleConfirmApproval = async (remarks) => {
    if (!approvalModalStaffId) return;
    const s = staff.find(x => x.id === approvalModalStaffId);
    
    // イレギュラー勤務抽出ロジック（そのまま維持）
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
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            const wStr = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeek];
            irregularities.push(`${month}/${day}(${wStr}): ${formatValue(actual) || '未入力'}`);
        }
    }

    setIsLoading(true);
    setLoadingMessage('承認通知を送信中...');
    
    try { 
      await chatService.sendApproval(s, year, month, summarizePattern(s.defaultShift.pattern, shiftPatterns), irregularities.join('\n') || 'なし', remarks); 
      actions.updateShiftStatus(approvalModalStaffId, 'shiftApproved', year, month, true);
    } catch (e) { 
      alert('通知送信に失敗しました'); 
    }
    
    setIsLoading(false);
    setApprovalModalStaffId(null);
  };

  // 各種更新ハンドラ
  const handleUpdateStaffInfo = (id, field, val) => {
    actions.updateStaffProperty(id, field, val);
  };

  const handleDeleteStaff = (id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name });
  const handleDeleteTask = (id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t => t.id === id)?.name });
  const handleExportCSV = () => downloadScheduleCSV({ staff, tasks, schedule, shiftPatterns, taskCountsByDay, days, year, month });
  
  // 業務担当一括設定保存
  const handleBulkUpdateStaffTasks = async (taskStaffMap) => {
      // 既存のスタッフデータをコピーして修正
      const updatedStaffList = staff.map(s => {
          // 自分のIDが含まれているタスクIDのリストを作成
          const newPossibleTasks = Object.entries(taskStaffMap)
              .filter(([_, staffIds]) => staffIds.includes(s.id))
              .map(([taskId, _]) => taskId);
          return { ...s, possibleTasks: newPossibleTasks };
      });

      // 変更があったスタッフのみ更新をかける（Batch処理が理想だが簡易的にループ）
      // Firestoreの書き込み回数を減らすため、差分チェックしても良い
      for (const s of updatedStaffList) {
          await actions.updateStaffProperty(s.id, 'possibleTasks', s.possibleTasks);
      }
      setIsTaskEditorOpen(false);
  };

  // 単一タスクの担当者更新
  const handleUpdateSingleTaskStaff = (taskId, newStaffIds) => {
    // 関連する全スタッフの possibleTasks を更新する必要がある
    staff.forEach(s => {
        const isAssigned = newStaffIds.includes(s.id);
        const currentTasks = s.possibleTasks || [];
        const hasTask = currentTasks.includes(taskId);

        if (isAssigned && !hasTask) {
            actions.updateStaffProperty(s.id, 'possibleTasks', [...currentTasks, taskId]);
        } else if (!isAssigned && hasTask) {
            actions.updateStaffProperty(s.id, 'possibleTasks', currentTasks.filter(tid => tid !== taskId));
        }
    });
  };
  
  const handleApplyStaffPattern = async (staffId, newPattern, hasBreak) => {
    // 1. デフォルトシフト設定を保存
    await actions.updateStaffProperty(staffId, 'defaultShift', { pattern: newPattern, hasBreak });
    
    // 2. 現在の月のスケジュールを更新 (ローカル計算してからDB保存)
    // Note: 月ごとの一括更新になるため、ループで updateSchedule を呼ぶと通信回数が多い。
    // 本来はBatch書き込み関数を用意すべきだが、ここでは簡易実装としてループする
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
        // DB更新 (awaitしないことで高速化っぽく見せるが、順序保証はなし)
        actions.updateSchedule(year, month, staffId, day, shiftValue);
    }
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'staff') {
        actions.deleteStaff(confirmDelete.id);
    } else {
        const newTasks = tasks.filter(t => t.id !== confirmDelete.id);
        actions.updateTasks(newTasks);
        // スタッフの possibleTasks からも削除が必要
        staff.forEach(s => {
            if (s.possibleTasks.includes(confirmDelete.id)) {
                actions.updateStaffProperty(s.id, 'possibleTasks', s.possibleTasks.filter(tid => tid !== confirmDelete.id));
            }
        });
    }
    setConfirmDelete(null);
  };

  const handleAddStaff = () => {
      const newId = `s${Date.now()}`;
      const newMember = {
          id: newId, employeeId: 'New', name: '新規メンバー', role: 'OP', chatUserId: '', possibleTasks: [],
          defaultShift: { pattern: ['A','A','A','A','A'], hasBreak: true }, shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {}
      };
      actions.addStaff(newMember);
  };

  // 休日一括設定
  const handleSetDayAsHolidayForAll = (day) => {
      if(!isAdmin) return;
      const isAlreadyLockedHoliday = staff.length > 0 && staff.every(s => {
        const entry = (schedule[key] || {})[s.id]?.[day];
        return typeof entry === 'object' && entry?.locked === true;
      });

      if (isAlreadyLockedHoliday) {
        setHolidayConfirmation({ day, isUnlocking: true, onConfirm: () => {
                staff.forEach(s => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = date.getDay();
                    let restoredValue = (currentMonthHolidays.includes(day) || dayOfWeek === 0 || dayOfWeek === 6) ? 'シフト休' : '';
                    if (restoredValue === '' && dayOfWeek > 0 && dayOfWeek < 6) {
                        const pId = s.defaultShift.pattern[dayOfWeek - 1];
                        restoredValue = pId === 'シフト休' ? 'シフト休' : (shiftPatterns.find(p => p.id === pId)?.workHours || '');
                    }
                    actions.updateSchedule(year, month, s.id, day, restoredValue);
                });
                setHolidayConfirmation(null);
            },
        });
    } else {
        setHolidayConfirmation({ day, isUnlocking: false, onConfirm: () => {
                staff.forEach(s => {
                    actions.updateSchedule(year, month, s.id, day, { type: 'シフト休', locked: true });
                });
                setHolidayConfirmation(null);
            },
        });
    }
  };

  // その他マスタ更新系
  const handleUpdatePatterns = (newPatterns) => actions.updatePatterns(newPatterns);
  const handleUpdateConfig = (newConfig) => actions.updateConfig(newConfig);

  // マスタデータ更新時のコールバック用ラッパー
  const onSaveMemberManagement = (updatedStaff) => {
      // 変更点を検知して更新するのがベストだが、今回は全件ループで差異があれば更新
      updatedStaff.forEach(ns => {
          const os = staff.find(s => s.id === ns.id);
          if (JSON.stringify(ns) !== JSON.stringify(os)) {
              actions.updateStaffFull(ns.id, ns);
          }
      });
      setIsMemberManagementOpen(false); 
  };

  // レンダリング -------------------------------------------
  
  if (!authState) return <LoadingScreen message="認証状態を確認中..." />;
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6] p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Shift Scheduler</h1>
          <p className="text-sm text-slate-500 mb-6">関係者専用ログイン</p>
          <button onClick={() => oktaAuth.signInWithRedirect()} className="w-full py-2 px-4 bg-[#F4B896] text-white rounded-md shadow hover:bg-[#E8A680] font-semibold transition-colors">Oktaでログイン</button>
        </div>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold tracking-wider">digsyシフト表</h1>
          </div>
          <div className="flex items-center gap-4">
             <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold w-36 justify-center ${saveStatus === 'saved' ? 'text-white/80' : 'text-yellow-300'}`}>
                <span>{saveStatus === 'saved' ? '保存済み' : saveStatus === 'saving' ? '保存中...' : 'エラー'}</span>
             </div>
             <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold">ガイド</button>
             <Legend />
          </div>
        </header>

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} schedule={currentMonthSchedule} staff={staff} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} onDeleteStaff={handleDeleteStaff} onUpdateStaffInfo={handleUpdateStaffInfo}
            onApplyStaffPattern={handleApplyStaffPattern} onToggleShiftSubmitted={handleToggleShiftSubmitted}
            onToggleShiftApproved={handleToggleShiftApproved} onToggleShiftRemanded={handleToggleShiftRemanded}
            onSetDayAsHolidayForAll={handleSetDayAsHolidayForAll}
          />
          <ShiftPatternDisplay patterns={shiftPatterns} onAddPattern={(p) => handleUpdatePatterns([...shiftPatterns, p].sort((a,b)=>a.id.localeCompare(b.id)))} />
          <TaskShortageDisplay 
            isAdmin={isAdmin} currentUser={currentUser} tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay}
            onUpdateTask={(id, name) => actions.updateTasks(tasks.map(t => t.id === id ? { ...t, name } : t))} onDeleteTask={handleDeleteTask}
            onUpdateTaskPersonnel={(id, count) => actions.updateTasks(tasks.map(t => t.id === id ? { ...t, requiredPersonnel: count } : t))}
            onUpdateTaskStaff={handleUpdateSingleTaskStaff} 
          />
          <MonthlyCalendar
            schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month}
            onUpdateSchedule={(staffId, d, v, ty, tm) => actions.updateSchedule(ty || year, tm || month, staffId, d, v)}
            isAdmin={isAdmin} currentUser={currentUser}
          />
          <div className="mt-4 flex flex-wrap gap-4 items-center">
            {isAdmin && (
              <>
                <button onClick={handleAddStaff} className="px-4 py-2 bg-[#F4B896] text-white rounded hover:bg-[#E8A680]">+ メンバー追加</button>
                <button onClick={() => actions.updateTasks([...tasks, { id: `t${Date.now()}`, name: '新業務', requiredPersonnel: 3 }])} className="px-4 py-2 bg-[#F4B896] text-white rounded hover:bg-[#E8A680]">+ 業務追加</button>
                <button onClick={() => setIsTaskEditorOpen(true)} className="px-4 py-2 bg-[#F4B896] text-white rounded hover:bg-[#E8A680]">業務担当設定</button>
                <button onClick={() => setIsMemberManagementOpen(true)} className="px-4 py-2 bg-[#F4B896] text-white rounded hover:bg-[#E8A680]">メンバー管理</button>
                <button onClick={() => setIsAdminSettingsOpen(true)} className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600">通知設定</button>
              </>
            )}
            <button onClick={handleExportCSV} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">CSV出力</button>
          </div>
        </main>

        {isAdmin && isMemberManagementOpen && <MemberManagementModal staff={staff} onClose={() => setIsMemberManagementOpen(false)} onSave={onSaveMemberManagement} />}
        {isAdmin && isAdminSettingsOpen && <AdminSettingsModal adminConfig={adminConfig} onClose={() => setIsAdminSettingsOpen(false)} onSave={(cfg) => { handleUpdateConfig(cfg); setIsAdminSettingsOpen(false); }} />}
        {isAdmin && isTaskEditorOpen && <TaskStaffMappingEditor staff={staff} tasks={tasks} onClose={() => setIsTaskEditorOpen(false)} onSave={handleBulkUpdateStaffTasks} />}
        {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
        {confirmDelete && <ConfirmDeleteModal itemType={confirmDelete.type === 'staff' ? 'メンバー' : '業務'} itemName={confirmDelete.name} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />}
        {approvalStaff && <ShiftApprovalModal staffMember={approvalStaff} schedule={currentMonthSchedule[approvalStaff.id]} shiftPatterns={shiftPatterns} holidays={currentMonthHolidays} year={year} month={month} onConfirm={handleConfirmApproval} onClose={() => setApprovalModalStaffId(null)} />}
        {submissionConfirmation && <ConfirmationModal title="シフトの提出" message="提出しますか？" onConfirm={handleConfirmSubmission} onCancel={() => setSubmissionConfirmation(null)} />}
        {remandConfirmation && <ConfirmationModal title="差戻の確認" message="本当に差し戻しますか？" onConfirm={handleConfirmRemand} onCancel={() => setRemandConfirmation(null)} />}
        {holidayConfirmation && <ConfirmationModal title={holidayConfirmation.isUnlocking ? "休日設定解除" : "休日設定"} message="全メンバーに適用しますか？" onConfirm={holidayConfirmation.onConfirm} onCancel={() => setHolidayConfirmation(null)} />}
        {absenceNotificationConfirmation && <ConfirmationModal title="欠勤の周知" message={`${absenceNotificationConfirmation.staffMember.name}さんの欠勤をチャットで周知しますか？`} onConfirm={() => handleAbsenceNotificationResponse(true)} onCancel={() => handleAbsenceNotificationResponse(false)} />}
        <footer className="text-center mt-6 text-sm text-slate-500"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

export default App;
