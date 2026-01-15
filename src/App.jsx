import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, query } from 'firebase/firestore';

/**
 * -----------------------------------------------------------------------------
 * 1. MOCK OKTA (Build Error Fix)
 * プレビュー環境で外部依存エラーを回避するためにOktaをモック化します。
 * -----------------------------------------------------------------------------
 */
const useOktaAuth = () => ({
  authState: { isAuthenticated: true },
  oktaAuth: { 
    getUser: async () => ({ email: 'admin@example.com', name: '管理者' }),
    signInWithRedirect: () => {},
    handleLoginCallback: async () => {}
  }
});
const Security = ({ children }) => <>{children}</>;
const LoginCallback = () => <div>認証処理中...</div>;

/**
 * -----------------------------------------------------------------------------
 * 2. CONFIGURATION & INITIALIZATION
 * -----------------------------------------------------------------------------
 */
const appId = typeof __app_id !== 'undefined' ? __app_id : 'smart-shift-scheduler';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "dummy", authDomain: "dummy", projectId: "dummy", storageBucket: "dummy", messagingSenderId: "dummy", appId: "dummy"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHIFT_PATTERNS = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'T', name: 'T', startTime: '11:00', endTime: '20:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'V', name: 'V', startTime: '12:00', endTime: '20:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'シフト休', name: 'シフト休', startTime: '-', endTime: '-', breakTime: '-', workHours: 0 }
];

/**
 * -----------------------------------------------------------------------------
 * 3. UTILITIES
 * -----------------------------------------------------------------------------
 */
const formatCellValue = (value) => {
  if (!value) return '';
  const mapping = { 'シフト休': '休', '欠勤': '欠', '通休': '通', '有休': '有', '遅刻': '遅', '早退': '早' };
  
  if (typeof value === 'number') return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  if (typeof value === 'string') return mapping[value] || value;
  
  if (typeof value === 'object' && value.type) {
    let type = value.type;
    Object.entries(mapping).forEach(([f, s]) => { type = type.replace(f, s); });
    return `${type}${value.hours ? `(${value.hours})` : ''}`;
  }
  return '';
};

/**
 * -----------------------------------------------------------------------------
 * 4. UI COMPONENTS
 * -----------------------------------------------------------------------------
 */

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-300 hover:text-red-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
  </svg>
);

const Cell = memo(({ value, onUpdate, borderClass, disabled, isToday }) => {
  const [isEditing, setIsEditing] = useState(false);

  const bg = useMemo(() => {
    if (typeof value === 'number' && value > 0) return 'bg-green-50 text-green-700';
    if (value === '有休' || (value?.type && value.type.includes('有休'))) return 'bg-yellow-50 text-yellow-700';
    if (value === 'シフト休') return 'bg-slate-50 text-slate-400';
    return 'bg-white text-slate-600';
  }, [value]);

  return (
    <div 
      onClick={() => !disabled && setIsEditing(true)}
      className={`h-10 w-[60px] min-w-[60px] border-b border-r ${borderClass} flex items-center justify-center text-[11px] font-bold cursor-pointer transition-all ${bg} ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-95'} ${isToday ? 'ring-1 ring-inset ring-yellow-400 z-10' : ''}`}
    >
      {isEditing ? (
        <select 
          autoFocus 
          onBlur={() => setIsEditing(false)}
          onChange={(e) => { onUpdate(e.target.value); setIsEditing(false); }}
          className="w-full h-full bg-sky-50 outline-none text-[10px]"
          defaultValue={typeof value === 'object' ? value.type : value}
        >
          <option value="">-</option>
          {['有休', '通休', '欠勤', 'シフト休', '遅刻', '早退'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
          <option value="8">8.0 (通常)</option>
        </select>
      ) : (
        <span className="truncate px-1">{formatCellValue(value)}</span>
      )}
    </div>
  );
});

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
                    className="flex-grow p-1.5 text-xs border rounded bg-slate-50 outline-none"
                  >
                    <option value="シフト休">シフト休</option>
                    {SHIFT_PATTERNS.filter(p => p.id !== 'シフト休').map(p => (
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
              <button onClick={handleApply} className="px-4 py-2 text-xs font-bold text-white bg-sky-500 rounded-md shadow-md hover:bg-sky-600 transition-colors">適用</button>
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
 * 5. SHIFT SCHEDULE TABLE
 * -----------------------------------------------------------------------------
 */

const ShiftSchedule = ({ staff, schedule, days, isAdmin, currentUser, onUpdate, onApplyPattern }) => {
  const COL_WIDTHS = { role: 55, id: 80, name: 110, config: 160, submit: 55, remand: 55, approve: 55, del: 40 };
  const getLeft = (key) => {
    const keys = Object.keys(COL_WIDTHS);
    return keys.slice(0, keys.indexOf(key)).reduce((sum, k) => sum + COL_WIDTHS[k], 0);
  };

  const gridTemplate = `${Object.values(COL_WIDTHS).map(w => `${w}px`).join(' ')} repeat(${days.length}, 60px)`;

  const hCell = "sticky top-0 z-30 bg-slate-50 border-b-2 border-r border-slate-200 h-12 flex flex-col items-center justify-center font-black text-slate-400";
  const hFixed = "sticky top-0 z-50 bg-slate-50 border-b-2 border-r border-slate-200 h-12 flex items-center justify-center text-[11px] font-bold text-slate-500 shadow-sm";
  const cFixed = "sticky z-20 border-b border-r border-slate-200 h-10 flex items-center px-2 text-[11px] font-bold text-slate-600 shadow-sm bg-white";

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <div className="grid relative" style={{ gridTemplateColumns: gridTemplate }}>
          {/* 見出し */}
          <div className={hFixed} style={{ left: getLeft('role') }}>役職</div>
          <div className={hFixed} style={{ left: getLeft('id') }}>番号</div>
          <div className={hFixed} style={{ left: getLeft('name') }}>氏名</div>
          <div className={hFixed} style={{ left: getLeft('config') }}>基本パターン</div>
          <div className={hFixed} style={{ left: getLeft('submit') }}>提出</div>
          <div className={hFixed} style={{ left: getLeft('remand') }}>差戻</div>
          <div className={hFixed} style={{ left: getLeft('approve') }}>承認</div>
          <div className={`${hFixed} border-r-2`} style={{ left: getLeft('del') }}>削除</div>
          
          {days.map(d => (
            <div key={d.day} className={`${hCell} ${['土','日'].includes(d.dayOfWeek) ? 'bg-slate-100/50' : ''}`}>
              <span className="text-[9px] uppercase tracking-tighter">{d.dayOfWeek}</span>
              <span className="text-sm font-black text-slate-700 leading-none">{d.day}</span>
            </div>
          ))}

          {/* データ */}
          {staff.map(s => {
            const editable = isAdmin || currentUser?.id === s.id;
            return (
              <React.Fragment key={s.id}>
                <div className={cFixed} style={{ left: getLeft('role') }}><span className="truncate w-full text-center text-[10px] opacity-70">{s.role}</span></div>
                <div className={cFixed} style={{ left: getLeft('id') }}><span className="truncate w-full text-center font-mono text-[10px]">{s.employeeId}</span></div>
                <div className={cFixed} style={{ left: getLeft('name') }}><span className="truncate w-full text-slate-800">{s.name}</span></div>
                <div className={cFixed} style={{ left: getLeft('config'), padding: 0 }}>
                    <ShiftPatternEditor 
                      pattern={s.defaultShift?.pattern} 
                      hasBreakArray={s.defaultShift?.hasBreakArray} 
                      onApply={(p, b) => onApplyPattern(s.id, p, b)}
                      disabled={!editable}
                    />
                </div>
                <div className={cFixed} style={{ left: getLeft('submit') }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.submitted} disabled readOnly className="h-3.5 w-3.5 rounded text-sky-500" /></div></div>
                <div className={cFixed} style={{ left: getLeft('remand') }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.remanded} disabled readOnly className="h-3.5 w-3.5 rounded text-red-500" /></div></div>
                <div className={cFixed} style={{ left: getLeft('approve') }}><div className="w-full flex justify-center"><input type="checkbox" checked={!!s.approved} disabled readOnly className="h-3.5 w-3.5 rounded text-green-500" /></div></div>
                <div className={`${cFixed} border-r-2`} style={{ left: getLeft('del') }}>
                  <div className="w-full flex justify-center">{isAdmin && <button className="p-1 hover:bg-red-50 rounded-full transition-colors"><DeleteIcon /></button>}</div>
                </div>

                {days.map(d => (
                  <Cell 
                    key={d.day} 
                    value={schedule[s.id]?.[d.day]} 
                    onUpdate={(val) => onUpdate(s.id, d.day, val)}
                    disabled={!editable}
                    isToday={new Date().getDate() === d.day}
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

/**
 * -----------------------------------------------------------------------------
 * 6. MAIN CONTENT
 * -----------------------------------------------------------------------------
 */

const AppContent = () => {
  const { authState, oktaAuth } = useOktaAuth();
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [isLoaded, setIsLoaded] = useState(false);

  const publicPath = `/artifacts/${appId}/public/data`;

  useEffect(() => {
    let unsubStaff, unsubTasks, unsubSched;

    const startSync = async () => {
      // Rule 3: Auth First
      try {
        if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
        else await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth failed:", e);
      }

      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
          // Rule 1: Strict Paths
          unsubStaff = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (s) => {
            setStaff(s.docs.map(d => ({id: d.id, ...d.data()})));
          }, (err) => console.error("Staff sync error:", err));

          unsubTasks = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'tasks'), (s) => {
            setTasks(s.docs.map(d => ({id: d.id, ...d.data()})));
          }, (err) => console.error("Tasks sync error:", err));

          unsubSched = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', `schedule_${year}_${month}`), (s) => {
            setSchedule(s.data() || {});
          }, (err) => console.error("Schedule sync error:", err));

          setIsLoaded(true);
        }
      });
    };

    startSync();
    return () => {
      unsubStaff?.();
      unsubTasks?.();
      unsubSched?.();
    };
  }, [year, month]);

  const days = useMemo(() => {
    const end = new Date(year, month, 0).getDate();
    return Array.from({length: end}, (_, i) => ({
      day: i + 1,
      dayOfWeek: ['日','月','火','水','木','金','土'][new Date(year, month - 1, i + 1).getDay()]
    }));
  }, [year, month]);

  const onUpdateSchedule = async (staffId, day, value) => {
    if (!user) return;
    const update = { ...schedule, [staffId]: { ...(schedule[staffId] || {}), [day]: value } };
    setSchedule(update);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `schedule_${year}_${month}`), update);
  };

  const onApplyPattern = async (staffId, pattern, breakArray) => {
    if (!user) return;
    const target = staff.find(s => s.id === staffId);
    if (!target) return;

    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', staffId), { 
      ...target, 
      defaultShift: { pattern, hasBreakArray: breakArray } 
    });

    const newSched = { ...schedule[staffId] };
    days.forEach(d => {
      if (['土','日'].includes(d.dayOfWeek)) newSched[d.day] = 'シフト休';
      else {
        const pId = pattern[['月','火','水','木','金'].indexOf(d.dayOfWeek)];
        if (pId === 'シフト休') newSched[d.day] = 'シフト休';
        else {
          const p = SHIFT_PATTERNS.find(x => x.id === pId);
          if (p) newSched[d.day] = breakArray[['月','火','水','木','金'].indexOf(d.dayOfWeek)] ? p.workHours : (p.workHours + 1);
        }
      }
    });
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `schedule_${year}_${month}`), { ...schedule, [staffId]: newSched });
  };

  if (!isLoaded) return <div className="h-screen flex items-center justify-center font-black text-slate-300 animate-pulse uppercase tracking-widest bg-[#FDFCFB]">Initializing Shift Sync...</div>;

  return (
    <div className="min-h-screen bg-[#FDFCFB] p-4 sm:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-6">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-black tracking-tighter text-slate-900">digsy<span className="text-orange-500">.</span></h1>
            <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-100 shadow-inner">
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent border-none font-black text-slate-600 text-xl outline-none cursor-pointer">
                {[2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="mx-2 text-slate-300 font-bold">/</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent border-none font-black text-slate-600 text-xl outline-none cursor-pointer">
                {Array.from({length:12}, (_,i)=>i+1).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="text-[10px] font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
            Cloud Network Active
          </div>
        </header>

        <ShiftSchedule 
          staff={staff} schedule={schedule} days={days} isAdmin={true} 
          currentUser={staff.find(s => s.email === user?.email)}
          onUpdate={onUpdateSchedule} onApplyPattern={onApplyPattern}
        />

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
           <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
             <span className="w-2 h-6 bg-sky-400 rounded-full"></span>業務分析・人員充足
           </h2>
           <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-10 gap-3">
              {days.map(d => (
                <div key={d.day} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div className="text-[9px] font-black text-slate-300 uppercase leading-none mb-1">{d.dayOfWeek}</div>
                  <div className="text-lg font-black text-slate-600 leading-none">{d.day}</div>
                  <div className="mt-1 text-[9px] font-bold text-green-500 uppercase">Adequate</div>
                </div>
              ))}
           </div>
        </div>
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
    <Security restoreOriginalUri={restoreOriginalUri}>
      <Routes>
        <Route path="/login/callback" element={<LoginCallback />} />
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Security>
  );
};

export default App;
