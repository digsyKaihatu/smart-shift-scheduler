import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * ==========================================
 * 1. アイコンコンポーネント
 * ==========================================
 */
const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
  </svg>
);

const SetHolidayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const UnlockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v3m-6 2h12a2 2 0 002-2v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);

/**
 * ==========================================
 * 2. 初期データ & ユーティリティ
 * ==========================================
 */
const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'H', name: 'H', startTime: '9:00', endTime: '13:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'シフト休', name: '休', startTime: '-', endTime: '-', breakTime: '-', workHours: 0 }
];

const initialStaffData = [
  {
    id: 's1', name: '管理者', role: '管理者', employeeId: '000', email: 'admin@example.com',
    possibleTasks: ['t1', 't2', 't3'], defaultShift: { pattern: ['I', 'I', 'I', 'I', 'I'], hasBreakArray: [true, true, true, true, true] },
    shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {}
  }
];

const initialTasks = [
  { id: 't1', name: '業務A', requiredPersonnel: 3 },
  { id: 't2', name: '業務B', requiredPersonnel: 2 },
  { id: 't3', name: '業務C', requiredPersonnel: 2 }
];

const formatValue = (value) => {
  const mapping = { 'シフト休': '休', '欠勤': '欠', '通休': '通', '有休': '有', '遅刻': '遅', '早退': '早' };
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (value && typeof value === 'object' && 'type' in value) return mapping[value.type] || value.type;
  return mapping[value] || value;
};

const summarizePattern = (pattern, patterns, hasBreakArray) => {
  if (!pattern || pattern.length !== 5) return '未設定';
  const DAY_NAMES = ['月', '火', '水', '木', '金'];
  return pattern.map((pId, i) => {
    const p = patterns.find(x => x.id === pId);
    return `${DAY_NAMES[i]}:${p ? p.name : '?'}${hasBreakArray?.[i] ? '' : '×'}`;
  }).join(' ');
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
        const pId = member.defaultShift?.pattern?.[dayOfWeek - 1];
        if (pId === 'シフト休' || !pId) {
          scheduleForMonth[member.id][day] = 'シフト休';
        } else {
          const p = shiftPatternsData.find(x => x.id === pId);
          scheduleForMonth[member.id][day] = p ? p.workHours : '';
        }
      }
    }
  });
  return scheduleForMonth;
};

/**
 * ==========================================
 * 3. コンポーネント
 * ==========================================
 */

// --- ローディング ---
const LoadingScreen = ({ message }) => (
  <div className="fixed inset-0 bg-white/95 flex flex-col items-center justify-center z-[100]">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#F4B896] mb-4"></div>
    <p className="font-bold text-slate-500 text-sm tracking-widest">{message}</p>
  </div>
);

// --- シフト表 (固定列) ---
const ShiftSchedule = ({ schedule, staff, days, shiftPatterns, year, month, onUpdateSchedule }) => {
  const colWidths = { role: 60, empId: 80, name: 110, setting: 160, check: 45, del: 40 };
  const stickyPos = {
    role: 0,
    empId: colWidths.role,
    name: colWidths.role + colWidths.empId,
    setting: colWidths.role + colWidths.empId + colWidths.name,
    submit: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting,
    remand: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check,
    approve: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check * 2,
    del: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check * 3
  };

  const headerBase = "p-2 border border-slate-300 bg-slate-100 font-bold text-[10px] text-center sticky top-0 h-12 flex items-center justify-center";
  const fixedHeader = (left) => `sticky top-0 z-50 bg-slate-100 border-b-2 border-slate-300 p-2 font-bold text-[10px] text-center h-12 flex items-center justify-center`;
  const fixedCell = "sticky z-20 border border-slate-200 bg-white p-1 h-12 flex items-center justify-center overflow-hidden whitespace-nowrap text-[10px]";

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
      <div className="overflow-auto max-h-[65vh]">
        <table className="border-separate border-spacing-0 w-full">
          <thead>
            <tr>
              <th className={fixedHeader()} style={{ left: stickyPos.role, width: colWidths.role, minWidth: colWidths.role }}>役職</th>
              <th className={fixedHeader()} style={{ left: stickyPos.empId, width: colWidths.empId, minWidth: colWidths.empId }}>社員番号</th>
              <th className={fixedHeader()} style={{ left: stickyPos.name, width: colWidths.name, minWidth: colWidths.name }}>稼働名前</th>
              <th className={fixedHeader()} style={{ left: stickyPos.setting, width: colWidths.setting, minWidth: colWidths.setting }}>基本シフト設定</th>
              <th className={fixedHeader()} style={{ left: stickyPos.submit, width: colWidths.check, minWidth: colWidths.check }}>提出</th>
              <th className={fixedHeader()} style={{ left: stickyPos.remand, width: colWidths.check, minWidth: colWidths.check }}>差戻</th>
              <th className={fixedHeader()} style={{ left: stickyPos.approve, width: colWidths.check, minWidth: colWidths.check }}>承認</th>
              <th className={fixedHeader()} style={{ left: stickyPos.del, width: colWidths.del, minWidth: colWidths.del }}>削除</th>
              {days.map(d => (
                <th key={d.day} className={`${headerBase} min-w-[42px] z-30 ${d.dayOfWeek === '日' ? 'bg-red-50 text-red-600' : d.dayOfWeek === '土' ? 'bg-blue-50 text-blue-600' : ''}`}>
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] opacity-60 uppercase mb-0.5">{d.dayOfWeek}</span>
                    <span className="text-sm font-black">{d.day}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}>
                <td className={fixedCell} style={{ left: stickyPos.role }}>{s.role}</td>
                <td className={fixedCell} style={{ left: stickyPos.empId }}>{s.employeeId}</td>
                <td className={`${fixedCell} font-bold text-slate-700`} style={{ left: stickyPos.name }}>{s.name}</td>
                <td className={`${fixedCell} text-[9px] leading-tight text-slate-400`} style={{ left: stickyPos.setting }}>
                    {summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray)}
                </td>
                <td className={fixedCell} style={{ left: stickyPos.submit }}>
                    <input type="checkbox" checked={!!s.shiftSubmitted[`${year}-${month}`]} readOnly className="h-3 w-3 rounded border-slate-300" />
                </td>
                <td className={fixedCell} style={{ left: stickyPos.remand }}>
                    <input type="checkbox" checked={!!s.shiftRemanded[`${year}-${month}`]} readOnly className="h-3 w-3 rounded border-slate-300" />
                </td>
                <td className={fixedCell} style={{ left: stickyPos.approve }}>
                    <input type="checkbox" checked={!!s.shiftApproved[`${year}-${month}`]} readOnly className="h-3 w-3 rounded border-slate-300" />
                </td>
                <td className={fixedCell} style={{ left: stickyPos.del }}>
                    <button className="text-slate-300 hover:text-red-500 transition-colors"><DeleteIcon /></button>
                </td>
                {days.map(d => {
                  const val = schedule[s.id]?.[d.day] || '';
                  const isWeekend = d.dayOfWeek === '土' || d.dayOfWeek === '日';
                  return (
                    <td key={d.day} className={`border border-slate-100 text-center h-12 min-w-[42px] font-bold text-xs ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}>
                        {formatValue(val)}
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
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
      <h2 className="text-md font-bold mb-5 flex items-center gap-2 text-slate-700">
        <span className="w-1.5 h-6 bg-[#F4B896] rounded-full"></span>
        出勤・休暇者スケジュール
      </h2>
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
        {['日','月','火','水','木','金','土'].map(d => (
          <div key={d} className={`text-center py-2 font-black text-[10px] bg-slate-100 ${d === '日' ? 'text-red-400' : d === '土' ? 'text-blue-400' : 'text-slate-400'}`}>{d}</div>
        ))}
        {calendarDays.map(d => {
          const date = new Date(year, month-1, d);
          const dayOfWeek = date.getDay();
          const dayEntries = staff.map(s => {
            const val = schedule[key]?.[s.id]?.[d];
            if (val && val !== 'シフト休' && val !== '欠勤') return { name: s.name, type: 'work' };
            if (val === '欠勤') return { name: s.name, type: 'absent' };
            return null;
          }).filter(Boolean);

          return (
            <div key={d} className={`bg-white min-h-[95px] p-1.5 ${dayOfWeek === 0 ? 'bg-red-50/20' : dayOfWeek === 6 ? 'bg-blue-50/20' : ''}`}>
              <div className="text-[9px] font-bold text-slate-300 mb-1">{d}</div>
              <div className="flex flex-col gap-0.5">
                {dayEntries.map((e, i) => (
                  <div key={i} className={`text-[9px] px-1 py-0.5 rounded-md truncate font-bold shadow-sm ${e.type === 'work' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                    {e.name}
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

// --- 業務別充足状況 ---
const TaskShortageDisplay = ({ tasks, staff, days, taskCountsByDay }) => (
  <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 h-full">
    <h2 className="text-md font-bold mb-5 flex items-center gap-2 text-slate-700">
        <span className="w-1.5 h-6 bg-sky-300 rounded-full"></span>
        業務別充足状況
    </h2>
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="p-2 text-left text-slate-500 font-bold uppercase tracking-wider">業務</th>
            <th className="p-2 text-center text-slate-500 font-bold">定員</th>
            {days.slice(0, 15).map(d => (
              <th key={d.day} className="p-1 text-slate-400 font-medium">{d.day}</th>
            ))}
            <th className="p-2 text-slate-300 italic">...</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className="border-b border-slate-100 last:border-0">
              <td className="p-3 font-bold text-slate-600">{t.name}</td>
              <td className="p-3 text-center">
                <span className="bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500">{t.requiredPersonnel}</span>
              </td>
              {days.slice(0, 15).map(d => {
                const count = taskCountsByDay[d.day]?.[t.id] || 0;
                const isShort = count < t.requiredPersonnel;
                return (
                  <td key={d.day} className={`p-1 text-center font-black ${isShort ? 'text-red-500' : 'text-slate-400'}`}>
                    {count}
                  </td>
                );
              })}
              <td className=""></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * ==========================================
 * 4. メインApp
 * ==========================================
 */
export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [staff, setStaff] = useState(initialStaffData);
  const [tasks] = useState(initialTasks);
  const [schedule, setSchedule] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const key = `${year}-${month}`;

  useEffect(() => {
    // データ初期化シミュレーション
    const timer = setTimeout(() => {
      const generated = {
        [key]: generateScheduleForMonth(year, month, staff, initialShiftPatterns)
      };
      setSchedule(generated);
      setIsLoading(false);
    }, 600);
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

  if (isLoading) return <LoadingScreen message="シフト管理システムを準備中..." />;

  return (
    <div className="min-h-screen bg-[#FFFDFB] text-slate-800 p-4 font-sans selection:bg-[#F4B896]/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* モダンなヘッダー */}
        <header className="bg-gradient-to-br from-[#F4B896] to-[#E8A680] text-white rounded-[2rem] shadow-2xl p-8 flex flex-col md:flex-row justify-between items-center gap-6 border border-white/20">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tighter drop-shadow-sm flex items-center gap-3">
              digsy SMART SHIFT
              <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full font-normal tracking-widest uppercase border border-white/20">Pro</span>
            </h1>
            <p className="text-white/70 text-[10px] font-bold tracking-[0.2em] ml-1 uppercase">Cloud Management Console</p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/10 p-1.5 rounded-2xl backdrop-blur-xl border border-white/20 shadow-inner">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/10 rounded-xl">
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent font-black outline-none cursor-pointer text-sm">
                {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-slate-800 font-bold">{y}</option>)}
              </select>
              <span className="text-[10px] font-bold opacity-60">年</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/10 rounded-xl">
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent font-black outline-none cursor-pointer text-sm">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-slate-800 font-bold">{m}</option>)}
              </select>
              <span className="text-[10px] font-bold opacity-60">月</span>
            </div>
          </div>
        </header>

        <main className="space-y-10">
          {/* シフト管理表 */}
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-end mb-5 px-3">
                <h2 className="text-lg font-bold flex items-center gap-2.5 text-slate-700">
                  <span className="w-1.5 h-7 bg-[#F4B896] rounded-full shadow-[0_0_8px_#F4B896]"></span>
                  シフト管理マスター
                </h2>
                <div className="text-[9px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    LEFT-COLUMN PINNED MODE: ACTIVE
                </div>
            </div>
            <ShiftSchedule 
              schedule={schedule[key] || {}} 
              staff={staff} 
              days={days} 
              shiftPatterns={initialShiftPatterns}
              year={year} 
              month={month}
              onUpdateSchedule={() => {}}
            />
          </section>

          {/* 統計・カレンダーグリッド */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
            <div className="xl:col-span-2">
                <TaskShortageDisplay 
                  tasks={tasks} 
                  staff={staff} 
                  days={days} 
                  taskCountsByDay={taskCountsByDay} 
                />
            </div>
            <div className="xl:col-span-3">
                <MonthlyCalendar 
                  schedule={schedule}
                  staff={staff}
                  year={year}
                  month={month}
                />
            </div>
          </div>
        </main>

        <footer className="text-center py-12 border-t border-slate-100 text-slate-300 text-[9px] font-bold tracking-[0.3em] uppercase">
          &copy; 2026 DIGSY SMART SHIFT SYSTEM. ALL CHANGES ARE RECORDED.
        </footer>
      </div>
    </div>
  );
}
