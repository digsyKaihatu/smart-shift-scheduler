import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

/**
 * 汎用的なディープイコール関数
 * （オブジェクトのプロパティ順序などに依存せず、中身が完全に一致しているかを安全に判定します）
 */
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
};

export const useShiftData = (currentYear, currentMonth) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // 内部ステート（UIからの直接変更と、サーバーからの受信を区別するため）
  const [staff, _setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, _setTasks] = useState([]);
  const [shiftPatterns, _setShiftPatterns] = useState([]);
  const [adminConfig, _setAdminConfig] = useState(initialAdminConfig);

  const [history, setHistory] = useState({ past: [], future: [] });

  // Refs
  const debouncedSaveConfig = useRef(null);
  const debouncedSaveSchedule = useRef(null);
  const isInitialLoadComplete = useRef(false);

  // ★ 無限ループ防止のための重要フラグ
  const pendingConfigSave = useRef(false);

  const pendingChanges = useRef({});
  const inflightChanges = useRef({});
  const localPendingChanges = useRef({});

  const configDocRef = doc(db, "schedules", "config");
  const legacyDocRef = doc(db, "schedules", "main");
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // =========================================================
  // ローカル更新用のラッパー関数
  // UIからデータが変更された時のみ pendingConfigSave フラグを立てて保存を許可する
  // =========================================================
  const setStaff = useCallback((value) => {
    pendingConfigSave.current = true;
    _setStaff(value);
  }, []);
  const setTasks = useCallback((value) => {
    pendingConfigSave.current = true;
    _setTasks(value);
  }, []);
  const setShiftPatterns = useCallback((value) => {
    pendingConfigSave.current = true;
    _setShiftPatterns(value);
  }, []);
  const setAdminConfig = useCallback((value) => {
    pendingConfigSave.current = true;
    _setAdminConfig(value);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. 初期データロード (マスタデータ) - リアルタイム同期付き
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let unsubscribeConfig = () => {};

    const loadMasterData = async () => {
      try {
        setLoadingMessage("設定データを読み込んでいます...");
        
        // マイグレーション用チェック
        const configSnap = await getDoc(configDocRef);
        if (!configSnap.exists()) {
          const legacySnap = await getDoc(legacyDocRef);
          if (legacySnap.exists()) {
            setLoadingMessage("データの移行処理を行っています...");
            const legacyData = legacySnap.data();
            _setStaff(legacyData.staff || initialStaffData);
            _setTasks(legacyData.tasks || initialTasks);
            _setShiftPatterns(legacyData.shiftPatterns || initialShiftPatterns);
            _setAdminConfig(legacyData.adminConfig || initialAdminConfig);
            if (legacyData.schedule) {
              setSchedule(legacyData.schedule);
            }
            await setDoc(configDocRef, {
              staff: legacyData.staff || initialStaffData,
              tasks: legacyData.tasks || initialTasks,
              shiftPatterns: legacyData.shiftPatterns || initialShiftPatterns,
              adminConfig: legacyData.adminConfig || initialAdminConfig,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // リアルタイム同期（onSnapshot）の開始
        unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            
            // ★サーバーからの更新は _setStaff 等を使用（保存フラグは立てない）
            _setStaff(prev => deepEqual(prev, data.staff || initialStaffData) ? prev : (data.staff || initialStaffData));
            _setTasks(prev => deepEqual(prev, data.tasks || initialTasks) ? prev : (data.tasks || initialTasks));
            _setShiftPatterns(prev => deepEqual(prev, data.shiftPatterns || initialShiftPatterns) ? prev : (data.shiftPatterns || initialShiftPatterns));
            _setAdminConfig(prev => deepEqual(prev, data.adminConfig || initialAdminConfig) ? prev : (data.adminConfig || initialAdminConfig));

            setInitialDataLoaded(true);
          } else {
             _setStaff(prev => deepEqual(prev, initialStaffData) ? prev : initialStaffData);
             _setTasks(prev => deepEqual(prev, initialTasks) ? prev : initialTasks);
             _setShiftPatterns(prev => deepEqual(prev, initialShiftPatterns) ? prev : initialShiftPatterns);
             _setAdminConfig(prev => deepEqual(prev, initialAdminConfig) ? prev : initialAdminConfig);
             setInitialDataLoaded(true);
          }
        });

      } catch (error) {
        console.error("Master Data Load Error:", error);
        setLoadingMessage(`エラー: ${error.message}`);
      }
    };

    loadMasterData();
    return () => unsubscribeConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // 2. 月次データロード (リアルタイム同期付き)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const key = `${currentYear}-${currentMonth}`;
    const monthDocRef = getMonthDocRef(currentYear, currentMonth);

    setIsLoading(true);

    const unsubscribe = onSnapshot(monthDocRef, (monthSnap) => {
      if (monthSnap.exists()) {
        const data = monthSnap.data();
        const serverSchedule = data.scheduleData || {};

        setSchedule(prev => {
          const prevMonthData = prev[key] || {};
          let hasChange = false;
          const nextMonthData = { ...prevMonthData };

          Object.keys(serverSchedule).forEach(staffId => {
            const serverStaffData = serverSchedule[staffId];
            const localStaffData = prevMonthData[staffId] || {};

            // deepEqual に変更して誤判定を防止
            if (!deepEqual(serverStaffData, localStaffData)) {
              const activeChanges = { 
                ...(inflightChanges.current[key] || {}), 
                ...(pendingChanges.current[key] || {}) 
              };
              
              let hasPendingForThisStaff = false;
              for (const activeKey in activeChanges) {
                if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                   hasPendingForThisStaff = true;
                   break;
                }
              }

              if (localPendingChanges.current[key]) {
                 for (const localKey in localPendingChanges.current[key]) {
                    if (localKey.startsWith(`${staffId}.`)) {
                        hasPendingForThisStaff = true;
                        break;
                    }
                 }
              }

              if (!hasPendingForThisStaff) {
                 nextMonthData[staffId] = serverStaffData;
                 hasChange = true;
              } else {
                 const mergedStaffData = { ...serverStaffData };
                 for (const activeKey in activeChanges) {
                     if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                         const dayStr = activeKey.split('.').pop();
                         mergedStaffData[dayStr] = activeChanges[activeKey];
                     }
                 }

                 if (localPendingChanges.current[key]) {
                     for (const localKey in localPendingChanges.current[key]) {
                         if (localKey.startsWith(`${staffId}.`)) {
                             const dayStr = localKey.split('.').pop();
                             if (prevMonthData[staffId] && prevMonthData[staffId][dayStr] !== undefined) {
                                 mergedStaffData[dayStr] = prevMonthData[staffId][dayStr];
                             }
                         }
                     }
                 }

                 if (!deepEqual(mergedStaffData, localStaffData)) {
                     nextMonthData[staffId] = mergedStaffData;
                     hasChange = true;
                 }
              }
            }
          });

          if (hasChange) {
            return { ...prev, [key]: nextMonthData };
          }
          return prev;
        });
        
        setIsLoading(false);
      } else {
        setSchedule(prev => {
          if (prev[key]) {
             setIsLoading(false);
             return prev; 
          }
          const initialSchedule = generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns);
          setIsLoading(false);
          return {
            ...prev,
            [key]: initialSchedule
          };
        });
      }
      isInitialLoadComplete.current = true;
    }, (error) => {
      console.error("Monthly Data Load Error:", error);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [currentYear, currentMonth, initialDataLoaded, staff, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック (Config / Schedule 分離)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isInitialLoadComplete.current) return;

    // ★ 他人の更新を受信しただけの場合は保存処理をスキップ（無限ループ防止の要）
    if (!pendingConfigSave.current) return;

    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      // 実行直前にフラグを下ろす
      pendingConfigSave.current = false;
      
      try {
        await setDoc(configDocRef, { 
          staff, 
          tasks, 
          shiftPatterns, 
          adminConfig,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Config save failed:", error);
      }
    }, 2000);

    return () => clearTimeout(debouncedSaveConfig.current);
  }, [staff, tasks, shiftPatterns, adminConfig]);

  const triggerScheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      setSaveStatus('saving');
      
      const changesByMonth = { ...pendingChanges.current };
      pendingChanges.current = {}; 

      inflightChanges.current = { ...inflightChanges.current };
      for (const mKey in changesByMonth) {
          inflightChanges.current[mKey] = {
              ...(inflightChanges.current[mKey] || {}),
              ...changesByMonth[mKey]
          };
      }

      const promises = Object.entries(changesByMonth).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;

        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        
        updates['updatedAt'] = new Date().toISOString();

        try {
          await updateDoc(docRef, updates);
        } catch (error) {
          if (error.code === 'not-found') {
             const nestedData = {
               year: parseInt(y),
               month: parseInt(m),
               updatedAt: new Date().toISOString(),
               scheduleData: {}
             };
             
             for (const [key, value] of Object.entries(updates)) {
                 if (key.startsWith('scheduleData.')) {
                     const parts = key.split('.');
                     const staffId = parts[1];
                     const day = parts[2];
                     if (!nestedData.scheduleData[staffId]) {
                         nestedData.scheduleData[staffId] = {};
                     }
                     nestedData.scheduleData[staffId][day] = value;
                 }
             }

             await setDoc(docRef, nestedData, { merge: true });
          } else {
            console.error(`Schedule update failed for ${monthKey}:`, error);
            setSaveStatus('error');
            throw error;
          }
        }
      });

      try {
        await Promise.all(promises);
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('error');
      } finally {
        for (const mKey in changesByMonth) {
           if (inflightChanges.current[mKey]) {
               for (const updateKey in changesByMonth[mKey]) {
                   delete inflightChanges.current[mKey][updateKey];
               }
           }
        }
      }
    }, 1000);
  }, []);

  // ---------------------------------------------------------------------------
  // 4. データ更新用関数 (UIから呼び出す)
  // ---------------------------------------------------------------------------

  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;

    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      
      if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) {
        return prev;
      }

      const newMonthData = {
        ...currentMonthData,
        [staffId]: {
          ...currentStaffData,
          [day]: value
        }
      };
      
      setHistory(h => ({ past: [...h.past, prev], future: [] }));

      return { ...prev, [key]: newMonthData };
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;

    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const updateLocalShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    
    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return prev;
      return { ...prev, [key]: { ...currentMonthData, [staffId]: { ...currentStaffData, [day]: value } } };
    });

    if (!localPendingChanges.current[key]) localPendingChanges.current[key] = {};
    localPendingChanges.current[key][`${staffId}.${day}`] = true;
  }, []);

  const updateShiftItems = useCallback((year, month, updates) => {
    if (!updates || updates.length === 0) return;
    const key = `${year}-${month}`;

    setSchedule(prev => {
      const currentMonthData = { ...(prev[key] || {}) };
      let hasChange = false;

      updates.forEach(({ staffId, day, value }) => {
        if (!currentMonthData[staffId]) currentMonthData[staffId] = {};
        if (JSON.stringify(currentMonthData[staffId][day]) !== JSON.stringify(value)) {
           currentMonthData[staffId] = { ...currentMonthData[staffId], [day]: value };
           hasChange = true;
        }
      });

      if (!hasChange) return prev;
      setHistory(h => ({ past: [...h.past, prev], future: [] }));
      return { ...prev, [key]: currentMonthData };
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    
    updates.forEach(({ staffId, day, value }) => {
      pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;
      if (localPendingChanges.current[key]?.[`${staffId}.${day}`]) {
          delete localPendingChanges.current[key][`${staffId}.${day}`];
      }
    });

    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const updateShiftUserMonth = useCallback((year, month, staffId, monthData) => {
    const key = `${year}-${month}`;
    
    setSchedule(prev => {
      const currentMonthData = { ...(prev[key] || {}) };
      currentMonthData[staffId] = monthData;
      return { ...prev, [key]: currentMonthData };
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][`scheduleData.${staffId}`] = monthData;
    
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const undo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (past.length === 0) return prev;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      setSchedule(previous);
      return { past: newPast, future: [schedule, ...future] };
    });
  }, [schedule]);

  const redo = useCallback(() => {
    setHistory(prev => {
      const { past, future } = prev;
      if (future.length === 0) return prev;
      const next = future[0];
      const newFuture = future.slice(1);
      setSchedule(next);
      return { past: [...past, schedule], future: newFuture };
    });
  }, [schedule]);

  return {
    staff, setStaff,
    schedule, 
    updateShiftItem,
    updateLocalShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
