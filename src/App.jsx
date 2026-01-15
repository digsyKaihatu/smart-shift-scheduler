import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * ==========================================
 * 1. 定数・初期データ
 * ==========================================
 */
const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'B', name: 'B', startTime: '9:00', endTime: '17:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'C', name: 'C', startTime: '9:00', endTime: '17:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'H', name: 'H', startTime: '9:00', endTime: '13:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'シフト休', name: '休', startTime: '-', endTime: '-', breakTime: '-', workHours: 0 }
];

const initialStaffData = [
  {
    id: 's1',
    name: '田中 太郎',
    role: 'リーダー',
    employeeId: '1001',
    email: 'tanaka@example.com',
    possibleTasks: ['t1', 't2'],
    defaultShift: { pattern: ['A', 'A', 'A', 'A', 'A'], hasBreakArray: [true, true, true, true, true] },
    shiftSubmitted: {},
    shiftRemanded: {},
    shiftApproved: {}
  },
  {
    id: 's2',
    name: '佐藤 花子',
    role: 'メンバー',
    employeeId: '1002',
    email: 'sato@example.com',
    possibleTasks: ['t2', 't3'],
    defaultShift: { pattern: ['I', 'I', 'I', 'I', 'I'], hasBreakArray: [true, true, true, true, true] },
    shiftSubmitted: {},
    shiftRemanded: {},
    shiftApproved: {}
  }
];

const initialTasks = [
  { id: 't1', name: '業務A', requiredPersonnel: 1 },
  { id: 't2', name: '業務B', requiredPersonnel: 1 },
  { id: 't3', name: '業務C', requiredPersonnel: 1 }
];

/**
 * ==========================================
 * 2. ユーティリティ
 * ==========================================
 */
const formatValue = (value) => {
  const mapping = { 'シフト休': '休', '欠勤': '欠', '有休': '有', '遅刻': '遅', '早退': '早' };
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (value && typeof value === 'object' && 'type' in value) {
    return mapping[value.type] || value.type;
  }
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

/**
 * ==========================================
 * 3. 共通コンポーネント
 * ==========================================
 */
const LoadingScreen = ({ message }) => (
  <div className="fixed inset-0 bg-white/90 flex flex-col items-center justify-center z-[100]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#F4B896]"></div>
    <p className="mt-4 font-bold text-slate-600">{message}</p>
  </div>
);

/**
 * ==========================================
 * 4. シフトスケジュール表 (固定列対応)
 * ==========================================
 */
const ShiftSchedule = ({ schedule, staff, days, shiftPatterns, year, month, onUpdateSchedule }) => {
  // 列の幅定義
  const colWidths = {
    role: 70,
    empId: 80,
    name: 110,
    setting: 150,
    check: 50,
    delete: 50
  };

  // Sticky位置の計算
  const stickyPos = {
    role: 0,
    empId: colWidths.role,
    name: colWidths.role + colWidths.empId,
    setting: colWidths.role + colWidths.empId + colWidths.name,
    submit: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting,
    remand: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check,
    approve: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check * 2,
    delete: colWidths.role + colWidths.empId + colWidths.name + colWidths.setting + colWidths.check * 3
  };

  const headerClass = "p-2 border border-slate-300 bg-slate-100 font-bold text-[10px] text-center sticky top-0 z-40";
  const fixedHeaderClass = (left) => `${headerClass} z-50`;
  const cellClass = "p-2 border border-slate-200 text-center bg-white h-12 flex items-center justify-center";
  const fixedCellClass = (left) => `p-2 border border-slate-200 bg-white sticky z-20 h-12 flex items-center justify-center font-medium overflow-hidden whitespace-nowrap`;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
      <div className="overflow-auto max-h-[65vh]">
        <table className="border-separate border-spacing-0 w-full text-[11px]">
          <thead>
            <tr>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.role, width: colWidths.role, minWidth: colWidths.role }}>役職</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.empId, width: colWidths.empId, minWidth: colWidths.empId }}>社員番号</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.name, width: colWidths.name, minWidth: colWidths.name }}>稼働名前</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.setting, width: colWidths.setting, minWidth: colWidths.setting }}>基本シフト設定</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.submit, width: colWidths.check, minWidth: colWidths.check }}>提出☑</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.remand, width: colWidths.check, minWidth: colWidths.check }}>差戻☑</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.approve, width: colWidths.check, minWidth: colWidths.check }}>承認☑</th>
              <th className={fixedHeaderClass()} style={{ left: stickyPos.delete, width: colWidths.delete, minWidth: colWidths.delete }}>削除</th>
              {days.map(d => (
                <th key={d.day} className={`${headerClass} min-w-[45px] ${d.dayOfWeek === '日' ? 'bg-red-50' : d.dayOfWeek === '土' ? 'bg-blue-50' : ''}`}>
                  <div>{d.day}</div>
                  <div className="scale-75 text-slate-500">{d.dayOfWeek}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}>
                <td className={fixedCellClass()} style={{ left: stickyPos.role }}>{s.role}</td>
                <td className={fixedCellClass()} style={{ left: stickyPos.empId }}>{s.employeeId}</td>
                <td className={fixedCellClass()} style={{ left: stickyPos.name, fontWeight: 'bold' }}>{s.name}</td>
                <td className={fixedCellClass()} style={{ left: stickyPos.setting }}>
                  <span className="text-[9px] leading-tight text-slate-500">
                    {summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray)}
                  </span>
                </td>
                <td className={fixedCellClass()} style={{ left: stickyPos.submit }}>
                   <input type="checkbox" checked={!!s.shiftSubmitted[`${year}-${month}`]} readOnly className="rounded border-slate-300" />
                </td>
                <td className={fixedCellClass()} style={{ left: stickyPos.remand }}>
                   <input type="checkbox" checked={!!s.shiftRemanded[`${year}-${month}`]} readOnly className="rounded border-slate-300" />
                </td>
                <td className={fixedCellClass()} style={{ left: stickyPos.approve }}>
                   <input type="checkbox" checked={!!s.shiftApproved[`${year}-${month}`]} readOnly className="rounded border-slate-300" />
                </td>
                <td className={fixedCellClass()} style={{ left: stickyPos.delete }}>
                   <button className="text-slate-300 hover:text-red-500"><DeleteIcon /></button>
                </td>
                {days.map(d => {
                  const val = schedule[s.id]?.[d.day] || '';
                  const isWeekend = d.dayOfWeek === '土' || d.dayOfWeek === '日';
                  return (
                    <td key={d.day} className={`p-0 border border-slate-200 text-center ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}>
                      <div className="h-12 flex items-center justify-center font-bold">
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
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-[#F4B896] rounded-full"></span>
        {year}年{month}月の出勤・休暇者
      </h2>
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 overflow-hidden rounded">
        {['日','月','火','水','木','金','土'].map(d => (
          <div key={d} className="bg-slate-100 text-center p-2 font-bold text-slate-500 text-xs">{d}</div>
        ))}
        {calendarDays.map(d => {
          const date = new Date(year, month-1, d);
          const dayOfWeek = date.getDay();
          const dayStaff = staff.map(s => {
            const val = schedule[key]?.[s.id]?.[d];
            if (val && val !== 'シフト休' && val !== '欠勤') return { name: s.name, status: 'work' };
            if (val === '欠勤') return { name: s.name, status: 'absent' };
            return null;
          }).filter(Boolean);

          return (
            <div key={d} className={`bg-white min-h-[100px] p-1.5 ${dayOfWeek === 0 ? 'bg-red-50/20' : dayOfWeek === 6 ? 'bg-blue-50/20' : ''}`}>
              <div className="text-[10px] font-bold text-slate-400 mb-1">{d}</div>
              <div className="flex flex-col gap-0.5">
                {dayStaff.map((s, i) => (
                  <div key={i} className={`text-[9px] px-1 py-0.5 rounded truncate font-medium ${s.status === 'work' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {s.name}
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
  <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span>
        業務一覧
    </h2>
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="p-2 text-left border border-slate-200">業務名</th>
            <th className="p-2 text-center border border-slate-200">定員</th>
            {days.slice(0, 15).map(d => (
              <th key={d.day} className="p-1 border border-slate-200 text-center min-w-[30px]">{d.day}</th>
            ))}
            <th className="p-2 border border-slate-200 text-slate-400 italic">以下略...</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id}>
              <td className="p-2 border border-slate-200 font-bold">{t.name}</td>
              <td className="p-2 border border-slate-200 text-center bg-slate-50">{t.requiredPersonnel}名</td>
              {days.slice(0, 15).map(d => {
                const count = taskCountsByDay[d.day]?.[t.id] || 0;
                const isShort = count < t.requiredPersonnel;
                return (
                  <td key={d.day} className={`p-1 border border-slate-200 text-center font-bold ${isShort ? 'text-red-600 bg-red-50' : 'text-slate-600'}`}>
                    {count}
                  </td>
                );
              })}
              <td className="border border-slate-200"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * ==========================================
 * 5. App 本体
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
    // データ読み込みシミュレーション
    const timer = setTimeout(() => {
      const initialSchedule = {
        [key]: {
            's1': { 1: 8, 2: 8, 3: 8, 4: 'シフト休', 5: 'シフト休', 6: 8, 7: 8, 8: 8, 9: 8, 10: 8 },
            's2': { 1: 8, 2: '欠勤', 3: 8, 4: 'シフト休', 5: 'シフト休', 6: 8, 7: 8, 8: 8, 9: 8, 10: 8 }
        }
      };
      setSchedule(initialSchedule);
      setIsLoading(false);
    }, 500);
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
    <div className="min-h-screen bg-[#FFFDFB] text-slate-800 p-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#F4B896] to-[#E8A680] text-white rounded-2xl shadow-xl p-6 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-black tracking-tighter">digsy SMART SHIFT</h1>
            <div className="flex items-center gap-2 bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent font-bold outline-none cursor-pointer">
                {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
              </select>
              <span>年</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent font-bold outline-none cursor-pointer">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m} className="text-slate-800">{m}</option>)}
              </select>
              <span>月</span>
            </div>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl text-sm font-bold">
             管理者パネル
          </div>
        </header>

        <main className="space-y-10">
          <section>
            <div className="flex justify-between items-end mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-[#F4B896] rounded-full"></span>
                  シフト管理表
                </h2>
                <div className="text-[10px] text-slate-400">※左側の基本情報は横スクロール時に固定されます</div>
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

        <footer className="text-center py-12 text-slate-400 text-[10px] tracking-widest">
          &copy; 2026 DIGSY SMART SHIFT SCHEDULER. 
        </footer>
      </div>
    </div>
  );
}
