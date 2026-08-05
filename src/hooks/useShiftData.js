// src/hooks/useShiftData.js
import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase';
import { useOktaAuth } from '@okta/okta-react'; 
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
  summarySchedule: {}, 
  individualSchedules: {}, 
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
    case 'SYNC_SUMMARY_SCHEDULE':
      return {
        ...state,
        summarySchedule: {
          ...state.summarySchedule,
          [action.payload.key]: action.payload.data
        }
      };
    case 'SYNC_INDIVIDUAL_SCHEDULES':
      return {
        ...state,
        individualSchedules: {
          ...state.individualSchedules,
          [action.payload.key]: action.payload.data
        }
      };
    case 'UPDATE_LOCAL_INDIVIDUAL': {
      const { key, staffId, day, value } = action.payload;
      const currentMonthInds = state.individualSchedules[key] || {};
      const staffIndData = currentMonthInds[staffId] || { scheduleData: {} };
      
      const nextStaffIndData = {
        ...staffIndData,
        scheduleData: {
          ...(staffIndData.scheduleData || {}),
          [day]: value
        }
      };

      return {
        ...state,
        individualSchedules: {
          ...state.individualSchedules,
          [key]: {
            ...currentMonthInds,
            [staffId]: nextStaffIndData
          }
        }
      };
    }
    case 'UPDATE_LOCAL_INDIVIDUAL_BULK': {
      const { key, updates } = action.payload;
      const currentMonthInds = { ...(state.individualSchedules[key] || {}) };

      updates.forEach(({ staffId, day, value }) => {
        const staffIndData = currentMonthInds[staffId] || { scheduleData: {} };
        currentMonthInds[staffId] = {
          ...staffIndData,
          scheduleData: {
            ...(staffIndData.scheduleData || {}),
            [day]: value
          }
        };
      });

      return {
        ...state,
        individualSchedules: {
          ...state.individualSchedules,
          [key]: currentMonthInds
        }
      };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// メインのカスタムフック
// ---------------------------------------------------------------------------
export const useShiftData = (currentYear, currentMonth) => {
  const [state, dispatch] = useReducer(shiftReducer, initialState);
  const { authState, oktaAuth } = useOktaAuth();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const { staff, summarySchedule, individualSchedules, tasks, shiftPatterns, adminConfig, isLoading, loadingMessage, saveStatus, initialDataLoaded } = state;

  const stateRef = useRef(state);
  const userRef = useRef({ id: null, email: "", isAdmin: false });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const fetchUser = async () => {
      if (authState?.isAuthenticated) {
        try {
          const info = await oktaAuth.getUser();
          setCurrentUserEmail(info.email || "");
        } catch (e) {
          console.error("Oktaユーザー取得エラー:", e);
        }
      }
    };
    fetchUser();
  }, [authState, oktaAuth]);

  useEffect(() => {
    if (currentUserEmail && staff.length > 0) {
      const matched = staff.find(s => s.email === currentUserEmail);
      const matchedId = matched ? matched.id : (currentUserEmail === (adminConfig.adminEmails || '').split(',')[0]?.trim() ? 'admin' : 'okta-user');
      
      const adminEmails = (adminConfig.adminEmails || '').split(',').map(e => e.trim());
      const isAdmin = matchedId === 'admin' || adminEmails.includes(currentUserEmail);

      setCurrentUserId(matchedId);
      userRef.current = { id: matchedId, email: currentUserEmail, isAdmin };
    }
  }, [currentUserEmail, staff, adminConfig]);

  const debouncedSaveConfig = useRef(null);
  const debouncedSaveSchedule = useRef(null); 
  const isInitialLoadComplete = useRef(false);
  const pendingConfigSave = useRef(false);

  const pendingChanges = useRef({}); 
  const inflightChanges = useRef({}); 

  const lastServerConfigRef = useRef({
    staff: initialStaffData,
    tasks: initialTasks,
    shiftPatterns: initialShiftPatterns,
    adminConfig: initialAdminConfig
  });

  const configDocRef = doc(db, "schedules", "config");
  const getSummaryDocRef = (year, month) => doc(db, "schedules", `${year}-${month}`);
  const getIndividualDocRef = (staffId, year, month) => doc(db, "individual_schedules", `${staffId}_${year}-${month}`);

  const setStaff = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(staff) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { staff: newValue } });
  }, [staff]);

  const setTasks = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(tasks) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { tasks: newValue } });
  }, [tasks]);

  const setShiftPatterns = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(shiftPatterns) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { shiftPatterns: newValue } });
  }, [shiftPatterns]);

  const setAdminConfig = useCallback((value) => {
    pendingConfigSave.current = true;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    const newValue = typeof value === 'function' ? value(adminConfig) : value;
    dispatch({ type: 'UPDATE_MASTER_DATA', payload: { adminConfig: newValue } });
  }, [adminConfig]);

  // 1. 設定データロード
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
             // ★修正: フラグを確実にtrueに切り替える
             isInitialLoadComplete.current = true;
             isFirstConfigLoad = false;
        }

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
                // ★修正: フラグを確実にtrueに切り替える
                isInitialLoadComplete.current = true;
                return;
            }

            const { staff: currentStaff, tasks: currentTasks, shiftPatterns: currentPatterns, adminConfig: currentAdminConfig } = stateRef.current;

            const isStaffEqual = deepEqual(lastServerConfigRef.current.staff, serverStaff);
            const isTasksEqual = deepEqual(lastServerConfigRef.current.tasks, serverTasks);
            const isPatternsEqual = deepEqual(lastServerConfigRef.current.shiftPatterns, serverPatterns);
            const isAdminEqual = deepEqual(lastServerConfigRef.current.adminConfig, serverAdmin);

            if (isStaffEqual && isTasksEqual && isPatternsEqual && isAdminEqual && isInitialLoadComplete.current) return;

            let newStaff = currentStaff;
            let newTasks = currentTasks;
            let newPatterns = currentPatterns;
            let newAdminConfig = currentAdminConfig;

            if (!isStaffEqual) {
                const merged = mergeArray(currentStaff, serverStaff, lastServerConfigRef.current.staff);
                newStaff = deepEqual(currentStaff, merged) ? currentStaff : merged;
            }
            if (!isTasksEqual) {
                const merged = mergeArray(currentTasks, serverTasks, lastServerConfigRef.current.tasks);
                newTasks = deepEqual(currentTasks, merged) ? currentTasks : merged;
            }
            if (!isPatternsEqual) {
                const merged = mergeArray(currentPatterns, serverPatterns, lastServerConfigRef.current.shiftPatterns);
                newPatterns = deepEqual(currentPatterns, merged) ? currentPatterns : merged;
            }
            if (!isAdminEqual) {
                const isLocalChanged = !deepEqual(currentAdminConfig, lastServerConfigRef.current.adminConfig);
                if (!isLocalChanged) newAdminConfig = serverAdmin;
            }

            dispatch({ type: 'UPDATE_MASTER_DATA', payload: { 
                staff: newStaff, tasks: newTasks, shiftPatterns: newPatterns, adminConfig: newAdminConfig 
            }});

            lastServerConfigRef.current = {
               staff: serverStaff, tasks: serverTasks, shiftPatterns: serverPatterns, adminConfig: serverAdmin, updatedAt: data.updatedAt
            };
            
            if (!isInitialLoadComplete.current) {
                dispatch({ type: 'SET_INITIAL_DATA_LOADED' });
                // ★修正: フラグを確実にtrueに切り替える
                isInitialLoadComplete.current = true;
            }
          }
        });
      } catch (error) {
        console.error("Master Data Load Error:", error);
      }
    };

    loadMasterData();
    return () => unsubscribeConfig();
  }, []);

  // 2. 確定サマリデータの監視
  useEffect(() => {
    if (!initialDataLoaded) return;
    const key = `${currentYear}-${currentMonth}`;
    const summaryDocRef = getSummaryDocRef(currentYear, currentMonth);

    const unsubscribe = onSnapshot(summaryDocRef, (snap) => {
      let summaryData = {};
      if (snap.exists()) {
        summaryData = snap.data().scheduleData || {};
      }
      dispatch({ type: 'SYNC_SUMMARY_SCHEDULE', payload: { key, data: summaryData } });
      dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
    }, (error) => {
      console.error("Summary Schedule Load Error:", error);
    });

    return () => unsubscribe();
  }, [currentYear, currentMonth, initialDataLoaded]);

  // 3. 個別下書きデータの監視
  useEffect(() => {
    if (!initialDataLoaded || !currentUserId) return;
    const key = `${currentYear}-${currentMonth}`;
    const isAdmin = userRef.current.isAdmin;

    let unsubscribe = () => {};

    if (isAdmin) {
      const q = query(
        collection(db, "individual_schedules"),
        where("year", "==", currentYear),
        where("month", "==", currentMonth)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const nextIndSchedules = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.staffId) {
            nextIndSchedules[data.staffId] = data;
          }
        });

        const currentIndSchedules = stateRef.current.individualSchedules[key] || {};
        const activeChanges = { 
          ...(inflightChanges.current[key] || {}), 
          ...(pendingChanges.current[key] || {}) 
        };

        const mergedIndSchedules = { ...nextIndSchedules };
        Object.keys(activeChanges).forEach(staffId => {
          if (!mergedIndSchedules[staffId]) {
            mergedIndSchedules[staffId] = { staffId, year: currentYear, month: currentMonth, scheduleData: {} };
          }
          mergedIndSchedules[staffId].scheduleData = {
            ...(mergedIndSchedules[staffId].scheduleData || {}),
            ...activeChanges[staffId]
          };
        });

        dispatch({ type: 'SYNC_INDIVIDUAL_SCHEDULES', payload: { key, data: mergedIndSchedules } });
        dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
      }, (error) => {
        console.error("Admin Individual Schedules Load Error:", error);
      });
    } else {
      const myDocRef = getIndividualDocRef(currentUserId, currentYear, currentMonth);

      unsubscribe = onSnapshot(myDocRef, (docSnap) => {
        const nextIndSchedules = {};
        if (docSnap.exists()) {
          const data = docSnap.data();
          nextIndSchedules[currentUserId] = data;
        }

        const activeMyChanges = {
          ...(inflightChanges.current[key]?.[currentUserId] || {}),
          ...(pendingChanges.current[key]?.[currentUserId] || {})
        };

        if (Object.keys(activeMyChanges).length > 0) {
          if (!nextIndSchedules[currentUserId]) {
            nextIndSchedules[currentUserId] = { staffId: currentUserId, year: currentYear, month: currentMonth, scheduleData: {} };
          }
          nextIndSchedules[currentUserId].scheduleData = {
            ...(nextIndSchedules[currentUserId].scheduleData || {}),
            ...activeMyChanges
          };
        }

        dispatch({ type: 'SYNC_INDIVIDUAL_SCHEDULES', payload: { key, data: nextIndSchedules } });
        dispatch({ type: 'SET_LOADING', payload: { isLoading: false } });
      }, (error) => {
        console.error("Member Individual Schedule Load Error:", error);
      });
    }

    return () => unsubscribe();
  }, [currentYear, currentMonth, initialDataLoaded, currentUserId]);

  const key = `${currentYear}-${currentMonth}`;

  // 4. 動的合成ロジック
  const synthesizedStaff = useMemo(() => {
    const currentMonthInds = individualSchedules[key] || {};
    return staff.map(s => {
      const indDoc = currentMonthInds[s.id] || {};
      return {
        ...s,
        shiftSubmitted: { ...s.shiftSubmitted, [key]: !!indDoc.shiftSubmitted },
        shiftRemanded: { ...s.shiftRemanded, [key]: !!indDoc.shiftRemanded },
        shiftApproved: { ...s.shiftApproved, [key]: !!indDoc.shiftApproved }
      };
    });
  }, [staff, individualSchedules, key]);

  const synthesizedSchedule = useMemo(() => {
    const summaryData = summarySchedule[key] || {};
    const indData = individualSchedules[key] || {};
    const isAdmin = userRef.current.isAdmin;

    const finalSchedule = {};

    staff.forEach(s => {
      finalSchedule[s.id] = { ...(summaryData[s.id] || {}) };
      const memberIndData = indData[s.id]?.scheduleData || {};

      if (isAdmin) {
        if (indData[s.id]) {
          finalSchedule[s.id] = { ...finalSchedule[s.id], ...memberIndData };
        }
      } else {
        if (s.id === currentUserId && indData[s.id]) {
          finalSchedule[s.id] = { ...finalSchedule[s.id], ...memberIndData };
        }
      }

      if (Object.keys(finalSchedule[s.id]).length === 0) {
        const defaultSched = generateScheduleForMonth(currentYear, currentMonth, [s], shiftPatterns)[s.id] || {};
        finalSchedule[s.id] = defaultSched;
      }
    });

    return { [key]: finalSchedule };
  }, [staff, summarySchedule, individualSchedules, key, currentUserId, currentYear, currentMonth, shiftPatterns]);

  // ---------------------------------------------------------------------------
  // 5. デバウンス自動保存（スケジュール）
  // ---------------------------------------------------------------------------
  const triggerScheduleSave = useCallback(() => {
    console.log("[ScheduleSave] 保存タイマー(1秒)をセットしました");
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'unsaved' });
    if (debouncedSaveSchedule.current) clearTimeout(debouncedSaveSchedule.current);

    debouncedSaveSchedule.current = setTimeout(async () => {
      console.log("[ScheduleSave] 1秒経過、バッチ保存処理を開始します");
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      
      const changesByMonth = { ...pendingChanges.current };
      pendingChanges.current = {}; 

      inflightChanges.current = { ...inflightChanges.current };
      for (const mKey in changesByMonth) {
          inflightChanges.current[mKey] = { ...(inflightChanges.current[mKey] || {}), ...changesByMonth[mKey] };
      }

      try {
        const batch = writeBatch(db);
        let commitCount = 0;

        Object.entries(changesByMonth).forEach(([monthKey, staffUpdates]) => {
          const [y, m] = monthKey.split('-');
          
          Object.entries(staffUpdates).forEach(([staffId, dayUpdates]) => {
            const docRef = getIndividualDocRef(staffId, y, m);
            batch.set(docRef, {
              staffId,
              year: Number(y),
              month: Number(m),
              scheduleData: dayUpdates,
              updatedAt: new Date().toISOString()
            }, { merge: true });
            
            commitCount++;
          });
        });

        if (commitCount > 0) {
          await batch.commit();
          console.log("[ScheduleSave] バッチコミットが正常に完了しました！");
        }

        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      } catch (e) {
        console.error("[ScheduleSave ERROR] バッチ保存中にエラーが発生しました:", e);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
      } finally {
        for (const mKey in changesByMonth) {
          if (inflightChanges.current[mKey]) {
            Object.keys(changesByMonth[mKey]).forEach(staffId => {
              if (inflightChanges.current[mKey][staffId]) {
                Object.keys(changesByMonth[mKey][staffId]).forEach(day => {
                  delete inflightChanges.current[mKey][staffId][day];
                });
                if (Object.keys(inflightChanges.current[mKey][staffId]).length === 0) {
                  delete inflightChanges.current[mKey][staffId];
                }
              }
            });
            if (Object.keys(inflightChanges.current[mKey]).length === 0) {
              delete inflightChanges.current[mKey];
            }
          }
        }
      }
    }, 1000); 
  }, []);

  // ---------------------------------------------------------------------------
  // 6. データ更新用関数 (UIから呼び出し)
  // ---------------------------------------------------------------------------
  const updateShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    const currentMonthData = synthesizedSchedule[key] || {};
    const currentStaffData = currentMonthData[staffId] || {};
    
    if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return;

    dispatch({
      type: 'UPDATE_LOCAL_INDIVIDUAL',
      payload: { key, staffId, day, value }
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    if (!pendingChanges.current[key][staffId]) pendingChanges.current[key][staffId] = {};
    pendingChanges.current[key][staffId][day] = value;

    triggerScheduleSave();
  }, [synthesizedSchedule, triggerScheduleSave]);

  const updateLocalShiftItem = useCallback((year, month, staffId, day, value) => {
    updateShiftItem(year, month, staffId, day, value);
  }, [updateShiftItem]);

  const updateShiftItems = useCallback(async (year, month, updates) => {
    if (!updates || updates.length === 0) return;
    const key = `${year}-${month}`;

    dispatch({
      type: 'UPDATE_LOCAL_INDIVIDUAL_BULK',
      payload: { key, updates }
    });

    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    updates.forEach(({ staffId, day, value }) => {
      if (!pendingChanges.current[key][staffId]) pendingChanges.current[key][staffId] = {};
      pendingChanges.current[key][staffId][day] = value;
    });

    triggerScheduleSave();
  }, [triggerScheduleSave]);

  const updateIndividualStatus = useCallback(async (staffId, year, month, statusField, value) => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const docRef = getIndividualDocRef(staffId, year, month);
    try {
      await setDoc(docRef, {
        [statusField]: value,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (e) {
      console.error("ステータス更新失敗:", e);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
    }
  }, []);

  const approveMemberShift = useCallback(async (staffId, year, month) => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const indDocRef = getIndividualDocRef(staffId, year, month);
    const summaryDocRef = getSummaryDocRef(year, month);

    try {
      const indSnap = await getDoc(indDocRef);
      if (!indSnap.exists()) {
        throw new Error("下書きデータが存在しません");
      }

      const indData = indSnap.data();
      const shifts = indData.scheduleData || {};

      const summarySnap = await getDoc(summaryDocRef);
      const existingSummary = summarySnap.exists() ? summarySnap.data() : { scheduleData: {} };

      const currentStaffSummary = existingSummary.scheduleData?.[staffId] || {};
      const updatedSummarySchedule = {
        ...(existingSummary.scheduleData || {}),
        [staffId]: {
          ...currentStaffSummary,
          ...shifts               
        }
      };

      await setDoc(summaryDocRef, {
        scheduleData: updatedSummarySchedule,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await setDoc(indDocRef, {
        shiftApproved: true,
        shiftRemanded: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch (e) {
      console.error("承認＆コピー処理失敗:", e);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
      throw e;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 7. 設定データの自動保存 (マスター管理用)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isInitialLoadComplete.current || !pendingConfigSave.current) return;
    if (debouncedSaveConfig.current) clearTimeout(debouncedSaveConfig.current);

    debouncedSaveConfig.current = setTimeout(async () => {
      console.log("[ConfigSave] マスタデータの保存処理を開始します");
      pendingConfigSave.current = false;
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' }); 
      
      try {
        let dataToSave = { 
          staff, tasks, shiftPatterns, adminConfig,
          updatedAt: new Date().toISOString()
        };

        await setDoc(configDocRef, dataToSave, { merge: true });
        console.log("[ConfigSave] マスタデータの保存が正常に完了しました！");
        
        lastServerConfigRef.current = {
            staff: dataToSave.staff, tasks: dataToSave.tasks, shiftPatterns: dataToSave.shiftPatterns,
            adminConfig: dataToSave.adminConfig, updatedAt: dataToSave.updatedAt
        };
        
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }); 
      } catch (error) {
        console.error("[ConfigSave ERROR] マスタデータの保存中にエラーが発生しました:", error);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' }); 
      }
    }, 500);

    return () => clearTimeout(debouncedSaveConfig.current);
  }, [staff, tasks, shiftPatterns, adminConfig]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (saveStatus !== 'saved' || pendingConfigSave.current) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  return {
    staff: synthesizedStaff, setStaff, 
    schedule: synthesizedSchedule, 
    updateShiftItem,
    updateLocalShiftItem,
    updateShiftItems,
    updateIndividualStatus,
    approveMemberShift,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, 
    setLoadingMessage: (msg) => dispatch({ type: 'SET_LOADING', payload: { isLoading, message: msg } }), 
    setIsLoading: (loading) => dispatch({ type: 'SET_LOADING', payload: { isLoading: loading } }),
    saveStatus, initialDataLoaded
  };
};
