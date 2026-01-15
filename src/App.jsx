import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * ==========================================
 * 1. 定数・初期データ (initialData.js)
 * ==========================================
 */
const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'B', name: 'B', startTime: '9:00', endTime: '17:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'C', name: 'C', startTime: '9:00', endTime: '17:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'D', name: 'D', startTime: '9:00', endTime: '16:30', breakTime: '1:00', workHours: 6.5 },
  { id: 'E', name: 'E', startTime: '9:00', endTime: '16:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'F', name: 'F', startTime: '9:00', endTime: '15:30', breakTime: '1:00', workHours: 5.5 },
  { id: 'G', name: 'G', startTime: '9:00', endTime: '15:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'H', name: 'H', startTime: '9:00', endTime: '13:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'J', name: 'J', startTime: '9:30', endTime: '18:00', breakTime: '1:00', workHours: 7.5 },
  { id: 'K', name: 'K', startTime: '9:30', endTime: '17:30', breakTime: '1:00', workHours: 7.0 },
  { id: 'L', name: 'L', startTime: '9:30', endTime: '17:00', breakTime: '1:00', workHours: 6.5 },
  { id: 'M', name: 'M', startTime: '9:30', endTime: '16:30', breakTime: '1:00', workHours: 6.0 },
  { id: 'N', name: 'N', startTime: '9:30', endTime: '16:00', breakTime: '1:00', workHours: 5.5 },
  { id: 'O', name: 'O', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 },
  { id: 'P', name: 'P', startTime: '10:00', endTime: '18:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'Q', name: 'Q', startTime: '10:00', endTime: '18:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'R', name: 'R', startTime: '10:00', endTime: '17:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'S', name: 'S', startTime: '10:00', endTime: '16:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'T', name: 'T', startTime: '11:00', endTime: '20:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'U', name: 'U', startTime: '13:00', endTime: '20:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'V', name: 'V', startTime: '12:00', endTime: '20:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'W', name: 'W', startTime: '13:30', endTime: '18:00', breakTime: '0:00', workHours: 4.5 },
  { id: 'X', name: 'X', startTime: '10:00', endTime: '14:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'Y', name: 'Y', startTime: '10:00', endTime: '13:00', breakTime: '0:00', workHours: 3.0 },
  { id: 'Z', name: 'Z', startTime: '14:00', endTime: '20:00', breakTime: '1:00', workHours: 5.0 },
  { id: '@', name: '@', startTime: '14:30', endTime: '20:00', breakTime: '1:00', workHours: 4.5 },
  { id: '★', name: '★', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 }
];

const initialStaffData = [
  {
    id: 'admin',
    name: '管理者',
    role: '管理者',
    employeeId: '000',
    email: 'admin@example.com',
    chatUserId: '',
    possibleTasks: ['t1', 't2', 't3'],
    defaultShift: { pattern: ['I', 'I', 'I', 'I', 'I'], hasBreakArray: [true, true, true, true, true] },
    shiftSubmitted: {},
    shiftRemanded: {},
    shiftApproved: {}
  }
];

const initialTasks = [
  { id: 't1', name: '業務A', requiredPersonnel: 3 },
  { id: 't2', name: '業務B', requiredPersonnel: 2 },
  { id: 't3', name: '業務C', requiredPersonnel: 2 }
];

/**
 * ==========================================
 * 2. ユーティリティ (dateUtils.js, scheduleUtils.js)
 * ==========================================
 */
const getJapaneseHolidays = (year, month) => {
  // 簡易版ロジック (本来は外部APIやライブラリ推奨)
  return []; 
};

const formatValue = (value) => {
  const mapping = { 'シフト休': '休', '欠勤': '欠', '通休': '通', '有休': '有', '遅刻': '遅', '早退': '早' };
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = mapping[value.type] || value.type;
    return value.locked ? displayType : `${displayType}(${value.hours})`;
  }
  return mapping[value] || value;
};

const generateScheduleForMonth = (year, month, staffData, shiftPatternsData) => {
  const scheduleForMonth = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  staffData.forEach(member => {
    scheduleForMonth[member.id] = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        scheduleForMonth[member.id][day] = 'シフト休';
      } else {
        const patternIndex = dayOfWeek - 1;
        const patternId = member.defaultShift?.pattern?.[patternIndex];
        if (patternId === 'シフト休') {
          scheduleForMonth[member.id][day] = 'シフト休';
        } else {
          const p = shiftPatternsData.find(x => x.id === patternId);
          scheduleForMonth[member.id][day] = p ? p.workHours : '';
        }
      }
    }
  });
  return scheduleForMonth;
};

const summarizePattern = (pattern, patterns, hasBreakArray) => {
  if (!pattern || pattern.length !== 5) return '未設定';
  const DAY_NAMES = ['月', '火', '水', '木', '金'];
  const lines = pattern.map((pId, index) => {
    const isBreak = Array.isArray(hasBreakArray) ? hasBreakArray[index] : true;
    const breakLabel = isBreak ? "" : "×"; 
    if (pId === 'シフト休') return `${DAY_NAMES[index]}:休`;
    const p = patterns.find(x => x.id === pId);
    return `${DAY_NAMES[index]}:${p ? p.name : '?'}${breakLabel}`;
  });
  return `${lines.slice(0, 3).join(' ')}\n${lines.slice(3).join(' ')}`;
};

/**
 * ==========================================
 * 3. 共通コンポーネント (Icons, Modal, Loading)
 * ==========================================
 */
const ChevronDownIcon = () => (
  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-600" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
  </svg>
);

const LoadingScreen = ({ message = "読み込み中..." }) => (
  <div className="fixed inset-0 bg-white/90 flex flex-col items-center justify-center z-[100]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#F4B896]"></div>
    <p className="mt-4 font-bold text-slate-600">{message}</p>
  </div>
);

const ConfirmDeleteModal = ({ itemName, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={onCancel}>
    <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
      <h3 className="text-lg font-bold mb-4">{itemName} を削除しますか？</h3>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-slate-100 rounded text-sm font-bold">キャンセル</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white rounded text-sm font-bold">削除する</button>
      </div>
    </div>
  </div>
);

/**
 * ==========================================
 * 4. メインコンポーネント
 * ==========================================
 */

// --- シフトスケジュール表 ---
const ShiftSchedule = ({ schedule, staff, days, holidays, shiftPatterns, year, month, onUpdateSchedule, onApplyStaffPattern }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              <th className="p-2 border border-slate-200 sticky left-0 bg-slate-100 min-w-[100px]">名前</th>
              {days.map(d => (
                <th key={d.day} className={`p-1 border border-slate-200 min-w-[40px] ${d.dayOfWeek === '日' ? 'bg-red-50' : d.dayOfWeek === '土' ? 'bg-blue-50' : ''}`}>
                  <div>{d.day}</div>
                  <div className="scale-75">{d.dayOfWeek}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}>
                <td className="p-2 border border-slate-200 sticky left-0 bg-white font-bold">{s.name}</td>
                {days.map(d => {
                  const val = schedule[s.id]?.[d.day] || '';
                  return (
                    <td key={d.day} className="p-0 border border-slate-200 text-center">
                      <div className="h-8 flex items-center justify-center">
                        {formatValue(val)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- マンスリーカレンダー ---
const MonthlyCalendar = ({ schedule, staff, year, month }) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const key = `${year}-${month}`;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
      <h2 className="text-lg font-bold mb-4">{year}年{month}月の出勤・休暇状況</h2>
      <div className="grid grid-cols-7 gap-1">
        {['日','月','火','水','木','金','土'].map(d => (
          <div key={d} className="text-center p-1 font-bold text-slate-400 text-xs">{d}</div>
        ))}
        {/* 開始曜日のオフセットなどは簡易化 */}
        {calendarDays.map(d => {
          const date = new Date(year, month-1, d);
          const dayOfWeek = date.getDay();
          const daySchedule = [];
          staff.forEach(s => {
            const val = schedule[key]?.[s.id]?.[d];
            if (val && val !== 'シフト休' && val !== '欠勤') {
              daySchedule.push({ name: s.name, type: 'work' });
            } else if (val === '欠勤' || (typeof val === 'object' && val.type === '欠勤')) {
              daySchedule.push({ name: s.name, type: 'absent' });
            }
          });

          return (
            <div key={d} className={`border border-slate-100 min-h-[80px] p-1 ${dayOfWeek === 0 ? 'bg-red-50/30' : dayOfWeek === 6 ? 'bg-blue-50/30' : ''}`}>
              <div className="text-[10px] font-bold text-slate-500">{d}</div>
              <div className="space-y-0.5 mt-1">
                {daySchedule.map((entry, i) => (
                  <div key={i} className={`text-[9px] px-1 rounded truncate ${entry.type === 'work' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- 業務不足表示 ---
const TaskShortageDisplay = ({ tasks, staff, days, taskCountsByDay }) => (
  <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
    <h2 className="text-lg font-bold mb-3">業務別充足状況</h2>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left border-b">業務名</th>
            {days.slice(0, 10).map(d => <th key={d.day} className="p-1 border-b">{d.day}</th>)}
            <th>...</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id}>
              <td className="p-2 border-b font-medium">{t.name} (定員:{t.requiredPersonnel})</td>
              {days.slice(0, 10).map(d => {
                const count = taskCountsByDay[d.day]?.[t.id] || 0;
                const isShort = count < t.requiredPersonnel;
                return (
                  <td key={d.day} className={`p-1 border-b text-center ${isShort ? 'text-red-600 font-bold bg-red-50' : 'text-slate-500'}`}>
                    {count}
                  </td>
                );
              })}
              <td className="border-b"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * ==========================================
 * 5. App 本体 (統合エントリーポイント)
 * ==========================================
 */
export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [staff, setStaff] = useState(initialStaffData);
  const [tasks] = useState(initialTasks);
  const [schedule, setSchedule] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [currentUser, setCurrentUser] = useState(initialStaffData[0]); // デモ用に初期値をセット

  const key = `${year}-${month}`;
  
  // 初期データ生成シミュレーション
  useEffect(() => {
    const timer = setTimeout(() => {
      const initialSchedule = {
        [key]: generateScheduleForMonth(year, month, staff, initialShiftPatterns)
      };
      setSchedule(initialSchedule);
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [key]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  const taskCountsByDay = useMemo(() => {
    const counts = {};
    days.forEach(({ day }) => {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const val = schedule[key]?.[s.id]?.[day];
        const isWorking = (typeof val === 'number' && val > 0) || (val?.hours > 0);
        if (isWorking) {
          (s.possibleTasks || []).forEach(tId => {
            if (counts[day][tId] !== undefined) counts[day][tId]++;
          });
        }
      });
    });
    return counts;
  }, [schedule, key, staff, tasks, days]);

  const handleUpdateSchedule = (staffId, day, value) => {
    setSchedule(prev => {
      const newMonth = { ...(prev[key] || {}) };
      const newStaff = { ...(newMonth[staffId] || {}) };
      newStaff[day] = value;
      newMonth[staffId] = newStaff;
      return { ...prev, [key]: newMonth };
    });
  };

  if (isLoading) return <LoadingScreen message="シフトデータを準備中..." />;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-[#F4B896] text-white rounded-xl shadow-lg p-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black tracking-tighter">digsy SMART SHIFT</h1>
            <div className="flex items-center gap-2 bg-white/20 p-2 rounded-lg">
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent font-bold outline-none">
                {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
              </select>
              <span>年</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent font-bold outline-none">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-slate-800">{m}</option>)}
              </select>
              <span>月</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-80">ログイン中</div>
            <div className="font-bold">{currentUser?.name}</div>
          </div>
        </header>

        <main className="space-y-8">
          {/* シフト表 */}
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-[#F4B896] rounded-full"></span>
              メインシフト表
            </h2>
            <ShiftSchedule 
              schedule={schedule[key] || {}} 
              staff={staff} 
              days={days} 
              holidays={[]} 
              shiftPatterns={initialShiftPatterns}
              year={year} 
              month={month}
              onUpdateSchedule={handleUpdateSchedule}
            />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 業務充足状況 */}
            <TaskShortageDisplay 
              tasks={tasks} 
              staff={staff} 
              days={days} 
              taskCountsByDay={taskCountsByDay} 
            />

            {/* カレンダー */}
            <MonthlyCalendar 
              schedule={schedule}
              staff={staff}
              year={year}
              month={month}
            />
          </div>
        </main>

        <footer className="text-center py-10 text-slate-400 text-xs">
          &copy; 2025 digsy Smart Shift Scheduler. すべての変更は自動保存されます。
        </footer>
      </div>
    </div>
  );
}
