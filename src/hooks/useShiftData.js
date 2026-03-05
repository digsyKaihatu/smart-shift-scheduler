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

/**
 * 配列の差分マージ関数（複数人同時操作による先祖返り防止用）
 * ローカルの変更とサーバーの変更を比較し、競合を解決します。
 */
const mergeArray = (localArr, serverArr, lastServerArr) => {
  if (!lastServerArr) return serverArr;
  if (!serverArr) return localArr; // サーバーが空の場合はローカルを優先
  if (!localArr) return serverArr;

  const merged = [];
  const processedServerIds = new Set();
  
  serverArr.forEach(serverItem => {
    if (!serverItem || !serverItem.id) return;
    processedServerIds.add(serverItem.id);

    const localItem = localArr.find(item => item && item.id === serverItem.id);
    const lastItem = lastServerArr.find(item => item && item.id === serverItem.id);

    if (!localItem) {
      // ローカルで削除された場合はマージしない（削除を優先）
      // ただし、他人が新規追加した項目の場合（lastItemにない）は追加する
      if (!lastItem) {
          merged.push(serverItem);
      }
    } else if (!lastItem) {
      // 両方で追加された等の競合時はローカルを優先
      merged.push(localItem);
    } else {
      const isLocalChanged = !deepEqual(localItem, lastItem);
      const isServerChanged = !deepEqual(serverItem, lastItem);
      
      if (isLocalChanged && !isServerChanged) {
        merged.push(localItem); // 自分だけが変更した
      } else if (!isLocalChanged && isServerChanged) {
        merged.push(serverItem); // 他人だけが変更した
      } else if (isLocalChanged && isServerChanged) {
        merged.push(localItem); // 競合時（同時編集）は自分の操作を優先
      } else {
        merged.push(serverItem); // 変更なし
      }
    }
  });

  // 自分が新規追加したもの（サーバーにはまだ存在しない）を追加
  localArr.forEach(localItem => {
    if (localItem && localItem.id && !processedServerIds.has(localItem.id)) {
      if (!lastServerArr.find(item => item && item.id === localItem.id)) {
        merged.push(localItem);
      }
    }
  });

  return merged;
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

  const pendingConfigSave = useRef(false);
  const pendingChanges = useRef({});
  const inflightChanges = useRef({});
  const localPendingChanges = useRef({});

  // 最後にサーバーから受け取った状態を保持（マージの比較用）
  const lastServerConfigRef = useRef({
    staff: initialStaffData,
    tasks: initialTasks,
    shiftPatterns: initialShiftPatterns,
    adminConfig: initialAdminConfig
  });

  const configDocRef = doc(db, "schedules", "config");
  const legacyDocRef = doc(db, "schedules", "main");
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // =========================================================
  // ローカル更新用のラッパー関数
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
    let isFirstConfigLoad = true; // 初回ロードフラグを追加

    const loadMasterData = async () => {
      try {
        setLoadingMessage("設定データを読み込んでいます...");
        
        const configSnap = await getDoc(configDocRef);
        let needsMigration = !configSnap.exists();

        if (needsMigration) {
          const legacySnap = await getDoc(legacyDocRef);
          if (legacySnap.exists()) {
            setLoadingMessage("データの移行処理を行っています...");
            const legacyData = legacySnap.data();
            
            // 初回のマスタデータをセット
            const initialStaff = legacyData.staff || initialStaffData;
            const initialTasksData = legacyData.tasks || initialTasks;
            const initialPatterns = legacyData.shiftPatterns || initialShiftPatterns;
            const initialAdmin = legacyData.adminConfig || initialAdminConfig;

            _setStaff(initialStaff);
            _setTasks(initialTasksData);
            _setShiftPatterns(initialPatterns);
            _setAdminConfig(initialAdmin);
            
            if (legacyData.schedule) setSchedule(legacyData.schedule);
            
            lastServerConfigRef.current = {
               staff: initialStaff,
               tasks: initialTasksData,
               shiftPatterns: initialPatterns,
               adminConfig: initialAdmin
            };

            await setDoc(configDocRef, {
              staff: initialStaff,
              tasks: initialTasksData,
              shiftPatterns: initialPatterns,
              adminConfig: initialAdmin,
              updatedAt: new Date().toISOString()
            });
            
            setInitialDataLoaded(true);
            isFirstConfigLoad = false; // マイグレーションを行った場合はここで初回ロード完了とする
          } else {
             // どちらのドキュメントも無い場合（完全な新規）
             await setDoc(configDocRef, {
                staff: initialStaffData,
                tasks: initialTasks,
                shiftPatterns: initialShiftPatterns,
                adminConfig: initialAdminConfig,
                updatedAt: new Date().toISOString()
             });
          }
        }

        // リアルタイム同期（onSnapshot）の開始
        unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const serverStaff = data.staff || initialStaffData;
            const serverTasks = data.tasks || initialTasks;
            const serverPatterns = data.shiftPatterns || initialShiftPatterns;
            const serverAdmin = data.adminConfig || initialAdminConfig;

            // 初回ロード時は、無条件でサーバーデータをStateにセットして反映する
            if (isFirstConfigLoad) {
                _setStaff(serverStaff);
                _setTasks(serverTasks);
                _setShiftPatterns(serverPatterns);
                _setAdminConfig(serverAdmin);

                lastServerConfigRef.current = {
                   staff: serverStaff,
                   tasks: serverTasks,
                   shiftPatterns: serverPatterns,
                   adminConfig: serverAdmin
                };
                
                isFirstConfigLoad = false;
                setInitialDataLoaded(true);
                return;
            }

            // サーバーのデータとローカルのデータが完全に一致する場合は何もしない（ループ防止）
            const isStaffEqual = deepEqual(lastServerConfigRef.current.staff, serverStaff);
            const isTasksEqual = deepEqual(lastServerConfigRef.current.tasks, serverTasks);
            const isPatternsEqual = deepEqual(lastServerConfigRef.current.shiftPatterns, serverPatterns);
            const isAdminEqual = deepEqual(lastServerConfigRef.current.adminConfig, serverAdmin);

            if (isStaffEqual && isTasksEqual && isPatternsEqual && isAdminEqual && isInitialLoadComplete.current) {
                // 初回ロード完了済みで、サーバーデータに変化がなければスキップ
                return;
            }

            // ローカルの未保存状態とサーバー状態を賢くマージする
            _setStaff(prev => {
                if (isStaffEqual) return prev; // サーバー側に変更がなければローカルを維持
                const merged = mergeArray(prev, serverStaff, lastServerConfigRef.current.staff);
                return deepEqual(prev, merged) ? prev : merged;
            });
            _setTasks(prev => {
                if (isTasksEqual) return prev;
                const merged = mergeArray(prev, serverTasks, lastServerConfigRef.current.tasks);
                return deepEqual(prev, merged) ? prev : merged;
            });
            _setShiftPatterns(prev => {
                if (isPatternsEqual) return prev;
                const merged = mergeArray(prev, serverPatterns, lastServerConfigRef.current.shiftPatterns);
                return deepEqual(prev, merged) ? prev : merged;
            });
            _setAdminConfig(prev => {
               if (isAdminEqual) return prev;
               const isLocalChanged = !deepEqual(prev, lastServerConfigRef.current.adminConfig);
               if (isLocalChanged) return prev; 
               return deepEqual(prev, serverAdmin) ? prev : serverAdmin;
            });

            // 基準となるサーバー状態を更新
            lastServerConfigRef.current = {
               staff: serverStaff,
               tasks: serverTasks,
               shiftPatterns: serverPatterns,
               adminConfig: serverAdmin
            };
            
            if (!isInitialLoadComplete.current) {
                setInitialDataLoaded(true);
            }
          } else {
             // ドキュメントが削除されたなどの異常系
             _setStaff(prev => deepEqual(prev, initialStaffData) ? prev : initialStaffData);
             _setTasks(prev => deepEqual(prev, initialTasks) ? prev : initialTasks);
             _setShiftPatterns(prev => deepEqual(prev, initialShiftPatterns) ? prev : initialShiftPatterns);
             _setAdminConfig(prev => deepEqual(prev, initialAdminConfig) ? prev : initialAdminConfig);
             
             isFirstConfigLoad = false;
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
    if (!pendingConfigSave.current) return;

    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      pendingConfigSave.current = false;
      
      try {
        // 保存直前に最新のサーバーデータを取得してマージする（上書き防止）
        const snap = await getDoc(configDocRef);
        const serverData = snap.exists() ? snap.data() : null;

        let dataToSave = { 
          staff, 
          tasks, 
          shiftPatterns, 
          adminConfig,
          updatedAt: new Date().toISOString()
        };

        if (serverData) {
            dataToSave.staff = mergeArray(staff, serverData.staff || initialStaffData, lastServerConfigRef.current.staff);
            dataToSave.tasks = mergeArray(tasks, serverData.tasks || initialTasks, lastServerConfigRef.current.tasks);
            dataToSave.shiftPatterns = mergeArray(shiftPatterns, serverData.shiftPatterns || initialShiftPatterns, lastServerConfigRef.current.shiftPatterns);
        }

        await setDoc(configDocRef, dataToSave, { merge: true });
        
        // 保存成功後に基準状態を更新
        lastServerConfigRef.current = {
            staff: dataToSave.staff,
            tasks: dataToSave.tasks,
            shiftPatterns: dataToSave.shiftPatterns,
            adminConfig: dataToSave.adminConfig
        };

      } catch (error) {
        console.error("Config save failed:", error);
      }
    }, 500);

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
