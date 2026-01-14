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

const oktaAuth = new OktaAuth(oktaConfig);

const MainContent = () => {
  const { oktaAuth, authState } = useOktaAuth();
  const {
    staff, setStaff, schedule, setSchedule, tasks, setTasks,
    shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData();

  const [currentUser, setCurrentUser] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
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
    if (isAdmin && value === '欠勤') {
      const target = staff.find(s => s.id === staffId);
      setAbsenceNotificationConfirmation({ staffMember: target, day, value });
    }
  };

  const handleApplyStaffPattern = (staffId, newPattern, hasBreakArray) => {
    setStaff(prevStaff => prevStaff.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreakArray } } : s));
    const newMonthScheduleForStaff = {};
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); 
        const isHoliday = currentMonthHolidays.includes(day);
        let shiftValue = '';
        if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) {
            shiftValue = 'シフト休';
        } else {
            const pId = newPattern[dayOfWeek - 1];
            if (pId === 'シフト休') {
                shiftValue = 'シフト休';
            } else {
                const pattern = shiftPatterns.find(p => p.id === pId);
                if (pattern) {
                    const isBreak = hasBreakArray && hasBreakArray[dayOfWeek - 1];
                    if (isBreak) {
                        shiftValue = pattern.workHours;
                    } else {
                        const breakNum = parseFloat(pattern.breakTime?.split(':')[0] || 1);
                        shiftValue = pattern.workHours + breakNum;
                    }
                }
            }
        }
        newMonthScheduleForStaff[day] = shiftValue;
    }
    setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [staffId]: newMonthScheduleForStaff } }));
  };

  const handleExportCSV = () => downloadScheduleCSV({ staff, tasks, schedule, shiftPatterns, taskCountsByDay, days, year, month });

  if (!authState) return <LoadingScreen message="認証状態を確認中..." />;
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6] p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Shift Scheduler</h1>
          <button onClick={() => oktaAuth.signInWithRedirect()} className="w-full py-2 px-4 bg-[#F4B896] text-white rounded-md shadow hover:bg-[#E8A680] font-semibold transition-colors">Oktaでログイン</button>
        </div>
      </div>
    );
  }

  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;

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
                <span>{saveStatus === 'saved' ? '自動保存済み' : saveStatus === 'saving' ? '保存中...' : '編集中...'}</span>
             </div>
             <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold">ガイド</button>
             <Legend />
          </div>
        </header>

        <main className="space-y-6">
          <ShiftSchedule 
            isAdmin={isAdmin} currentUser={currentUser} schedule={schedule[key] || {}} staff={staff} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
            onUpdateSchedule={handleUpdateSchedule} 
            onDeleteStaff={(id) => setConfirmDelete({type: 'staff', id, name: staff.find(s => s.id === id)?.name})} 
            onUpdateStaffInfo={(id, f, v) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [f]: v } : s))}
            onApplyStaffPattern={handleApplyStaffPattern} 
            onToggleShiftSubmitted={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftSubmitted: { ...s.shiftSubmitted, [key]: !s.shiftSubmitted?.[key] } } : s))}
            onToggleShiftApproved={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: !s.shiftApproved?.[key] } } : s))}
            onToggleShiftRemanded={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftRemanded: { ...s.shiftRemanded, [key]: !s.shiftRemanded?.[key] } } : s))}
            onSetDayAsHolidayForAll={(day) => setHolidayConfirmation({ day, onConfirm: () => { /* 処理 */ setHolidayConfirmation(null); } })}
          />
          <div className="flex gap-2">
            <button onClick={handleExportCSV} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-bold">CSV出力</button>
          </div>
        </main>
        {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
        {confirmDelete && <ConfirmDeleteModal itemType="メンバー" itemName={confirmDelete.name} onConfirm={() => setConfirmDelete(null)} onCancel={() => setConfirmDelete(null)} />}
        <footer className="text-center mt-6 text-sm text-slate-500"><p>Powered by Gemini & React</p></footer>
      </div>
    </div>
  );
};

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

export default App;
