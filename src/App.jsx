import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, Users, Settings, Save, ChevronLeft, ChevronRight, 
  Plus, Trash2, Moon, Sun, FileDown, AlertCircle, RefreshCw,
  Check, X, Briefcase, Clock, Shield
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  writeBatch,
  query,
  where,
  Timestamp 
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Types ---
interface Staff {
  id: string;
  name: string;
  roles: string[];
  maxNightShifts?: number;
  isActive: boolean;
}

interface ShiftPattern {
  id: string;
  label: string;
  code: string;
  color: string;
  textColor: string;
  timeRange: string;
  isNightShift: boolean;
  isOff: boolean;
}

interface DaySchedule {
  date: string; // YYYY-MM-DD
  shifts: { [staffId: string]: string }; // staffId -> patternId
  note?: string;
}

interface AppConfig {
  title: string;
  startDayOfMonth: number; // 締め日またぎ用（1なら通常月）
}

// --- Default Data ---
const DEFAULT_PATTERNS: ShiftPattern[] = [
  { id: 'day', label: '日勤', code: '日', color: '#E3F2FD', textColor: '#1565C0', timeRange: '9:00-18:00', isNightShift: false, isOff: false },
  { id: 'early', label: '早番', code: '早', color: '#FFF3E0', textColor: '#E65100', timeRange: '7:00-16:00', isNightShift: false, isOff: false },
  { id: 'late', label: '遅番', code: '遅', color: '#F3E5F5', textColor: '#7B1FA2', timeRange: '11:00-20:00', isNightShift: false, isOff: false },
  { id: 'night', label: '夜勤', code: '夜', color: '#E8EAF6', textColor: '#283593', timeRange: '16:30-9:30', isNightShift: true, isOff: false },
  { id: 'off', label: '公休', code: '公', color: '#FFEBEE', textColor: '#C62828', timeRange: '', isNightShift: false, isOff: true },
];

// --- Helper Functions ---
const formatDate = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getDaysInMonth = (year: number, month: number): Date[] => {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

// --- Main Component ---
export default function ShiftScheduler() {
  // State: Auth & Loading
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("システム起動中...");
  const [error, setError] = useState<string | null>(null);

  // State: Data
  const [staff, setStaff] = useState<Staff[]>([]);
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [schedules, setSchedules] = useState<{ [date: string]: DaySchedule }>({});
  const [config, setConfig] = useState<AppConfig>({ title: 'シフト管理表', startDayOfMonth: 1 });

  // State: UI
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'table' | 'staff' | 'patterns' | 'settings'>('table');
  const [selectedCell, setSelectedCell] = useState<{ staffId: string, date: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // --- Auth Initialization ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoadingMessage("認証情報を確認中...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
        setError("認証に失敗しました。再読み込みしてください。");
        setIsLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- Data Loading ---
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Checking for patterns collection...');
      setLoadingMessage("シフトパターンを読み込み中...");
      const patternsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'patterns');
      const patternsSnap = await getDocs(patternsRef);
      
      let loadedPatterns: ShiftPattern[] = [];
      if (patternsSnap.empty) {
        console.log('No patterns found. Using defaults.');
        loadedPatterns = DEFAULT_PATTERNS;
        // Save defaults silently
        const batch = writeBatch(db);
        DEFAULT_PATTERNS.forEach(p => {
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'patterns', p.id);
          batch.set(docRef, p);
        });
        await batch.commit();
      } else {
        loadedPatterns = patternsSnap.docs.map(d => d.data() as ShiftPattern);
        console.log(`Current patterns count: ${loadedPatterns.length}`);
      }
      setPatterns(loadedPatterns);

      console.log('Starting parallel data fetch...');
      setLoadingMessage("スタッフとスケジュールを読み込み中...");
      
      const [staffSnap, configSnap, schedulesSnap] = await Promise.all([
        getDocs(collection(db, 'artifacts', appId, 'users', user.uid, 'staff')),
        getDocs(collection(db, 'artifacts', appId, 'users', user.uid, 'config')),
        getDocs(query(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'))) 
        // Note: Fetching all schedules for now. In a real app, date range query is better.
      ]);

      console.log('Fetch complete. Processing data...');

      const loadedStaff = staffSnap.docs.map(d => d.data() as Staff);
      console.log(`Loaded ${loadedStaff.length} staff members.`);
      setStaff(loadedStaff);

      if (!configSnap.empty) {
        setConfig(configSnap.docs[0].data() as AppConfig);
        console.log('Loaded config.');
      }

      const loadedSchedules: { [date: string]: DaySchedule } = {};
      schedulesSnap.forEach(doc => {
        const data = doc.data() as DaySchedule;
        loadedSchedules[data.date] = data;
      });
      console.log(`Loaded ${Object.keys(loadedSchedules).length} days of schedule.`);
      setSchedules(loadedSchedules);

      console.log('Data load sequence finished successfully.');
    } catch (err) {
      console.error("Data load error:", err);
      setError("データの読み込み中にエラーが発生しました。");
    } finally {
      console.log('Disabling loading state...');
      setLoadingMessage("");
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // --- Actions ---

  const handleSaveSchedule = async (date: string, staffId: string, patternId: string) => {
    if (!user) return;
    
    // Optimistic Update
    setSchedules(prev => {
      const daySchedule = prev[date] || { date, shifts: {} };
      return {
        ...prev,
        [date]: {
          ...daySchedule,
          shifts: { ...daySchedule.shifts, [staffId]: patternId }
        }
      };
    });

    try {
      // Debouncing could be added here, but direct save for simplicity
      const dayRef = doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', date);
      // We need to get the latest state or merge. 
      // For simplicity, we'll reconstruct the day object from state (risky if rapid concurrent edits, but okay for single user)
      // Better: Update specific field via dot notation if possible, but Firestore maps are tricky with dynamic keys.
      // So we will just setMerge.
      
      const newShifts = { ...schedules[date]?.shifts, [staffId]: patternId };
      await setDoc(dayRef, { date, shifts: newShifts }, { merge: true });
      
    } catch (err) {
      console.error("Save failed:", err);
      // Revert logic would go here
    }
  };

  const handleAddStaff = async (name: string) => {
    if (!user || !name.trim()) return;
    const newStaff: Staff = {
      id: crypto.randomUUID(),
      name: name.trim(),
      roles: [],
      isActive: true
    };
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'staff', newStaff.id), newStaff);
      setStaff(prev => [...prev, newStaff]);
      setViewMode('table'); // Go back to table if this was the first staff
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!user) return;
    if (!window.confirm("このスタッフを削除してもよろしいですか？過去のシフトデータは残りますが、表示されなくなる可能性があります。")) return;
    try {
      // In Firestore, we just delete the staff doc. 
      // Real app might want soft-delete (isActive: false).
      // Let's do soft delete logic or hard delete? Let's do hard delete for now to match UI state.
      // await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'staff', id)); 
      
      // Update local first
      setStaff(prev => prev.filter(s => s.id !== id));
      
      // Then remote
      const batch = writeBatch(db);
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'staff', id);
      batch.delete(docRef);
      await batch.commit();

    } catch (err) {
      console.error(err);
    }
  };

  // --- Rendering Helpers ---
  const currentMonthDays = useMemo(() => {
    return getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  const getShiftPattern = (id: string) => patterns.find(p => p.id === id);

  // --- Render Components ---

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">エラーが発生しました</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-slate-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          <Briefcase className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-blue-600 w-8 h-8" />
        </div>
        <p className="text-slate-600 font-medium animate-pulse">{loadingMessage}</p>
        <div className="mt-4 text-xs text-slate-400 font-mono">
           {/* Debug output to visualize progress */}
           Patterns: {patterns.length > 0 ? 'OK' : '...'} | Staff: {staff.length}
        </div>
      </div>
    );
  }

  // ★ CRITICAL FIX: Empty State Handling ★
  // スタッフが0人の場合に、いきなりテーブルを描画しようとすると落ちる可能性が高い。
  // ここでEmpty Stateを挟むことで、レンダリングエラーを回避する。
  if (staff.length === 0 && viewMode === 'table') {
    return (
      <div className="flex h-screen w-full bg-slate-50 items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="bg-blue-600 p-6 text-white text-center">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-90" />
            <h1 className="text-2xl font-bold">ようこそ！</h1>
            <p className="opacity-90 mt-2">まずはスタッフを登録して、シフト作成を始めましょう。</p>
          </div>
          <div className="p-8">
            <div className="space-y-4">
              <p className="text-gray-600 text-sm mb-4">
                まだスタッフが登録されていません。最初のスタッフを追加してください。
                （例：山田 太郎、佐藤 花子など）
              </p>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem('staffName') as HTMLInputElement;
                  handleAddStaff(input.value);
                }}
                className="flex gap-2"
              >
                <input 
                  type="text" 
                  name="staffName"
                  placeholder="スタッフ名を入力" 
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isSaving ? '登録中...' : '登録して開始'}
                </button>
              </form>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center">
               <button 
                 onClick={() => {
                    // デモデータ投入ロジック（簡易版）
                    ["山田 太郎", "鈴木 一郎", "佐藤 花子"].forEach(name => handleAddStaff(name));
                 }}
                 className="text-sm text-slate-500 hover:text-blue-600 underline"
               >
                 デモデータ（3名）を一括登録して試す
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 shadow-xl z-20`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          {sidebarOpen && <span className="font-bold text-white tracking-wider">SHIFT APP</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg">
            {sidebarOpen ? <ChevronLeft size={20}/> : <ChevronRight size={20}/>}
          </button>
        </div>
        
        <nav className="flex-1 py-6 space-y-2 px-3">
          <NavButton 
            active={viewMode === 'table'} 
            onClick={() => setViewMode('table')} 
            icon={<Calendar size={20}/>} 
            label="シフト表" 
            expanded={sidebarOpen}
          />
          <NavButton 
            active={viewMode === 'staff'} 
            onClick={() => setViewMode('staff')} 
            icon={<Users size={20}/>} 
            label="スタッフ管理" 
            expanded={sidebarOpen}
          />
          <NavButton 
            active={viewMode === 'patterns'} 
            onClick={() => setViewMode('patterns')} 
            icon={<Clock size={20}/>} 
            label="シフトパターン" 
            expanded={sidebarOpen}
          />
          <NavButton 
            active={viewMode === 'settings'} 
            onClick={() => setViewMode('settings')} 
            icon={<Settings size={20}/>} 
            label="設定" 
            expanded={sidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {user?.isAnonymous ? 'AN' : 'US'}
            </div>
            {sidebarOpen && (
              <div className="text-xs overflow-hidden">
                <p className="text-white truncate">User ID</p>
                <p className="text-slate-500 truncate w-32">{user?.uid}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">
              {viewMode === 'table' && (
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronLeft size={24}/>
                  </button>
                  <span>{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronRight size={24}/>
                  </button>
                </div>
              )}
              {viewMode === 'staff' && 'スタッフ管理'}
              {viewMode === 'patterns' && 'シフトパターン設定'}
              {viewMode === 'settings' && '全体設定'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full" title="データを再読み込み">
               <RefreshCw size={20} />
             </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto bg-slate-100 p-6">
          
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-full">
               {/* Shift Table Implementation 
                  Using CSS Grid for sticky headers
               */}
               <div className="overflow-auto flex-1 relative">
                 <table className="w-full border-collapse text-sm">
                   <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                     <tr>
                       <th className="sticky left-0 z-20 bg-slate-50 p-3 border-b border-r border-slate-200 w-40 min-w-[160px] text-left font-semibold text-slate-600">
                         スタッフ / 日付
                       </th>
                       {currentMonthDays.map((date) => {
                         const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                         return (
                           <th key={date.toISOString()} className={`p-2 border-b border-slate-200 min-w-[40px] text-center font-medium ${isWeekend ? 'bg-orange-50 text-orange-800' : 'text-slate-600'}`}>
                             <div className="flex flex-col items-center">
                               <span>{date.getDate()}</span>
                               <span className="text-xs opacity-70">
                                 {['日','月','火','水','木','金','土'][date.getDay()]}
                               </span>
                             </div>
                           </th>
                         );
                       })}
                     </tr>
                   </thead>
                   <tbody>
                     {staff.map((s) => (
                       <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                         <td className="sticky left-0 z-10 bg-white p-3 border-b border-r border-slate-200 font-medium text-slate-700 truncate shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                           {s.name}
                         </td>
                         {currentMonthDays.map((date) => {
                           const dateKey = formatDate(date);
                           const shiftId = schedules[dateKey]?.shifts?.[s.id];
                           const pattern = shiftId ? getShiftPattern(shiftId) : null;
                           const isSelected = selectedCell?.staffId === s.id && selectedCell?.date === dateKey;

                           return (
                             <td 
                               key={dateKey} 
                               className={`border-b border-slate-200 relative p-0 h-12 cursor-pointer
                                 ${isSelected ? 'ring-2 ring-blue-500 z-10' : ''}
                               `}
                               onClick={() => setSelectedCell({ staffId: s.id, date: dateKey })}
                             >
                               <div className="w-full h-full flex items-center justify-center">
                                 {pattern ? (
                                   <div 
                                     className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                                     style={{ backgroundColor: pattern.color, color: pattern.textColor }}
                                   >
                                     {pattern.code}
                                   </div>
                                 ) : (
                                   <div className="w-2 h-2 rounded-full bg-slate-200 opacity-50 group-hover:opacity-100"></div>
                                 )}
                               </div>
                               
                               {/* Quick Selector Popup */}
                               {isSelected && (
                                 <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white p-2 rounded-xl shadow-2xl border border-slate-100 z-50 w-64 grid grid-cols-4 gap-2 animate-in fade-in zoom-in duration-200">
                                   {patterns.map(p => (
                                     <button
                                       key={p.id}
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleSaveSchedule(dateKey, s.id, p.id);
                                         setSelectedCell(null);
                                       }}
                                       className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-lg transition"
                                     >
                                       <div 
                                         className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                                         style={{ backgroundColor: p.color, color: p.textColor }}
                                       >
                                         {p.code}
                                       </div>
                                       <span className="text-[10px] text-slate-500 truncate w-full text-center">{p.label}</span>
                                     </button>
                                   ))}
                                   <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleSaveSchedule(dateKey, s.id, ''); // Clear
                                         setSelectedCell(null);
                                       }}
                                       className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-lg transition text-slate-400 hover:text-red-500"
                                     >
                                       <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center">
                                         <Trash2 size={14} />
                                       </div>
                                       <span className="text-[10px]">削除</span>
                                   </button>
                                 </div>
                               )}
                               {/* Backdrop for closing selection */}
                               {isSelected && (
                                 <div 
                                   className="fixed inset-0 z-40 bg-transparent" 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setSelectedCell(null);
                                   }}
                                 />
                               )}
                             </td>
                           );
                         })}
                       </tr>
                     ))}
                     
                     {/* Summary Row (Mock) */}
                     <tr className="bg-slate-50 font-bold text-xs text-slate-500">
                       <td className="sticky left-0 z-10 bg-slate-50 p-3 border-r border-slate-200">
                         出勤人数
                       </td>
                       {currentMonthDays.map(date => (
                         <td key={date.toISOString()} className="p-2 text-center border-b border-slate-200">
                           -
                         </td>
                       ))}
                     </tr>
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {viewMode === 'staff' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Users size={20} className="text-blue-600"/>
                  スタッフ一覧
                </h3>
                
                <div className="flex gap-2 mb-6">
                   <form 
                     onSubmit={(e) => {
                       e.preventDefault();
                       const form = e.target as HTMLFormElement;
                       const input = form.elements.namedItem('newStaffName') as HTMLInputElement;
                       handleAddStaff(input.value);
                       input.value = '';
                     }}
                     className="flex-1 flex gap-2"
                   >
                     <input 
                       name="newStaffName"
                       type="text" 
                       placeholder="新しいスタッフ名を入力..." 
                       className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                     />
                     <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2">
                       <Plus size={18} />
                       追加
                     </button>
                   </form>
                </div>

                <div className="grid gap-4">
                  {staff.length === 0 && (
                    <div className="text-center py-10 text-slate-400">
                      スタッフが登録されていません。
                    </div>
                  )}
                  {staff.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100 group hover:border-blue-200 transition">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-bold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-500">ID: {s.id.slice(0,8)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition">
                         <button 
                           onClick={() => handleDeleteStaff(s.id)}
                           className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                         >
                           <Trash2 size={18} />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(viewMode === 'patterns' || viewMode === 'settings') && (
            <div className="max-w-2xl mx-auto bg-white p-10 rounded-xl shadow-sm border border-slate-200 text-center">
              <Settings className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-700 mb-2">準備中</h3>
              <p className="text-slate-500">この機能は現在開発中です。スタッフ管理とシフト表機能をご利用ください。</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// --- Components ---

function NavButton({ active, onClick, icon, label, expanded }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, expanded: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200
        ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
      `}
      title={!expanded ? label : ''}
    >
      <div className={`${active ? 'text-white' : ''}`}>{icon}</div>
      {expanded && <span className="font-medium">{label}</span>}
    </button>
  );
}
