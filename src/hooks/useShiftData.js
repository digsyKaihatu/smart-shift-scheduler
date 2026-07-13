import { useReducer, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateScheduleForMonth } from '../utils/scheduleUtils';

// ---------------------------------------------------------------------------
// 汎用的なディープイコール関数・マージ関数
// ---------------------------------------------------------------------------
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

const mergeObject = (localObj, serverObj, lastObj) => {
  const safeLocal = localObj || {};
  const safeServer = serverObj || {};
  const safeLast = lastObj || {};
  const merged = { ...safeServer };
  const allKeys = new Set([...Object.keys(safeLocal), ...Object.keys(safeServer)]);

  allKeys.forEach(key => {
    const localVal = safeLocal[key];
    const serverVal = safeServer[key];
    const lastVal = safeLast[key];

    const isLocalObj = typeof localVal === 'object' && localVal !== null && !Array.isArray(localVal);
    const isServerObj = typeof serverVal === 'object' && serverVal !== null && !Array.isArray(serverVal);
    
    if (isLocalObj || isServerObj) {
      merged[key] = mergeObject(localVal, serverVal, lastVal);
    } else {
      const isLocalChanged = !deepEqual(localVal, lastVal);
      const isServerChanged = !deepEqual(serverVal, lastVal);

      if (isLocalChanged && !isServerChanged) {
        if (localVal === undefined) delete merged[key];
        else merged[key] = localVal;
      } else if (!isLocalChanged && isServerChanged) {
        if (serverVal === undefined) delete merged[key];
        else merged[key] = serverVal;
      } else if (isLocalChanged && isServerChanged) {
        if (localVal === undefined) delete merged[key];
        else merged[key] = localVal;
      }
    }
  });
  return merged;
};

const mergeArray = (localArr, serverArr, lastServerArr) => {
  if (!lastServerArr) return serverArr;
  if (!serverArr) return localArr;
  if (!localArr) return serverArr;

  const merged = [];
  const processedServerIds = new Set();
  
  serverArr.forEach(serverItem => {
    if (!serverItem || !serverItem.id) return;
    processedServerIds.add(serverItem.id);

    const localItem = localArr.find(item => item && item.id === serverItem.id);
    const lastItem = lastServerArr.find(item => item && item.id === serverItem.id);

    if (!localItem) {
      if (!lastItem) merged.push(serverItem);
    } else if (!lastItem) {
      merged.push(localItem);
    } else {
      const isLocalChanged = !deepEqual(localItem, lastItem);
      const isServerChanged = !deepEqual(serverItem, lastItem);
      
      if (isLocalChanged && !isServerChanged) {
        merged.push(localItem); 
      } else if (!isLocalChanged && isServerChanged) {
        merged.push(serverItem); 
      } else if (isLocalChanged && isServerChanged) {
        merged.push(mergeObject(localItem, serverItem, lastItem)); 
      } else {
        merged.push(serverItem); 
      }
    }
  });

  localArr.forEach(localItem => {
    if (localItem && localItem.id && !processedServerIds.has(localItem.id)) {
      if (!lastServerArr.find(item => item && item.id === localItem.id)) {
        merged.push(localItem);
      }
    }
  });

  return merged;
};

// ---------------------------------------------------------------------------
// Reducer定義: アプリケーションの状態を一元管理
// ---------------------------------------------------------------------------
const initialState = {
  isLoading: true,
  loadingMessage: "データベースに接続しています...",
  saveStatus: 'saved',
  initialDataLoaded: false,
  staff: [],
  schedule: {},
  tasks: [],
  shiftPatterns: [],
  adminConfig: initialAdminConfig
};

function shiftReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { 
        ...state, 
        isLoading: action.payload.isLoading, 
        loadingMessage: action.payload.message || state.loadingMessage 
      };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'SET_INITIAL_DATA_LOADED':
      return { ...state, initialDataLoaded: true };
    case 'UPDATE_MASTER_DATA':
      return { ...state, ...action.payload };
    case 'SYNC_SCHEDULE':
      return {
        ...state,
        schedule: {
          ...state.schedule,
          [action.payload.key]: action.payload.nextMonthData
        }
      };
    case 'UPDATE_SCHEDULE':
      return {
        ...state,
        schedule: action.payload
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// メインのカスタムフック
// ---------------------------------------------------------------------------
export const useShiftData = (currentYear, currentMonth) => {
  const [state, dispatch] = useReducer(shiftReducer, initialState);
  const { staff, schedule, tasks, shiftPatterns, adminConfig, isLoading, loadingMessage, saveStatus, initialDataLoaded } = state;

  const debouncedSaveConfig = useRef(null);
  const debouncedSaveSchedule = useRef(null);
  const isInitialLoadComplete = useRef(false);

  const pendingConfigSave = useRef(false);
  const pendingChanges = useRef({});
  const inflightChanges = useRef({});
  const localPendingChanges = useRef({});

  const lastServerConfigRef = useRef({
    staff: initialStaffData,
    tasks: initialTasks,
    shiftPatterns: initialShiftPatterns,
    adminConfig: initialAdminConfig
  });

  const configDocRef = doc(db, "schedules", "config");
  const getMonthDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);

  // ---------------------------------------------------------------------------
  // ローカル更新用のラッパー関数
  // ---------------------------------------------------------------------------
  const setStaff = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' }); // 追加: 即座に未保存ステータスへ
    const newValue = typeof value === 'function' ? value(staff) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { staff: newValue } });
  }, [staff]);

  const setTasks = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' }); // 追加: 即座に未保存ステータスへ
    const newValue = typeof value === 'function' ? value(tasks) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { tasks: newValue } });
  }, [tasks]);

  const setShiftPatterns = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' }); // 追加: 即座に未保存ステータスへ
    const newValue = typeof value === 'function' ? value(shiftPatterns) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { shiftPatterns: newValue } });
  }, [shiftPatterns]);

  const setAdminConfig = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' }); // 追加: 即座に未保存ステータスへ
    const newValue = typeof value === 'function' ? value(adminConfig) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { adminConfig: newValue } });
  }, [adminConfig]);

  // ---------------------------------------------------------------------------
  // 1. 初期データロード (マスタデータ)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let unsubscribeConfig = () => {};
    let isFirstConfigLoad = true; 

    const loadMasterData = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: { isLoading: true, message: "設定データを読み込んでいます..." } });
        
        const configSnap = await getDoc(configDocRef);

        if (!configSnap.exists()) {
             await setDoc(configDocRef, {
                staff: initialStaffData, 
                tasks: initialTasks, 
                shiftPatterns: initialShiftPatterns, 
                adminConfig: initialAdminConfig,
                updatedAt: new Date().toISOString()
             });
             
             dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                 staff: initialStaffData, tasks: initialTasks, shiftPatterns: initialShiftPatterns, adminConfig: initialAdminConfig 
             }});
             dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
             isFirstConfigLoad = false;
        }

        // リアルタイム同期（onSnapshot）
        unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();

            if (lastServerConfigRef.current.updatedAt && data.updatedAt) {
                if (new Date(data.updatedAt) < new Date(lastServerConfigRef.current.updatedAt)) return;
            }

            const serverStaff = data.staff || initialStaffData;
            const serverTasks = data.tasks || initialTasks;
            const serverPatterns = data.shiftPatterns || initialShiftPatterns;
            const serverAdmin = data.adminConfig || initialAdminConfig;

            if (isFirstConfigLoad) {
                dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                    staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin 
                }});
                lastServerConfigRef.current = {
                   staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin, updatedAt: data.updatedAt 
                };
                isFirstConfigLoad = false;
                dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
                return;
            }

            const isStaffEqual = deepEqual(lastServerConfigRef.current.staff, serverStaff);
            const isTasksEqual = deepEqual(lastServerConfigRef.current.tasks, serverTasks);
            const isPatternsEqual = deepEqual(lastServerConfigRef.current.shiftPatterns, serverPatterns);
            const isAdminEqual = deepEqual(lastServerConfigRef.current.adminConfig, serverAdmin);

            if (isStaffEqual && isTasksEqual && isPatternsEqual && isAdminEqual && isInitialLoadComplete.current) return;

            let newStaff = staff;
            let newTasks = tasks;
            let newPatterns = shiftPatterns;
            let newAdminConfig = adminConfig;

            if (!isStaffEqual) {
                const merged = mergeArray(staff, serverStaff, lastServerConfigRef.current.staff);
                newStaff = deepEqual(staff, merged) ? staff : merged;
            }
            if (!isTasksEqual) {
                const merged = mergeArray(tasks, serverTasks, lastServerConfigRef.current.tasks);
                newTasks = deepEqual(tasks, merged) ? tasks : merged;
            }
            if (!isPatternsEqual) {
                const merged = mergeArray(shiftPatterns, serverPatterns, lastServerConfigRef.current.shiftPatterns);
                newPatterns = deepEqual(shiftPatterns, merged) ? shiftPatterns : merged;
            }
            if (!isAdminEqual) {
                const isLocalChanged = !deepEqual(adminConfig, lastServerConfigRef.current.adminConfig);
                if (!isLocalChanged) newAdminConfig = serverAdmin;
            }

            dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                staff: newStaff, tasks: newTasks, shiftPatterns: newPatterns, adminConfig: newAdminConfig 
            }});

            lastServerConfigRef.current = {
               staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin, updatedAt: data.updatedAt
            };
            
            if (!isInitialLoadComplete.current) dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
          } else {
             dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                 staff: initialStaffData, tasks: initialTasks, shiftPatterns: initialShiftPatterns, adminConfig: initialAdminConfig 
             }});
             isFirstConfigLoad = false;
             dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
          }
        });

      } catch (error) {
        console.error("Master Data Load Error:", error);
        dispatch({ type: 'SET_LOADING', payload: { isLoading: true, message: `エラー: ${error.message}` } });
      }
    };

    loadMasterData();
    return () => unsubscribeConfig();
  }, [staff, tasks, shiftPatterns, adminConfig]);

  // ---------------------------------------------------------------------------
  // 2. 月次データロード (リアルタイム同期)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!initialDataLoaded) return;

    const key = `${currentYear}-${currentMonth}`;
    const monthDocRef = getMonthDocRef(currentYear, currentMonth);

    dispatch({ type: 'SET_LOADING', payload: { isLoading: true } });

    const unsubscribe = onSnapshot(monthDocRef, (monthSnap) => {
      if (monthSnap.exists()) {
        const data = monthSnap.data();
        const serverSchedule = data.scheduleData || {};

        const prevMonthData = schedule[key] || {};
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
                 hasPendingForThisStaff = true; break;
              }
            }
            if (localPendingChanges.current[key]) {
               for (const localKey in localPendingChanges.current[key]) {
                  if (localKey.startsWith(`${staffId}.`)) {
                      hasPendingForThisStaff = true; break;
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
            dispatch({ type: 'SYNC_SCHEDULE', payload: { key, nextMonthData } });
        }
        dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
      } else {
        if (!schedule[key]) {
            const initialSchedule = generateScheduleForMonth(currentYear, currentMonth, staff, shiftPatterns);
            dispatch({ type: 'UPDATE_SCHEDULE', payload: { ...schedule, [key]: initialSchedule } });
        }
        dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
      }
      isInitialLoadComplete.current = true;
    }, (error) => {
      console.error("Monthly Data Load Error:", error);
      dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
    });

    return () => unsubscribe();
  }, [currentYear, currentMonth, initialDataLoaded, schedule, staff, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 3. データ保存ロジック
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isInitialLoadComplete.current || !pendingConfigSave.current) return;
    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      pendingConfigSave.current = false;
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' }); // 追加: 保存処理中ステータス
      
      try {
        const snap = await getDoc(configDocRef);
        const serverData = snap.exists() ? snap.data() : null;

        let dataToSave = { 
          staff, tasks, shiftPatterns, adminConfig,
          updatedAt: new Date().toISOString()
        };

        if (serverData) {
            dataToSave.staff = mergeArray(staff, serverData.staff || initialStaffData, lastServerConfigRef.current.staff);
            dataToSave.tasks = mergeArray(tasks, serverData.tasks || initialTasks, lastServerConfigRef.current.tasks);
            dataToSave.shiftPatterns = mergeArray(shiftPatterns, serverData.shiftPatterns || initialShiftPatterns, lastServerConfigRef.current.shiftPatterns);
        }

        await setDoc(configDocRef, dataToSave, { merge: true });
        
        lastServerConfigRef.current = {
            staff: dataToSave.staff, tasks: dataToSave.tasks, shiftPatterns: dataToSave.shiftPatterns,
            adminConfig: dataToSave.adminConfig, updatedAt: dataToSave.updatedAt
        };
        
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }); // 追加: 保存完了ステータス
      } catch (error) {
        console.error("Config save failed:", error);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' }); // 追加: エラーステータス
      }
    }, 500);

    return () => clearTimeout(debouncedSaveConfig.current);
  }, [staff, tasks, shiftPatterns, adminConfig]);

  const triggerScheduleSave = useCallback(() => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      
      const changesByMonth = { ...pendingChanges.current };
      pendingChanges.current = {}; 

      inflightChanges.current = { ...inflightChanges.current };
      for (const mKey in changesByMonth) {
          inflightChanges.current[mKey] = { ...(inflightChanges.current[mKey] || {}), ...changesByMonth[mKey] };
      }

      const promises = Object.entries(changesByMonth).map(async ([monthKey, updates]) => {
        if (Object.keys(updates).length === 0) return;
        const [y, m] = monthKey.split('-');
        const docRef = getMonthDocRef(y, m);
        const nestedData = { updatedAt: new Date().toISOString(), scheduleData: updates };

        try {
          await setDoc(docRef, nestedData, { merge: true });
        } catch (error) {
          console.error(`Schedule update failed for ${monthKey}:`, error);
          dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
          throw error;
        }
      });

      try {
        await Promise.all(promises);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      } catch (e) {
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
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
  // 4. データ更新用関数 (UIから呼び出し)
  // ---------------------------------------------------------------------------
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    const currentMonthData = schedule[key] || {};
    const currentStaffData = currentMonthData[staffId] || {};
    
    if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return;

    const newSchedule = {
      ...schedule,
      [key]: { ...currentMonthData, [staffId]: { ...currentStaffData, [day]: value } }
    };
    
    dispatch({ type: 'UPDATE_SCHEDULE', payload: newSchedule });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    if (!pendingChanges.current[key][staffId]) pendingChanges.current[key][staffId] = {};
    pendingChanges.current[key][staffId][day] = value;

    triggerScheduleSave();
  }, [schedule, triggerScheduleSave]);

  const updateLocalShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    const currentMonthData = schedule[key] || {};
    const currentStaffData = currentMonthData[staffId] || {};
    
    if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return;
    
    const newSchedule = {
      ...schedule,
      [key]: { ...currentMonthData, [staffId]: { ...currentStaffData, [day]: value } }
    };
    dispatch({ type: 'UPDATE_SCHEDULE', payload: newSchedule });

    if (!localPendingChanges.current[key]) localPendingChanges.current[key] = {};
    localPendingChanges.current[key][`${staffId}.${day}`] = true;
  }, [schedule]);

  const updateShiftItems = useCallback((year, month, updates) => {
    if (!updates || updates.length === 0) return;
    const key = `${year}-${month}`;
    const currentMonthData = { ...(schedule[key] || {}) };
    let hasChange = false;

    updates.forEach(({ staffId, day, value }) => {
      if (!currentMonthData[staffId]) currentMonthData[staffId] = {};
      if (JSON.stringify(currentMonthData[staffId][day]) !== JSON.stringify(value)) {
         currentMonthData[staffId] = { ...currentMonthData[staffId], [day]: value };
         hasChange = true;
      }
    });

    if (!hasChange) return;

    const newSchedule = { ...schedule, [key]: currentMonthData };
    dispatch({ type: 'UPDATE_SCHEDULE', payload: newSchedule });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    updates.forEach(({ staffId, day, value }) => {
      if (!pendingChanges.current[key][staffId]) pendingChanges.current[key][staffId] = {};
      pendingChanges.current[key][staffId][day] = value;
      if (localPendingChanges.current[key]?.[`${staffId}.${day}`]) {
          delete localPendingChanges.current[key][`${staffId}.${day}`];
      }
    });

    triggerScheduleSave();
  }, [schedule, triggerScheduleSave]);

  const updateShiftUserMonth = useCallback((year, month, staffId, monthData) => {
    const key = `${year}-${month}`;
    const currentMonthData = { ...(schedule[key] || {}) };
    currentMonthData[staffId] = monthData;
    
    const newSchedule = { ...schedule, [key]: currentMonthData };
    dispatch({ type: 'UPDATE_SCHEDULE', payload: newSchedule });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    pendingChanges.current[key][staffId] = monthData;
    
    triggerScheduleSave();
  }, [schedule, triggerScheduleSave]);

  // ---------------------------------------------------------------------------
  // 5. タブ閉じ防止機能 (セーフティネット)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // 保存処理が未完了のままページを去ろうとした場合
      if (saveStatus !== 'saved' || pendingConfigSave.current) {
        e.preventDefault();
        e.returnValue = ''; // 多くのブラウザで警告ダイアログを出すために必要です
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  return {
    staff, setStaff,
    schedule, 
    updateShiftItem,
    updateLocalShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, 
    setLoadingMessage: (msg) => dispatch({ type: 'SET_LOADING', payload: { isLoading: isLoading, message: msg } }), 
    setIsLoading: (loading) => dispatch({ type: 'SET_LOADING', payload: { isLoading: loading } }),
    saveStatus, initialDataLoaded
  };
};
