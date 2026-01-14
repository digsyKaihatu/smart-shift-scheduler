import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth, toRelativeUrl } from '@okta/okta-auth-js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot } from 'firebase/firestore';

/**
 * -----------------------------------------------------------------------------
 * 1. 環境設定 & Firebase 初期化 (Rule 1, 3 遵守)
 * -----------------------------------------------------------------------------
 */

// グローバル変数から設定を取得
const appId = typeof __app_id !== 'undefined' ? __app_id : 'smart-shift-scheduler';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -----------------------------------------------------------------------------
// Constants & Utils
// -----------------------------------------------------------------------------

const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'T', name: 'T', startTime: '11:00', endTime: '20:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'V', name: 'V', startTime: '12:00', endTime: '20:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'シフト休', name: 'シフト休', startTime: '-', endTime: '-', breakTime: '-', workHours: 0 }
];

const formatValue = (value) => {
  const mapping = { 'シフト休': '休', '欠勤': '欠', '通休': '通', '有休': '有', '遅刻': '遅', '早退': '早' };
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (typeof value === 'string') return mapping[value] || value;
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    Object.entries(mapping).forEach(([full, short]) => { displayType = displayType.replace(full, short); });
    return `${displayType}${value.hours ? `(${value.hours})` : ''}`;
  }
  return '';
};

/**
 * -----------------------------------------------------------------------------
 * 2. コンポーネント (Icons & Editor)
 * -----------------------------------------------------------------------------
 */

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-600" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
  </svg>
);

const ShiftPatternEditor = ({ pattern, hasBreakArray, onApply, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempPattern, setTempPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [tempHasBreak, setTempHasBreak] = useState(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
  
  const DAY_NAMES = ['月', '火', '水', '木', '金'];

  const handleApply = () => {
    onApply(tempPattern, tempHasBreak);
    setIsOpen(false);
  };

  const summary = useMemo(() => {
    const lines = tempPattern.map((pId, i) => `${DAY_NAMES[i]}:${pId === 'シフト休' ? '休' : pId}${tempHasBreak[i] ? '' : '×'}`);
    return `${lines.slice(0,3).join(' ')}\n${lines.slice(3).join(' ')}`;
  }, [tempPattern, tempHasBreak]);

  return (
    <div className="h-full w-full">
      <button 
        onClick={() => !disabled && setIsOpen(true)} 
        disabled={disabled}
        className={`w-full h-full text-[9px] font-bold text-slate-600 leading-tight whitespace-pre-wrap p-1 rounded transition-colors ${disabled ? 'cursor-default' : 'hover:bg-slate-100'}`}
      >
        {summary}
      </button>
      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">基本シフト詳細設定</h3>
            <div className="space-y-3 mb-6">
              {DAY_NAMES.map((name, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-4 font-bold text-slate-400 text-xs">{name}</span>
                  <select 
                    value={tempPattern[i]} 
                    onChange={(e) => { const n = [...tempPattern]; n[i] = e.target.value; setTempPattern(n); }}
                    className="flex-grow p-1.5 text-xs border rounded bg-slate-50"
                  >
                    <option value="シフト休">シフト休</option>
                    {initialShiftPatterns.filter(p => p.id !== 'シフト休').map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.startTime}-{p.endTime})</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={tempHasBreak[i]} 
                        onChange={() => { const n = [...tempHasBreak]; n[i] = !n[i]; setTempHasBreak(n); }}
                        disabled={tempPattern[i] === 'シフト休'}
                        className="rounded text-sky-500"
                    />
                    <span className="text-[10px] text-slate-500">休憩</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-md">キャンセル</button>
              <button onClick={handleApply} className="px-4 py-2 text-xs font-bold text-white bg-sky-500 rounded-md shadow-md">適用</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/**
 * -----------------------------------------------------------------------------
 * 3. メインコンポーネント: ShiftSchedule (完全固定レイアウト)
 * -----------------------------------------------------------------------------
 */

const ShiftSchedule = ({ currentUser, isAdmin, schedule, staff, days, onUpdateSchedule, onApplyStaffPattern }) => {
  const scrollRef = useRef(null);

  // 固定列の幅定義
  const widths = { role: 55, empId: 85, name: 115, setting: 155, submit: 60, remand: 60, approve: 60, del: 40 };
  const pos = {
    role: 0,
    empId: widths.role,
    name: widths.role + widths.empId,
    setting: widths.role + widths.empId + widths.name,
    submit: widths.role + widths.empId + widths.name + widths.setting,
    remand: widths.role + widths.empId + widths.name + widths.setting + widths.submit,
    approve: widths.role + widths.empId + widths.name + widths.setting + widths.submit + widths.remand,
    del: widths.role + widths.empId + widths.name + widths.setting + widths.submit + widths.remand + widths.approve
  };

  const gridTemplateColumns = `${Object.values(widths).map(w => `${w}px`).join(' ')} repeat(${days.length}, 70px)`;

  const hBase = "sticky top-0 z-30 bg-slate-100 p-2 border-b-2 border-r border-slate-200 font-bold text-[10px] text-center flex flex-col items-center justify-center text-slate-500";
  const hFixed = "sticky top-0 z-50 bg-slate-100 p-2 border-b-2 border-r border-slate-200 font-bold text-[11px] text-center flex items-center justify-center text-slate-600";
  const cFixed = "sticky z-20 border-b border-r border-slate-200 flex items-center h-10 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <div className="grid relative" style={{ gridTemplateColumns }}>
          {/* 固定見出し */}
          <div className={hFixed} style={{ left: pos.role }}>役職</div>
          <div className={hFixed} style={{ left: pos.empId }}>社員番号</div>
          <div className={hFixed} style={{ left: pos.name }}>稼働名前</div>
          <div className={hFixed} style={{ left: pos.setting }}>基本シフト設定</div>
          <div className={hFixed} style={{ left: pos.submit }}>提出</div>
          <div className={hFixed} style={{ left: pos.remand }}>差戻</div>
          <div className={hFixed} style={{ left: pos.approve }}>承認</div>
          <div className={`${hFixed} border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.05)]`} style={{ left: pos.del }}>削除</div>
          
          {/* 日付見出し */}
          {days.map(({ day, dayOfWeek }) => (
            <div key={day} className={hBase}>
              <div className="text-[9px] opacity-70 mb-0.5">{dayOfWeek}</div>
              <div className="text-sm font-black">{day}</div>
            </div>
          ))}

          {/* データ行 */}
          {staff.map(s => {
            const isEditable = isAdmin || currentUser?.id === s.id;
            return (
              <React.Fragment key={s.id}>
                <div className={cFixed} style={{ left: pos.role }}><span className="w-full text-center text-[10px] truncate px-1">{s.role}</span></div>
                <div className={cFixed} style={{ left: pos.empId }}><span className="w-full text-center text-[10px] font-mono">{s.employeeId}</span></div>
                <div className={cFixed} style={{ left: pos.name }}><span className="w-full text-center text-xs font-bold">{s.name}</span></div>
                <div className={cFixed} style={{ left: pos.setting }}>
                  <ShiftPatternEditor pattern={s.defaultShift.pattern} hasBreakArray={s.defaultShift.hasBreakArray} onApply={(p, b) => onApplyStaffPattern(s.id, p, b)} disabled={!isEditable} />
                </div>
                <div className={cFixed} style={{ left: pos.submit }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.shiftSubmitted} disabled={!isEditable} className="rounded text-sky-500" readOnly /></div></div>
                <div className={cFixed} style={{ left: pos.remand }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.shiftRemanded} disabled={!isAdmin} className="rounded text-red-500" readOnly /></div></div>
                <div className={cFixed} style={{ left: pos.approve }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.shiftApproved} disabled={!isAdmin} className="rounded text-green-500" readOnly /></div></div>
                <div className={`${cFixed} border-r-2 shadow-[2px_0_4px_rgba(0,0,0,0.05)]`} style={{ left: pos.del }}>
                    <div className="w-full flex justify-center">{isAdmin && <button className="p-1 hover:bg-red-50 rounded-full transition-colors"><DeleteIcon /></button>}</div>
                </div>

                {/* 日付セル */}
                {days.map(({ day }) => (
                  <EditableCell 
                    key={day} 
                    value={schedule[s.id]?.[day] ?? ''} 
                    onUpdate={(val) => onUpdateSchedule(s.id, day, val)} 
                    disabled={!isEditable}
                    borderClass="border-slate-100"
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TaskShortageDisplay = ({ tasks, staff, days, schedule }) => {
  const taskCounts = useMemo(() => {
    const counts = {};
    days.forEach(({day}) => {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const val = schedule[s.id]?.[day];
        if (typeof val === 'number' && val > 0) {
            s.possibleTasks?.forEach(tId => { if(counts[day][tId] !== undefined) counts[day][tId]++; });
        }
      });
    });
    return counts;
  }, [tasks, staff, days, schedule]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 border border-slate-200">
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-orange-400 rounded-full"></span>業務稼働状況
      </h2>
      <div className="overflow-x-auto flex border rounded-lg">
        <div className="flex-shrink-0 bg-slate-50 border-r-2 border-slate-200 w-[180px]">
          <div className="h-10 border-b border-slate-200 flex items-center px-4 text-xs font-bold text-slate-500">業務名 / 定員</div>
          {tasks.map(t => (
            <div key={t.id} className="h-12 border-b border-slate-200 flex flex-col justify-center px-4 bg-white">
              <div className="text-xs font-bold text-slate-700 truncate">{t.name}</div>
              <div className="text-[10px] text-slate-400 font-bold">必要: {t.requiredPersonnel}名</div>
            </div>
          ))}
        </div>
        <div className="flex-grow overflow-x-auto">
          <div className="flex">
            {days.map(({ day, dayOfWeek }) => (
              <div key={day} className="min-w-[60px] flex-shrink-0">
                <div className="h-10 border-b border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center">
                   <span className="text-[9px] opacity-60 font-bold">{dayOfWeek}</span>
                   <span className="text-xs font-black text-slate-600">{day}</span>
                </div>
                {tasks.map(t => {
                   const count = taskCounts[day]?.[t.id] || 0;
                   const isShort = count < t.requiredPersonnel && !['土','日'].includes(dayOfWeek);
                   return (
                     <div key={`${t.id}-${day}`} className={`h-12 border-b border-r border-slate-50 flex items-center justify-center text-sm font-black ${isShort ? 'bg-red-50 text-red-500' : 'bg-white text-slate-700'}`}>
                       {count}
                     </div>
                   );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * -----------------------------------------------------------------------------
 * 4. Main Application
 * -----------------------------------------------------------------------------
 */

const MainContent = () => {
  const { authState } = useOktaAuth();
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [isReady, setIsReady] = useState(false);

  // Firestore パスの設定 (Rule 1)
  const publicPath = `artifacts/${appId}/public/data`;

  useEffect(() => {
    const init = async () => {
      // Rule 3: Auth first
      if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
      else await signInAnonymously(auth);

      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
            // データ購読
            const staffRef = collection(db, publicPath, 'staff');
            onSnapshot(staffRef, (snap) => setStaff(snap.docs.map(d => ({id: d.id, ...d.data()}))), (err) => console.error("Staff fetch error:", err));
            
            const tasksRef = collection(db, publicPath, 'tasks');
            onSnapshot(tasksRef, (snap) => setTasks(snap.docs.map(d => ({id: d.id, ...d.data()}))), (err) => console.error("Tasks fetch error:", err));
            
            const schedRef = doc(db, publicPath, `schedule_${year}_${month}`);
            onSnapshot(schedRef, (snap) => setSchedule(snap.data() || {}), (err) => console.error("Schedule fetch error:", err));
            
            setIsReady(true);
        }
      });
    };
    init();
  }, [year, month]);

  const days = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    return Array.from({length: lastDay}, (_, i) => {
      const d = i + 1;
      const date = new Date(year, month - 1, d);
      return { day: d, dayOfWeek: ['日','月','火','水','木','金','土'][date.getDay()] };
    });
  }, [year, month]);

  const onUpdateSchedule = async (staffId, day, value) => {
    if (!user) return;
    const newSchedule = { ...schedule, [staffId]: { ...(schedule[staffId] || {}), [day]: value } };
    setSchedule(newSchedule);
    await setDoc(doc(db, publicPath, `schedule_${year}_${month}`), newSchedule);
  };

  const onApplyStaffPattern = async (staffId, newPattern, hasBreakArray) => {
    if (!user) return;
    const staffMember = staff.find(s => s.id === staffId);
    if (!staffMember) return;

    // スタッフのデフォルトパターンを更新
    await setDoc(doc(db, publicPath, 'staff', staffId), {
        ...staffMember,
        defaultShift: { pattern: newPattern, hasBreakArray }
    });

    // スケジュールに展開
    const staffSched = {};
    days.forEach(({day, dayOfWeek}) => {
        if (['土','日'].includes(dayOfWeek)) staffSched[day] = 'シフト休';
        else {
            const idx = ['月','火','水','木','金'].indexOf(dayOfWeek);
            if (idx === -1 || newPattern[idx] === 'シフト休') staffSched[day] = 'シフト休';
            else {
                const p = initialShiftPatterns.find(x => x.id === newPattern[idx]);
                if (p) staffSched[day] = hasBreakArray[idx] ? p.workHours : (p.workHours + 1);
            }
        }
    });
    const newSchedule = { ...schedule, [staffId]: staffSched };
    setSchedule(newSchedule);
    await setDoc(doc(db, publicPath, `schedule_${year}_${month}`), newSchedule);
  };

  if (!isReady) return <div className="h-screen flex items-center justify-center font-bold text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFF9F6] p-4 sm:p-6 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        <header className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-slate-50 rounded-xl px-4 py-2 border border-slate-100 shadow-inner">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none font-bold text-slate-700 text-2xl outline-none">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-sm font-bold text-slate-400 mx-1">年</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none font-bold text-slate-700 text-2xl outline-none ml-2">
                  {Array.from({length:12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <span className="text-sm font-bold text-slate-400 mx-1">月</span>
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-800">digsy SHIFT</h1>
          </div>
          <div className="text-xs font-bold text-slate-300">AUTO-SAVED TO CLOUD</div>
        </header>

        <ShiftSchedule 
          currentUser={staff.find(s => s.email === user?.email)}
          isAdmin={true} // 実際はメールアドレス等で判定
          schedule={schedule}
          staff={staff}
          days={days}
          onUpdateSchedule={onUpdateSchedule}
          onApplyStaffPattern={onApplyStaffPattern}
        />

        <TaskShortageDisplay 
          tasks={tasks}
          staff={staff}
          days={days}
          schedule={schedule}
        />
      </div>
    </div>
  );
};

const App = () => {
  const navigate = useNavigate();
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    navigate(toRelativeUrl(originalUri || '/', window.location.origin));
  };

  // Oktaの設定 (デモ用ダミー)
  const oktaAuth = new OktaAuth({
    issuer: 'https://dev-000000.okta.com/oauth2/default',
    clientId: '0oa00000000000000000',
    redirectUri: window.location.origin + '/login/callback',
  });

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
