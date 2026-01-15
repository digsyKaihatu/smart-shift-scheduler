import React, { useState, useMemo, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { oktaConfig } from './config/okta';

// Hooks & Utils
import { useShiftData } from './hooks/useShiftData';
import { getJapaneseHolidays } from './utils/dateUtils';

// Components
import LoadingScreen from './components/common/LoadingScreen';
import HelpGuideModal from './components/common/HelpGuideModal';
import ShiftSchedule from './components/schedule/ShiftSchedule';
import MonthlyCalendar from './components/schedule/MonthlyCalendar'; // 追加
import TaskShortageDisplay from './components/tasks/TaskShortageDisplay';
import { ConfirmDeleteModal } from './components/common/Modal';

const oktaAuth = new OktaAuth(oktaConfig);

const MainContent = () => {
  const { oktaAuth, authState } = useOktaAuth();
  const {
    staff, setStaff, schedule, setSchedule, tasks, shiftPatterns, adminConfig,
    isLoading, loadingMessage, saveStatus
  } = useShiftData();

  const [currentUser, setCurrentUser] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  useEffect(() => {
    const identifyUser = async () => {
      if (authState?.isAuthenticated) {
        const userInfo = await oktaAuth.getUser();
        const matchedStaff = staff.find(s => s.email === userInfo.email);
        if (matchedStaff) setCurrentUser(matchedStaff);
      }
    };
    if (authState?.isAuthenticated && staff.length > 0) identifyUser();
  }, [authState, oktaAuth, staff]);

  const isAdmin = useMemo(() => {
    if (!currentUser || !adminConfig?.adminEmails) return false;
    return adminConfig.adminEmails.split(',').map(e => e.trim()).includes(currentUser.email);
  }, [currentUser, adminConfig]);

  const taskCountsByDay = useMemo(() => {
    const counts = {};
    days.forEach(({day}) => {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const val = schedule[key]?.[s.id]?.[day];
        const isWorking = (typeof val === 'number' && val > 0) || (val?.hours > 0);
        if (isWorking) {
          (s.possibleTasks || []).forEach(tId => {
            if (counts[day][tId] !== undefined) {
              counts[day][tId] = (counts[day][tId] || 0) + 1;
            }
          });
        }
      });
    });
    return counts;
  }, [schedule, key, staff, tasks, days]);

  // 更新関数を拡張（MonthlyCalendarからの年・月指定にも対応）
  const handleUpdateSchedule = (staffId, day, value, targetYear = year, targetMonth = month) => {
    const targetKey = `${targetYear}-${targetMonth}`;
    setSchedule(prev => {
      const newMonth = { ...(prev[targetKey] || {}) };
      const newStaff = { ...(newMonth[staffId] || {}) };
      newStaff[day] = value;
      newMonth[staffId] = newStaff;
      return { ...prev, [targetKey]: newMonth };
    });
  };

  const handleApplyStaffPattern = (staffId, newPattern, hasBreakArray) => {
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreakArray } } : s));
    const newMonthSchedule = {};
    days.forEach(({day, dayOfWeek}) => {
        if (['土','日'].includes(dayOfWeek) || currentMonthHolidays.includes(day)) {
            newMonthSchedule[day] = 'シフト休';
        } else {
            const pId = newPattern[['月','火','水','木','金'].indexOf(dayOfWeek)];
            if (pId === 'シフト休') {
                newMonthSchedule[day] = 'シフト休';
            } else {
                const pattern = shiftPatterns.find(p => p.id === pId);
                if (pattern) {
                    const isBreak = hasBreakArray[['月','火','水','木','金'].indexOf(dayOfWeek)];
                    newMonthSchedule[day] = isBreak ? pattern.workHours : (pattern.workHours + 1);
                }
            }
        }
    });
    setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [staffId]: newMonthSchedule } }));
  };

  if (!authState) return <LoadingScreen message="認証確認中..." />;
  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF9F6]">
        <button onClick={() => oktaAuth.signInWithRedirect()} className="px-6 py-3 bg-[#F4B896] text-white rounded font-bold shadow-lg">Oktaでログイン</button>
      </div>
    );
  }

  if (isLoading || !currentUser) return <LoadingScreen message={loadingMessage} />;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        <header className="mb-4 bg-[#F4B896] text-white rounded-md shadow-lg p-3 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none font-bold text-black text-2xl outline-none">
              {Array.from({length: 5}, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xl">年</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none font-bold text-black text-2xl outline-none">
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-xl">月</span>
            <h1 className="text-2xl font-bold tracking-wider">digsyシフト表</h1>
          </div>
          <div className="flex items-center gap-4">
             <span className="text-xs font-bold">{saveStatus === 'saved' ? '保存済' : '保存中...'}</span>
             <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold">ガイド</button>
          </div>
        </header>

        <ShiftSchedule 
          currentUser={currentUser} isAdmin={isAdmin} schedule={schedule[key] || {}} staff={staff} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
          onUpdateSchedule={handleUpdateSchedule} 
          onDeleteStaff={(id) => setConfirmDelete({id, name: staff.find(s => s.id === id)?.name})}
          onUpdateStaffInfo={(id,f,v) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [f]: v } : s))}
          onApplyStaffPattern={handleApplyStaffPattern}
          onToggleShiftSubmitted={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftSubmitted: { ...s.shiftSubmitted, [key]: !s.shiftSubmitted?.[key] } } : s))}
          onToggleShiftApproved={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: !s.shiftApproved?.[key] } } : s))}
          onToggleShiftRemanded={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftRemanded: { ...s.shiftRemanded, [key]: !s.shiftRemanded?.[key] } } : s))}
          onSetDayAsHolidayForAll={()=>{}}
        />

        <TaskShortageDisplay 
            tasks={tasks} 
            staff={staff} 
            days={days} 
            holidays={currentMonthHolidays}
            taskCountsByDay={taskCountsByDay} 
            isAdmin={isAdmin}
            onUpdateTaskStaff={(taskId, staffIds) => {
                setStaff(prev => prev.map(s => {
                    const isAssigned = staffIds.includes(s.id);
                    const currentTasks = s.possibleTasks || [];
                    const newTasks = isAssigned 
                        ? (currentTasks.includes(taskId) ? currentTasks : [...currentTasks, taskId])
                        : currentTasks.filter(tid => tid !== taskId);
                    return { ...s, possibleTasks: newTasks };
                }));
            }}
        />

        {/* マンスリーカレンダーの復元 */}
        <MonthlyCalendar 
            schedule={schedule}
            staff={staff}
            tasks={tasks}
            shiftPatterns={shiftPatterns}
            initialYear={year}
            initialMonth={month}
            onUpdateSchedule={handleUpdateSchedule}
            isAdmin={isAdmin}
            currentUser={currentUser}
        />
      </div>
      {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
      {confirmDelete && <ConfirmDeleteModal itemType="メンバー" itemName={confirmDelete.name} onConfirm={() => {
          setStaff(prev => prev.filter(s => s.id !== confirmDelete.id));
          setConfirmDelete(null);
      }} onCancel={() => setConfirmDelete(null)} />}
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
